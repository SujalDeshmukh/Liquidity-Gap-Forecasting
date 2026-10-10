/**
 * End-to-end API test against an in-memory MongoDB with the real synthetic dataset.
 * The ML service is mocked (the real model is integrated by the ML team - see docs/ML_CONTRACT.md).
 */
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

jest.mock('../../src/services/ml.client', () => {
  const actual = jest.requireActual('../../src/services/ml.client');
  return {
    ...actual,
    health: jest.fn(async () => ({ ok: true, model_loaded: false })),
    predict: jest.fn(async (txs) => ({
      model_version: 'jest-mock',
      is_stub: true,
      predictions: txs.map((t) => ({
        transaction_id: t.transaction_id,
        probability: t.type === 'Liability' ? 0.4 : 0.2,
        rationale: [{ feature: 'rate_difference_pct', value: t.interest_rate_pct - t.market_interest_rate_pct, impact: 0.12 }],
      })),
    })),
  };
});

const { createApp } = require('../../src/app');
const { User, PredictionRun } = require('../../src/models');
const cache = require('../../src/utils/cache');

const DATA = path.resolve(__dirname, '../../../sample-data');
const file = (name) => path.join(DATA, fs.readdirSync(DATA).find((f) => f.startsWith(name)));

let mongo;
let app;
let supportToken;
let sgToken;

async function login(userId, password = 'Secret!123', role) {
  return request(app).post('/api/auth/login').send({ userId, password, role });
}
async function waitForPredictions() {
  for (let i = 0; i < 100; i += 1) {
    const run = await PredictionRun.findOne().sort({ createdAt: -1 }).lean();
    if (run && run.status !== 'RUNNING') return run;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('prediction run did not finish');
}

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const hash = await User.hashPassword('Secret!123');
  await User.create([
    { userId: 'support', name: 'Support', role: 'SUPPORT', passwordHash: hash },
    { userId: 'sg', name: 'SG Analyst', role: 'LOCATION_USER', location: 'Singapore', passwordHash: hash },
  ]);
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('management endpoints', () => {
  test('GET /health', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('UP');
  });
  test('GET /health/db', async () => {
    const r = await request(app).get('/health/db');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

describe('authentication', () => {
  test('wrong password -> 401', async () => {
    expect((await login('support', 'nope')).status).toBe(401);
  });
  test('role mismatch on login screen -> 403', async () => {
    expect((await login('sg', 'Secret!123', 'SUPPORT')).status).toBe(403);
  });
  test('valid logins return JWT', async () => {
    const a = await login('support');
    const b = await login('SG', 'Secret!123', 'LOCATION_USER');
    expect(a.status).toBe(200);
    expect(b.body.user).toMatchObject({ role: 'LOCATION_USER', location: 'Singapore' });
    supportToken = a.body.token;
    sgToken = b.body.token;
  });
  test('protected route without token -> 401', async () => {
    expect((await request(app).get('/api/data/status')).status).toBe(401);
  });
});

describe('ingestion', () => {
  test('location user cannot upload', async () => {
    const r = await request(app).post('/api/data/upload/asset').set('Authorization', `Bearer ${sgToken}`).attach('file', file('asset_book'));
    expect(r.status).toBe(403);
  });
  test('rejects unsupported file type', async () => {
    const r = await request(app).post('/api/data/upload/asset').set('Authorization', `Bearer ${supportToken}`)
      .attach('file', Buffer.from('hello'), 'notes.txt');
    expect(r.status).toBe(400);
  });
  test('rejects an asset file uploaded as liabilities (header check)', async () => {
    const r = await request(app).post('/api/data/upload/liability').set('Authorization', `Bearer ${supportToken}`).attach('file', file('asset_book'));
    expect(r.status).toBe(400);
    expect(r.body.error.details.missing).toContain('Amount');
  });
  test('asset book: valid rows stored, invalid rows reported', async () => {
    const r = await request(app).post('/api/data/upload/asset').set('Authorization', `Bearer ${supportToken}`).attach('file', file('asset_book'));
    expect(r.status).toBe(201);
    expect(r.body.batch).toMatchObject({ acceptedRows: 753, rejectedRows: 2, status: 'ACTIVE' });
    expect(r.body.batch.asOfDate.slice(0, 10)).toBe('2026-10-10');
  });
  test('liability book + historical log', async () => {
    const l = await request(app).post('/api/data/upload/liability').set('Authorization', `Bearer ${supportToken}`).attach('file', file('liability_book'));
    expect(l.body.batch).toMatchObject({ acceptedRows: 1103, rejectedRows: 1 });
    const h = await request(app).post('/api/data/upload/historical').set('Authorization', `Bearer ${supportToken}`).attach('file', file('historical_log'));
    expect(h.body.batch).toMatchObject({ acceptedRows: 16179, rejectedRows: 7 });
    const run = await waitForPredictions();
    expect(run.status).toBe('COMPLETED');
    cache.clear();
  });
  test('rejection report downloadable as CSV', async () => {
    const list = await request(app).get('/api/data/batches').set('Authorization', `Bearer ${supportToken}`);
    const hist = list.body.items.find((b) => b.dataset === 'HISTORICAL');
    const r = await request(app).get(`/api/data/batches/${hist._id}/errors?format=csv`).set('Authorization', `Bearer ${supportToken}`);
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/32\/13\/2026/);
  });
});

describe('gap ladders', () => {
  const auth = () => ({ Authorization: `Bearer ${supportToken}` });

  test('deterministic ladder across all currencies is in reporting currency', async () => {
    const r = await request(app).get('/api/gap/deterministic/ladder').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.buckets.map((b) => b.key)).toEqual(['0-1M', '1-3M', '3-12M', '1-5Y', '>5Y']);
    expect(r.body.amountCurrency).toBe('EUR');
    expect(r.body.calculationDate.slice(0, 10)).toBe('2026-10-10');
    const sum = r.body.buckets.reduce((a, b) => a + b.assetCount + b.liabilityCount, 0);
    expect(sum).toBe(r.body.transactionCount);
  });
  test('single currency + location ladder is in native currency', async () => {
    const r = await request(app).get('/api/gap/deterministic/ladder?currency=USD&location=New%20York').set(auth());
    expect(r.body.amountCurrency).toBeNull();
    expect(r.body.breakdown.every((x) => x.currency === 'USD' && x.location === 'New York')).toBe(true);
  });
  test('drill-down returns transactions of the clicked bucket', async () => {
    const r = await request(app).get('/api/gap/deterministic/transactions?bucket=0-1M&limit=5').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeLessThanOrEqual(5);
    expect(r.body.items.every((i) => i.bucket === '0-1M')).toBe(true);
  });
  test('behavioural ladder moves cash into earlier buckets', async () => {
    const det = await request(app).get('/api/gap/deterministic/ladder').set(auth());
    const beh = await request(app).get('/api/gap/behavioural/ladder').set(auth());
    expect(beh.status).toBe(200);
    expect(beh.body.predictionCoverage.predicted).toBeGreaterThan(0);
    const short = (x) => x.body.buckets[0].assetCount + x.body.buckets[0].liabilityCount;
    expect(short(beh)).toBeGreaterThan(short(det));
  });
  test('rationale panel for a behavioural transaction', async () => {
    const list = await request(app).get('/api/gap/behavioural/transactions?limit=1').set(auth());
    const id = list.body.items[0].transactionId;
    const r = await request(app).get(`/api/gap/behavioural/rationale/${id}`).set(auth());
    expect(r.status).toBe(200);
    expect(r.body.features[0].feature).toBe('rate_difference_pct');
  });
  test('comparison + recommendations', async () => {
    const c = await request(app).get('/api/gap/compare?currency=EUR').set(auth());
    expect(c.status).toBe(200);
    expect(c.body.buckets[0]).toHaveProperty('deterministicGap');
    const r = await request(app).get('/api/recommendations').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.items.length).toBeGreaterThan(0);
  });
  test('what-if scenario', async () => {
    const r = await request(app).post('/api/scenario').set(auth()).send({
      currency: 'ALL',
      assetShift: { value: 2, unit: 'weeks', direction: 'later' },
      liabilityShift: { value: 1, unit: 'months', direction: 'earlier' },
    });
    expect(r.status).toBe(200);
    expect(r.body.buckets).toHaveLength(5);
    expect(typeof r.body.insight).toBe('string');
  });
  test('what-if needs at least one shift', async () => {
    const r = await request(app).post('/api/scenario').set(auth()).send({ currency: 'ALL' });
    expect(r.status).toBe(400);
  });
  test('excel export', async () => {
    const r = await request(app).get('/api/gap/deterministic/export.xlsx').set(auth()).buffer(true).parse((res, cb) => {
      const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(r.status).toBe(200);
    expect(r.body.slice(0, 2).toString()).toBe('PK');
  });
  test('historical analytics', async () => {
    const r = await request(app).get('/api/analytics/behaviour?dimension=customerSegment').set(auth());
    expect(r.status).toBe(200);
    expect(r.body.summary.earlyExitRatePct).toBeGreaterThan(20);
    expect(r.body.trend.series).toEqual(['Corporate', 'Institutional', 'Retail', 'SME']);
  });
});

describe('location-based access', () => {
  const sg = () => ({ Authorization: `Bearer ${sgToken}` });
  test('Singapore user sees only Singapore', async () => {
    const r = await request(app).get('/api/gap/deterministic/ladder').set(sg());
    expect(r.status).toBe(200);
    expect(r.body.location).toBe('Singapore');
    expect(r.body.breakdown.every((x) => x.location === 'Singapore')).toBe(true);
  });
  test('Singapore user cannot request London', async () => {
    const r = await request(app).get('/api/gap/deterministic/ladder?location=London').set(sg());
    expect(r.status).toBe(403);
  });
  test('Singapore user cannot read London analytics', async () => {
    const r = await request(app).get('/api/analytics/behaviour?location=London').set(sg());
    expect(r.status).toBe(403);
  });
});
