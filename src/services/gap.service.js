'use strict';
/**
 * Ladder orchestration: resolve active data, pick the settlement rule for the view,
 * cache the result (keyed by batch ids + filters) and serve drill-downs from that cache.
 */
const config = require('../config');
const cache = require('../utils/cache');
const AppError = require('../utils/AppError');
const { LADDER_MODES, BUCKET_KEYS } = require('../config/constants');
const { toISODate } = require('../utils/dates');
const { requireBookBatches, loadBooks } = require('./dataset.service');
const { buildLadder, contractualSettle } = require('./ladder');
const { adjustedMaturity } = require('./behavioural');

function behaviouralSettle(txn, calcDate) {
  const adj = adjustedMaturity(txn, calcDate);
  return {
    date: adj.adjustedMaturityDate,
    meta: {
      probability: adj.probability,
      daysEarlier: adj.daysEarlier,
      pctEarly: Math.round(adj.pctEarly * 1000) / 10,
      hasPrediction: adj.probability !== null,
      modelVersion: txn.prediction ? txn.prediction.modelVersion : null,
      isStub: txn.prediction ? Boolean(txn.prediction.isStub) : null,
    },
  };
}

function predictionCoverage(books) {
  const all = [...books.assets, ...books.liabilities];
  const predicted = all.filter((t) => t.prediction && typeof t.prediction.probability === 'number');
  const versions = [...new Set(predicted.map((t) => t.prediction.modelVersion))];
  return {
    total: all.length,
    predicted: predicted.length,
    modelVersions: versions,
    isStub: predicted.some((t) => t.prediction.isStub),
  };
}

/**
 * @param {object} q { mode, calculationDate?, currency, location }
 * @returns full ladder incl. rows (internal); controllers strip rows for the chart payload.
 */
async function getLadder({ mode = LADDER_MODES.DETERMINISTIC, calculationDate, currency = 'ALL', location = 'ALL' }) {
  if (!Object.values(LADDER_MODES).includes(mode)) throw AppError.badRequest(`Unknown mode ${mode}`);
  const active = await requireBookBatches();
  // Default calculation date = as-of date of the latest book refresh (PS: "last run date of data ingestion")
  const defaultCalc = new Date(Math.max(active.ASSET.asOfDate, active.LIABILITY.asOfDate));
  const calcDate = calculationDate || defaultCalc;

  const key = [
    'ladder', mode, active.ASSET._id, active.LIABILITY._id, toISODate(calcDate), currency, location,
    mode === LADDER_MODES.BEHAVIOURAL ? config.calc.behaviouralMode : '',
  ].join(':');

  return cache.wrap(key, async () => {
    const books = await loadBooks(active, { currency, location });
    if (mode === LADDER_MODES.BEHAVIOURAL) {
      const coverage = predictionCoverage(books);
      if (coverage.total > 0 && coverage.predicted === 0) {
        throw AppError.conflict('No behavioural predictions yet. Run predictions from Data Management (or check the ML service).');
      }
      const ladder = buildLadder({
        ...books, calcDate, settle: behaviouralSettle, convert: currency === 'ALL', reportingCurrency: config.calc.reportingCurrency,
      });
      return { ...ladder, mode, currency, location, predictionCoverage: coverage, adjustmentMode: config.calc.behaviouralMode };
    }
    const ladder = buildLadder({
      ...books, calcDate, settle: contractualSettle, convert: currency === 'ALL', reportingCurrency: config.calc.reportingCurrency,
    });
    return { ...ladder, mode, currency, location };
  });
}

/** Chart payload: everything except the per-transaction rows. */
function summarise(ladder) {
  const { rows, ...rest } = ladder;
  return { ...rest, transactionCount: rows.length };
}

/**
 * Paginated drill-down served from the cached ladder (stays fast at 50K rows).
 * @param {object} q { bucket?, side?, search?, page, limit, sort }
 */
function drillDown(ladder, { bucket, side, search, page = 1, limit = 25, sort = 'cashflow', order = 'desc' }) {
  if (bucket && !BUCKET_KEYS.includes(bucket)) throw AppError.badRequest(`Unknown bucket ${bucket}`);
  let rows = ladder.rows;
  if (bucket) rows = rows.filter((r) => r.bucket === bucket);
  if (side) rows = rows.filter((r) => r.side === side);
  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter((r) => r.transactionId.toLowerCase().includes(s) || r.customerId.toLowerCase().includes(s));
  }
  const dir = order === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort]; const bv = b[sort];
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return av > bv ? dir : -dir;
  });
  const start = (page - 1) * limit;
  return { total: sorted.length, page, limit, items: sorted.slice(start, start + limit) };
}

/** Deterministic vs behavioural net gap per bucket for the comparison view. */
async function compare(filters) {
  const [det, beh] = await Promise.all([
    getLadder({ ...filters, mode: LADDER_MODES.DETERMINISTIC }),
    getLadder({ ...filters, mode: LADDER_MODES.BEHAVIOURAL }),
  ]);
  const buckets = det.buckets.map((d, i) => {
    const b = beh.buckets[i];
    return {
      key: d.key, label: d.label,
      deterministicGap: d.netGap, behaviouralGap: b.netGap, difference: Math.round((b.netGap - d.netGap) * 100) / 100,
      deterministic: { assets: d.assets, liabilities: d.liabilities },
      behavioural: { assets: b.assets, liabilities: b.liabilities },
    };
  });
  return {
    calculationDate: det.calculationDate, currency: det.currency, location: det.location,
    amountCurrency: det.amountCurrency, buckets,
    totals: { deterministicGap: det.totals.netGap, behaviouralGap: beh.totals.netGap },
    predictionCoverage: beh.predictionCoverage,
    det, beh,
  };
}

module.exports = { getLadder, summarise, drillDown, compare, behaviouralSettle };
