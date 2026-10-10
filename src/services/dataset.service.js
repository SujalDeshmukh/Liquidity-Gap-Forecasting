'use strict';
/** Reads from the ACTIVE batch of each dataset, applying the caller's location scope. */
const { Asset, Liability, HistoricalLog, UploadBatch } = require('../models');
const { DATASETS } = require('../config/constants');
const AppError = require('../utils/AppError');

async function getActiveBatches() {
  const batches = await UploadBatch.find({ status: 'ACTIVE' }).select('-rowErrors').lean();
  const byDataset = {};
  for (const b of batches) byDataset[b.dataset] = b;
  return byDataset;
}

async function requireBookBatches() {
  const active = await getActiveBatches();
  const missing = [DATASETS.ASSET, DATASETS.LIABILITY].filter((d) => !active[d]);
  if (missing.length) {
    throw AppError.conflict(`Upload the ${missing.map((m) => m.toLowerCase()).join(' and ')} book before viewing the ladder`);
  }
  return active;
}

/** Mongo filter for location / currency; `null` or 'ALL' means unrestricted. */
function buildFilter({ location, currency }) {
  const f = {};
  if (location && location !== 'ALL') f.location = location;
  if (currency && currency !== 'ALL') f.currency = currency;
  return f;
}

const BOOK_PROJECTION = '-_id -createdAt -updatedAt -batchId';

async function loadBooks(active, filters) {
  const f = buildFilter(filters);
  const [assets, liabilities] = await Promise.all([
    Asset.find({ batchId: active.ASSET._id, ...f }).select(BOOK_PROJECTION).lean(),
    Liability.find({ batchId: active.LIABILITY._id, ...f }).select(BOOK_PROJECTION).lean(),
  ]);
  return { assets, liabilities };
}

async function loadHistorical(active, filters) {
  if (!active.HISTORICAL) throw AppError.conflict('Upload the historical log to view behavioural analytics');
  return HistoricalLog.find({ batchId: active.HISTORICAL._id, ...buildFilter(filters) })
    .select('-_id -createdAt -updatedAt -batchId')
    .lean();
}

module.exports = { getActiveBatches, requireBookBatches, loadBooks, loadHistorical, buildFilter };
