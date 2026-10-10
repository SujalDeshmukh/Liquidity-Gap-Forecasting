const { generateRecommendations, formatAmount } = require('../../src/services/recommendation.service');
const { outflowAnomalies, earlyExitTrend } = require('../../src/services/analytics.service');
const { parseISODate: d, addDays } = require('../../src/utils/dates');

const bucketsWith = (gaps) =>
  ['0-1M', '1-3M', '3-12M', '1-5Y', '>5Y'].map((key, i) => ({
    key, label: key, netGap: gaps[i], assets: Math.max(gaps[i], 0) + 10e6, liabilities: Math.max(-gaps[i], 0) + 10e6,
  }));

describe('recommendation engine', () => {
  const beh = { breakdown: [{ currency: 'EUR', location: 'Paris', buckets: bucketsWith([-5e6, 0, 8e6, 0, 0]) }] };
  const det = { breakdown: [{ currency: 'EUR', location: 'Paris', buckets: bucketsWith([-1e6, 0, 8e6, 0, 0]) }] };
  const recos = generateRecommendations(beh, det, { minGap: 1e6, roundTo: 1e5 });

  test('funding action for shortfall, investment for surplus', () => {
    expect(recos).toHaveLength(2);
    expect(recos.find((r) => r.bucket === '0-1M')).toMatchObject({ type: 'FUNDING', action: expect.stringContaining('Raise short-term funding') });
    expect(recos.find((r) => r.bucket === '3-12M').action).toBe('Invest surplus in 6M Treasury – EUR 8.0M');
  });
  test('rationale explains behavioural vs contractual difference', () => {
    expect(recos.find((r) => r.bucket === '0-1M').rationale).toMatch(/worsens this bucket/);
  });
  test('formats amounts', () => {
    expect(formatAmount(-5_200_000, 'EUR')).toBe('EUR 5.2M');
    expect(formatAmount(1_250_000_000, 'USD')).toBe('USD 1.25B');
  });
});

describe('analytics', () => {
  test('flags an outflow spike against the rolling average', () => {
    const records = [];
    for (let i = 0; i < 60; i += 1) {
      records.push({ type: 'Liability', amount: 100, currency: 'EUR', actualClosureDate: addDays(d('2026-01-01'), i) });
    }
    records.push({ type: 'Liability', amount: 500, currency: 'EUR', actualClosureDate: addDays(d('2026-01-01'), 59) });
    const r = outflowAnomalies(records, { windowDays: 30, multiplier: 3 });
    expect(r.anomalies).toHaveLength(1);
    expect(r.anomalies[0].message).toMatch(/6x higher than 30-day average/);
  });
  test('early exit trend by product', () => {
    const t = earlyExitTrend([
      { productType: 'A', actualClosureDate: d('2026-01-05'), earlyExit: true },
      { productType: 'A', actualClosureDate: d('2026-01-20'), earlyExit: false },
    ]);
    expect(t.points[0]).toEqual({ month: '2026-01', A: 50 });
  });
});
