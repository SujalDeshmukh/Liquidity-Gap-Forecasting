'use strict';
const AppError = require('../utils/AppError');
const { Asset, Liability } = require('../models');
const gap = require('../services/gap.service');
const { generateRecommendations } = require('../services/recommendation.service');
const { buildWorkbook } = require('../services/export.service');
const { audit } = require('../services/audit.service');
const { toISODate } = require('../utils/dates');

/** Merge validated query with the RBAC-enforced location (never trust the raw query param). */
const filtersOf = (req) => ({ ...req.valid.query, location: req.scope.location });

async function ladder(req, res) {
  const mode = req.params.mode;
  const l = await gap.getLadder({ ...filtersOf(req), mode });
  res.json(gap.summarise(l));
}

async function transactions(req, res) {
  const l = await gap.getLadder({ ...filtersOf(req), mode: req.params.mode });
  res.json(gap.drillDown(l, req.valid.query));
}

/** Per-transaction rationale panel for the behavioural drill-down. */
async function rationale(req, res) {
  const l = await gap.getLadder({ ...filtersOf(req), mode: 'behavioural' });
  const row = l.rows.find((r) => r.transactionId === req.params.transactionId);
  if (!row) throw AppError.notFound('Transaction not found in your current view');
  const Model = row.side === 'Asset' ? Asset : Liability;
  const doc = await Model.findOne({ transactionId: row.transactionId, location: row.location })
    .sort({ createdAt: -1 }).select('prediction tenorDays').lean();
  res.json({
    transactionId: row.transactionId,
    side: row.side,
    probability: row.probability,
    contractualMaturityDate: row.contractualMaturityDate,
    adjustedMaturityDate: row.effectiveMaturityDate,
    contractualBucket: row.contractualBucket,
    adjustedBucket: row.bucket,
    daysEarlier: row.daysEarlier,
    pctEarly: row.pctEarly,
    rateDifferencePct: Math.round((row.interestRatePct - row.marketInterestRatePct) * 10000) / 10000,
    tenorDays: doc ? doc.tenorDays : null,
    modelVersion: doc?.prediction?.modelVersion || null,
    isStub: Boolean(doc?.prediction?.isStub),
    features: doc?.prediction?.rationale || [],
  });
}

async function compare(req, res) {
  const c = await gap.compare(filtersOf(req));
  const recos = generateRecommendations(c.beh, c.det);
  const { det, beh, ...rest } = c;
  // Attach bucket-level recommendations for click-through on the comparison chart
  rest.buckets = rest.buckets.map((b) => ({ ...b, recommendations: recos.filter((r) => r.bucket === b.key) }));
  res.json(rest);
}

async function recommendations(req, res) {
  const c = await gap.compare(filtersOf(req));
  res.json({
    calculationDate: c.calculationDate, currency: c.currency, location: c.location,
    items: generateRecommendations(c.beh, c.det),
  });
}

async function exportXlsx(req, res) {
  const mode = req.params.mode;
  const filters = filtersOf(req);
  const l = await gap.getLadder({ ...filters, mode });
  let recos;
  try {
    const c = await gap.compare(filters);
    recos = generateRecommendations(c.beh, c.det);
  } catch (_) {
    recos = undefined; // no predictions yet - export the ladder without recommendations
  }
  const buf = buildWorkbook({ ladder: l, recommendations: recos });
  audit(req, 'EXPORT', { mode, ...filters });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="liquidplus_${mode}_${toISODate(l.calculationDate)}.xlsx"`);
  res.send(buf);
}

module.exports = { ladder, transactions, rationale, compare, recommendations, exportXlsx };
