'use strict';
/**
 * What-if tenor shifts (PS VII.xiii): re-bucket on shifted contractual maturities.
 * No ML involved. Shifting earlier than the calculation date clamps to the calculation date
 * (the cash would move "now", i.e. in 0-1M). Interest is re-accrued to the shifted date.
 */
const config = require('../config');
const cache = require('../utils/cache');
const { requireBookBatches, loadBooks } = require('./dataset.service');
const { buildLadder, contractualSettle } = require('./ladder');
const { shiftDate, utcMidnight, toISODate } = require('../utils/dates');

/** shift = { value, unit: days|weeks|months|years, direction: earlier|later, productTypes?: string[] } */
function makeShifter(shift) {
  if (!shift || !shift.value) return null;
  const signed = shift.direction === 'earlier' ? -Math.abs(shift.value) : Math.abs(shift.value);
  const scope = shift.productTypes && shift.productTypes.length ? new Set(shift.productTypes) : null;
  return (txn, calc) => {
    if (scope && !scope.has(txn.productType)) return contractualSettle(txn);
    let d = shiftDate(txn.maturityDate, signed, shift.unit);
    if (d < calc) d = utcMidnight(calc);
    return { date: d, meta: { shiftedBy: `${signed > 0 ? '+' : ''}${signed} ${shift.unit}` } };
  };
}

async function runScenario({ calculationDate, currency = 'ALL', location = 'ALL', assetShift, liabilityShift }) {
  const active = await requireBookBatches();
  const calcDate = calculationDate || new Date(Math.max(active.ASSET.asOfDate, active.LIABILITY.asOfDate));
  const books = await loadBooks(active, { currency, location });
  const common = { calcDate, convert: currency === 'ALL', reportingCurrency: config.calc.reportingCurrency };

  const baseKey = ['ladder', 'deterministic', active.ASSET._id, active.LIABILITY._id, toISODate(calcDate), currency, location, ''].join(':');
  const base = cache.get(baseKey) || buildLadder({ ...books, ...common, settle: contractualSettle });

  const assetShifter = makeShifter(assetShift);
  const liabilityShifter = makeShifter(liabilityShift);
  const scenario = buildLadder({
    ...common,
    // Tag side so the shared settle function knows which shifter applies
    assets: books.assets.map((a) => ({ ...a, __side: 'A' })),
    liabilities: books.liabilities.map((l) => ({ ...l, __side: 'L' })),
    settle: (txn, calc) => {
      const fn = txn.__side === 'A' ? assetShifter : liabilityShifter;
      return fn ? fn(txn, calc) : contractualSettle(txn);
    },
  });

  const buckets = base.buckets.map((b, i) => {
    const s = scenario.buckets[i];
    return {
      key: b.key, label: b.label,
      baseGap: b.netGap, scenarioGap: s.netGap, change: Math.round((s.netGap - b.netGap) * 100) / 100,
      base: { assets: b.assets, liabilities: b.liabilities }, scenario: { assets: s.assets, liabilities: s.liabilities },
    };
  });
  const totalChange = scenario.totals.netGap - base.totals.netGap;
  return {
    calculationDate: calcDate, currency, location, amountCurrency: base.amountCurrency,
    assetShift: assetShift || null, liabilityShift: liabilityShift || null,
    buckets,
    totals: { baseGap: base.totals.netGap, scenarioGap: scenario.totals.netGap, change: Math.round(totalChange * 100) / 100 },
    insight: buildInsight(buckets, base.amountCurrency || (currency !== 'ALL' ? currency : null)),
  };
}

const fmt = (n, ccy) => `${ccy || ''} ${(n / 1e6).toFixed(1)}M`.trim();

/**
 * Plain-language summary. Tenor shifts mostly move cash between buckets (the all-bucket total
 * only changes by re-accrued interest), so the insight talks about where cash moved.
 */
function buildInsight(buckets, ccy) {
  const shortTerm = buckets.slice(0, 2).reduce((acc, b) => acc + b.change, 0);
  const worst = [...buckets].sort((a, b) => a.change - b.change)[0];
  const best = [...buckets].sort((a, b) => b.change - a.change)[0];
  const parts = [];
  if (Math.abs(shortTerm) > 0.5) {
    parts.push(`Short-term (0–3M) net gap ${shortTerm < 0 ? 'worsens' : 'improves'} by ${fmt(Math.abs(shortTerm), ccy)}.`);
  } else {
    parts.push('Short-term (0–3M) net gap is unchanged.');
  }
  if (worst && worst.change < 0) parts.push(`Largest deterioration: ${worst.label} (${fmt(worst.change, ccy)}).`);
  if (best && best.change > 0) parts.push(`Largest improvement: ${best.label} (+${fmt(best.change, ccy)}).`);
  return parts.join(' ');
}

module.exports = { runScenario, makeShifter };
