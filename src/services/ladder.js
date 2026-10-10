'use strict';
/**
 * Pure ladder engine - no I/O, fully unit-testable.
 * The three views (deterministic, behavioural, what-if) differ only in the function that
 * gives each transaction its effective settlement date; everything else is shared.
 */
const { BUCKETS } = require('../config/constants');
const { bucketBoundaries, assignBucket } = require('./bucketing');
const { cashflowAt, round2 } = require('./interest');
const { toReporting } = require('../config/fx');
const { utcMidnight } = require('../utils/dates');

const emptyBucketRow = () =>
  Object.fromEntries(BUCKETS.map((b) => [b.key, { assets: 0, liabilities: 0, assetCount: 0, liabilityCount: 0 }]));

function finaliseBuckets(acc) {
  return BUCKETS.map((b) => {
    const v = acc[b.key];
    return {
      key: b.key,
      label: b.label,
      assets: round2(v.assets),
      liabilities: round2(v.liabilities),
      netGap: round2(v.assets - v.liabilities),
      assetCount: v.assetCount,
      liabilityCount: v.liabilityCount,
    };
  });
}

/**
 * @param {object} p
 * @param {Array} p.assets      normalised asset docs (lean)
 * @param {Array} p.liabilities normalised liability docs (lean)
 * @param {Date}  p.calcDate
 * @param {(txn, calcDate) => {date: Date, meta?: object}} p.settle effective settlement date per txn
 * @param {boolean} p.convert   true when the view spans currencies (sum in reporting currency)
 * @param {string}  p.reportingCurrency
 */
function buildLadder({ assets, liabilities, calcDate, settle, convert, reportingCurrency }) {
  const calc = utcMidnight(calcDate);
  const boundaries = bucketBoundaries(calc);
  const totalAcc = emptyBucketRow();
  const breakdownAcc = new Map(); // "CCY|Location" -> bucket accumulator (native currency)
  const rows = [];
  const excluded = { notYetBooked: 0, maturedBeforeCalcDate: 0 };

  const process = (txn, side) => {
    // Live as of the calculation date: booked on/before it and not yet contractually matured
    if (utcMidnight(txn.transactionDate) > calc) { excluded.notYetBooked += 1; return; }
    if (utcMidnight(txn.maturityDate) < calc) { excluded.maturedBeforeCalcDate += 1; return; }

    const { date: effective, meta = {} } = settle(txn, calc);
    const bucket = assignBucket(effective, calc, boundaries);
    if (!bucket) { excluded.maturedBeforeCalcDate += 1; return; }

    const cf = cashflowAt(txn, effective);
    const value = convert ? toReporting(cf.total, txn.currency) : cf.total;
    const isAsset = side === 'Asset';

    const t = totalAcc[bucket];
    if (isAsset) { t.assets += value; t.assetCount += 1; } else { t.liabilities += value; t.liabilityCount += 1; }

    const key = `${txn.currency}|${txn.location}`;
    if (!breakdownAcc.has(key)) breakdownAcc.set(key, emptyBucketRow());
    const b = breakdownAcc.get(key)[bucket];
    if (isAsset) { b.assets += cf.total; b.assetCount += 1; } else { b.liabilities += cf.total; b.liabilityCount += 1; }

    rows.push({
      transactionId: txn.transactionId,
      side,
      customerId: txn.customerId,
      entity: txn.entity,
      location: txn.location,
      currency: txn.currency,
      productType: txn.productType,
      customerSegment: txn.customerSegment,
      clientRating: txn.clientRating,
      interestRatePct: txn.interestRatePct,
      marketInterestRatePct: txn.marketInterestRatePct,
      transactionDate: txn.transactionDate,
      contractualMaturityDate: txn.maturityDate,
      contractualBucket: assignBucket(txn.maturityDate, calc, boundaries),
      effectiveMaturityDate: effective,
      bucket,
      principal: round2(cf.principal),
      interest: round2(cf.interest),
      cashflow: round2(cf.total),
      cashflowReporting: round2(value),
      ...meta,
    });
  };

  assets.forEach((a) => process(a, 'Asset'));
  liabilities.forEach((l) => process(l, 'Liability'));

  const buckets = finaliseBuckets(totalAcc);
  const totals = buckets.reduce(
    (acc, b) => ({ assets: acc.assets + b.assets, liabilities: acc.liabilities + b.liabilities, netGap: acc.netGap + b.netGap }),
    { assets: 0, liabilities: 0, netGap: 0 }
  );

  const breakdown = [...breakdownAcc.entries()]
    .map(([key, acc]) => {
      const [currency, location] = key.split('|');
      return { currency, location, buckets: finaliseBuckets(acc) };
    })
    .sort((a, b) => a.currency.localeCompare(b.currency) || a.location.localeCompare(b.location));

  return {
    calculationDate: calc,
    amountCurrency: convert ? reportingCurrency : null, // null = native currency of the filter
    buckets,
    totals: { assets: round2(totals.assets), liabilities: round2(totals.liabilities), netGap: round2(totals.netGap) },
    breakdown,
    excluded,
    rows,
  };
}

/** Contractual settlement: deterministic view. */
const contractualSettle = (txn) => ({ date: utcMidnight(txn.maturityDate) });

module.exports = { buildLadder, contractualSettle };
