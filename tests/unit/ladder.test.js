const { parseISODate: d, toISODate } = require('../../src/utils/dates');
const { assignBucket } = require('../../src/services/bucketing');
const { simpleInterest } = require('../../src/services/interest');
const { buildLadder, contractualSettle } = require('../../src/services/ladder');
const { adjustedMaturity } = require('../../src/services/behavioural');
const { makeShifter } = require('../../src/services/scenario.service');

const calc = d('2026-10-10');

describe('bucketing', () => {
  test.each([
    ['2026-10-10', '0-1M'], // same-day maturity
    ['2026-11-10', '0-1M'], // exactly on the 1M boundary stays in nearer bucket
    ['2026-11-11', '1-3M'],
    ['2027-01-10', '1-3M'],
    ['2027-10-10', '3-12M'],
    ['2031-10-10', '1-5Y'],
    ['2031-10-11', '>5Y'],
  ])('%s -> %s', (m, bucket) => expect(assignBucket(d(m), calc)).toBe(bucket));
  test('matured before calc date -> null', () => expect(assignBucket(d('2026-10-09'), calc)).toBeNull());
});

describe('simple interest', () => {
  test('principal x rate x days / 365', () => {
    expect(simpleInterest(1_000_000, 5, d('2026-01-01'), d('2027-01-01'))).toBeCloseTo(50_000, 6);
    expect(simpleInterest(365_000, 10, d('2026-01-01'), d('2026-01-11'))).toBeCloseTo(1_000, 6);
  });
});

const txn = (id, maturity, over = {}) => ({
  transactionId: id, customerId: 'CUS-1', entity: 'IBC UK', location: 'London', currency: 'GBP', amount: 1_000_000,
  interestRatePct: 0, marketInterestRatePct: 0, productType: 'X', customerSegment: 'SME', clientRating: 3,
  transactionDate: d('2026-01-01'), maturityDate: d(maturity), ...over,
});

describe('ladder engine', () => {
  const ladder = buildLadder({
    assets: [txn('AST-1', '2026-10-20'), txn('AST-2', '2030-01-01'), txn('AST-3', '2026-09-01'), txn('AST-4', '2027-01-01', { transactionDate: d('2026-12-01') })],
    liabilities: [txn('LIA-1', '2026-10-25', { amount: 3_000_000 }), txn('LIA-2', '2026-12-01')],
    calcDate: calc, settle: contractualSettle, convert: false, reportingCurrency: 'EUR',
  });
  test('net gap = assets - liabilities per bucket', () => {
    const b = Object.fromEntries(ladder.buckets.map((x) => [x.key, x]));
    expect(b['0-1M']).toMatchObject({ assets: 1_000_000, liabilities: 3_000_000, netGap: -2_000_000 });
    expect(b['1-3M'].netGap).toBe(-1_000_000);
    expect(b['1-5Y'].netGap).toBe(1_000_000);
    expect(b['3-12M'].netGap).toBe(0); // zero-gap bucket edge case
  });
  test('excludes matured and not-yet-booked transactions', () => {
    expect(ladder.excluded).toEqual({ maturedBeforeCalcDate: 1, notYetBooked: 1 });
  });
  test('breakdown per currency and location', () => {
    expect(ladder.breakdown).toHaveLength(1);
    expect(ladder.breakdown[0]).toMatchObject({ currency: 'GBP', location: 'London' });
  });
});

describe('behavioural adjustment', () => {
  const t = txn('AST-9', '2027-10-10', { prediction: { probability: 0.5 } }); // 365 days remaining
  test('linear: shifts earlier by p x remaining tenor', () => {
    const r = adjustedMaturity(t, calc, { mode: 'linear', factor: 1 });
    expect(r.daysEarlier).toBe(183);
    expect(toISODate(r.adjustedMaturityDate)).toBe('2027-04-10');
  });
  test('threshold: below threshold leaves contract untouched', () => {
    const r = adjustedMaturity({ ...t, prediction: { probability: 0.3 } }, calc, { mode: 'threshold', threshold: 0.5 });
    expect(r.daysEarlier).toBe(0);
  });
  test('no prediction = contractual maturity', () => {
    expect(adjustedMaturity(txn('A', '2027-10-10'), calc).daysEarlier).toBe(0);
  });
  test('never earlier than calculation date', () => {
    const r = adjustedMaturity({ ...t, prediction: { probability: 1 } }, calc, { mode: 'linear', factor: 2 });
    expect(toISODate(r.adjustedMaturityDate)).toBe('2026-10-10');
  });
});

describe('what-if shifter', () => {
  test('1 month earlier, clamped to calc date', () => {
    const shift = makeShifter({ value: 1, unit: 'months', direction: 'earlier' });
    expect(toISODate(shift(txn('L', '2026-12-15'), calc).date)).toBe('2026-11-15');
    expect(toISODate(shift(txn('L', '2026-10-20'), calc).date)).toBe('2026-10-10');
  });
  test('product scope only shifts matching products', () => {
    const shift = makeShifter({ value: 2, unit: 'weeks', direction: 'later', productTypes: ['Y'] });
    expect(toISODate(shift(txn('A', '2026-12-15'), calc).date)).toBe('2026-12-15');
  });
});
