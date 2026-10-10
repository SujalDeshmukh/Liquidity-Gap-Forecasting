'use strict';
const AppError = require('../utils/AppError');
const { DATASETS, ENTITIES, LOCATIONS, CURRENCIES, SEGMENTS, LOAN_TYPES, PRODUCT_TYPES, BUCKETS, ROLES } = require('../config/constants');
const { UploadBatch, Asset, Liability, HistoricalLog } = require('../models');
const { ingest } = require('../services/ingestion.service');
const { getActiveBatches, buildFilter } = require('../services/dataset.service');
const predictions = require('../services/prediction.service');
const { audit } = require('../services/audit.service');
const { parseISODate } = require('../utils/dates');
const config = require('../config');

const DATASET_PARAM = { asset: DATASETS.ASSET, liability: DATASETS.LIABILITY, historical: DATASETS.HISTORICAL };

async function upload(req, res) {
  const dataset = DATASET_PARAM[req.params.dataset];
  if (!dataset) throw AppError.badRequest('Dataset must be one of asset, liability, historical');
  if (!req.file) throw AppError.badRequest('Attach the file in a form field named "file"');
  let asOfDate;
  if (req.body.asOfDate) {
    asOfDate = parseISODate(req.body.asOfDate);
    if (!asOfDate) throw AppError.badRequest('asOfDate must be YYYY-MM-DD');
  }
  const result = await ingest({
    dataset,
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    asOfDate,
    uploadedBy: req.user.userId,
  });
  audit(req, 'UPLOAD', { dataset, fileName: req.file.originalname, accepted: result.acceptedRows, rejected: result.rejectedRows });

  // New book data -> refresh behavioural predictions in the background (non-blocking).
  let prediction = null;
  if (result.status === 'ACTIVE' && dataset !== DATASETS.HISTORICAL) {
    prediction = await predictions.startRun(`auto:${req.user.userId}`).catch((err) => ({ error: err.message }));
  }
  res.status(result.status === 'ACTIVE' ? 201 : 422).json({ batch: result, prediction });
}

async function listBatches(req, res) {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const batches = await UploadBatch.find().select('-rowErrors').sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ items: batches });
}

async function batchErrors(req, res) {
  const batch = await UploadBatch.findById(req.params.id).select('fileName dataset rowErrors rowErrorsTruncated').lean();
  if (!batch) throw AppError.notFound('Upload not found');
  if (req.query.format === 'csv') {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['row,transaction_id,field,message,value', ...batch.rowErrors.map((e) => [e.row, e.transactionId, e.field, e.message, e.value].map(esc).join(','))];
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="rejected_rows_${batch.dataset.toLowerCase()}.csv"`);
    return res.send(lines.join('\n'));
  }
  return res.json(batch);
}

async function status(req, res) {
  const [active, run] = await Promise.all([getActiveBatches(), predictions.latestRun()]);
  res.json({ active, latestPredictionRun: run });
}

/** Paged preview of stored rows (Data Preview tab), location-scoped. */
async function preview(req, res) {
  const dataset = DATASET_PARAM[req.params.dataset];
  if (!dataset) throw AppError.badRequest('Dataset must be one of asset, liability, historical');
  const active = await getActiveBatches();
  if (!active[dataset]) return res.json({ total: 0, items: [] });
  const Model = { ASSET: Asset, LIABILITY: Liability, HISTORICAL: HistoricalLog }[dataset];
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 25), 200);
  const filter = { batchId: active[dataset]._id, ...buildFilter({ location: req.scope.location, currency: req.query.currency }) };
  const [total, items] = await Promise.all([
    Model.countDocuments(filter),
    Model.find(filter).select('-_id -batchId -createdAt -updatedAt -prediction.rationale').sort({ transactionId: 1 })
      .skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json({ total, page, limit, items });
}

async function runPredictions(req, res) {
  const result = await predictions.startRun(req.user.userId);
  if (!result.run) throw AppError.conflict(result.reason || 'Could not start predictions');
  audit(req, 'PREDICTION_RUN', { runId: result.run._id, started: result.started });
  res.status(result.started ? 202 : 200).json(result);
}

async function latestPrediction(_req, res) {
  res.json({ run: await predictions.latestRun() });
}

function meta(req, res) {
  res.json({
    entities: ENTITIES,
    locations: req.user.role === ROLES.SUPPORT ? LOCATIONS : [req.user.location],
    currencies: CURRENCIES,
    segments: SEGMENTS,
    loanTypes: LOAN_TYPES,
    productTypes: PRODUCT_TYPES,
    buckets: BUCKETS.map(({ key, label }) => ({ key, label })),
    reportingCurrency: config.calc.reportingCurrency,
    behaviouralAdjustmentMode: config.calc.behaviouralMode,
  });
}

module.exports = { upload, listBatches, batchErrors, status, preview, runPredictions, latestPrediction, meta };
