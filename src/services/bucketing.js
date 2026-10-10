'use strict';
/**
 * Maturity bucketing relative to a calculation date.
 *   0-1M  : calcDate <= maturity <= calcDate + 1 month   (same-day maturities land here)
 *   1-3M  : (calc+1M, calc+3M]
 *   3-12M : (calc+3M, calc+12M]
 *   1-5Y  : (calc+12M, calc+60M]
 *   >5Y   : beyond calc+60M
 * Upper bounds are inclusive so a maturity exactly on a boundary stays in the nearer bucket
 * (PS edge case: "transactions maturing on the same date (bucket boundary)").
 * Months are calendar months, clamped to month-end.
 */
const { BUCKETS } = require('../config/constants');
const { addMonths, utcMidnight } = require('../utils/dates');

function bucketBoundaries(calcDate) {
  const c = utcMidnight(calcDate);
  return BUCKETS.map((b) => ({ ...b, end: Number.isFinite(b.months) ? addMonths(c, b.months) : null }));
}

/** @returns bucket key, or null when the maturity is before the calculation date. */
function assignBucket(maturityDate, calcDate, boundaries = bucketBoundaries(calcDate)) {
  const m = utcMidnight(maturityDate);
  if (m < utcMidnight(calcDate)) return null;
  for (const b of boundaries) {
    if (b.end === null || m <= b.end) return b.key;
  }
  return null;
}

module.exports = { bucketBoundaries, assignBucket };
