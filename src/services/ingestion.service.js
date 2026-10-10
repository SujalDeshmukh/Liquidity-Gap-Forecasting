'use strict';
/**
 * Upload pipeline: parse -> header check -> row validation -> persist valid rows ->
 * atomically switch the dataset's ACTIVE batch -> clean up superseded data.
 * Each upload is treated as a full snapshot of that book (daily refresh semantics).
 */
const config = require('../config');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const { DATASETS } = require('../config/constants');
const { Asset, Liability, HistoricalLog, UploadBatch } = require('../models');
const { parseFile } = require('./parser.service');
const { validateRows, checkHeaders } = require('../validators/rowValidator');
const { deriveContractualFields } = require('./interest');
const { daysBetween, dateFromFilename, todayUTC } = require('../utils/dates');

const MODEL_FOR = { [DATASETS.ASSET]: Asset, [DATASETS.LIABILITY]: Liability, [DATASETS.HISTORICAL]: HistoricalLog };
const INSERT_CHUNK = 2000;

function enrich(dataset, doc, batchId) {
  if (dataset === DATASETS.HISTORICAL) {
    const isOpen = !doc.actualClosureDate;
    const earlyExit = !isOpen && doc.actualClosureDate < doc.contractualMaturityDate;
    return {
      ...doc, batchId, isOpen, earlyExit,
      daysEarly: earlyExit ? daysBetween(doc.actualClosureDate, doc.contractualMaturityDate) : 0,
    };
  }
  return { ...doc, batchId, ...deriveContractualFields(doc) };
}

/**
 * @param {object} p { dataset, buffer, fileName, fileSize, asOfDate?, uploadedBy }
 * @returns {Promise<object>} batch summary (incl. first N row errors)
 */
async function ingest({ dataset, buffer, fileName, fileSize, asOfDate, uploadedBy }) {
  if (!MODEL_FOR[dataset]) throw AppError.badRequest(`Unknown dataset ${dataset}`);

  const { headers, rows } = parseFile(buffer, fileName);
  const headerCheck = checkHeaders(dataset, headers);
  if (!headerCheck.ok) {
    throw AppError.badRequest(`File does not look like a ${dataset.toLowerCase()} file: missing columns`, headerCheck);
  }
  if (!rows.length) throw AppError.badRequest('The file contains a header but no data rows');

  const { valid, errors, rejectedRows } = validateRows(dataset, rows);
  const resolvedAsOf = asOfDate || dateFromFilename(fileName) || todayUTC();

  const batch = await UploadBatch.create({
    dataset, fileName, fileSizeBytes: fileSize, asOfDate: resolvedAsOf, uploadedBy,
    totalRows: rows.length, acceptedRows: valid.length, rejectedRows,
    rowErrors: errors.slice(0, config.upload.maxStoredErrors),
    rowErrorsTruncated: errors.length > config.upload.maxStoredErrors,
  });

  if (!valid.length) {
    await UploadBatch.updateOne({ _id: batch._id }, { status: 'FAILED', failureReason: 'No valid rows', completedAt: new Date() });
    return summarise(await UploadBatch.findById(batch._id).lean());
  }

  const Model = MODEL_FOR[dataset];
  try {
    for (let i = 0; i < valid.length; i += INSERT_CHUNK) {
      await Model.insertMany(valid.slice(i, i + INSERT_CHUNK).map((d) => enrich(dataset, d, batch._id)), { ordered: false });
    }
  } catch (err) {
    await Model.deleteMany({ batchId: batch._id });
    await UploadBatch.updateOne({ _id: batch._id }, { status: 'FAILED', failureReason: err.message, completedAt: new Date() });
    throw err;
  }

  // Switch: new batch ACTIVE, previous ACTIVE -> SUPERSEDED, then delete superseded rows.
  const previous = await UploadBatch.find({ dataset, status: 'ACTIVE' }).select('_id').lean();
  await UploadBatch.updateOne({ _id: batch._id }, { status: 'ACTIVE', completedAt: new Date() });
  if (previous.length) {
    const ids = previous.map((p) => p._id);
    await UploadBatch.updateMany({ _id: { $in: ids } }, { status: 'SUPERSEDED' });
    await Model.deleteMany({ batchId: { $in: ids } });
  }
  cache.clear();
  logger.info({ dataset, batchId: batch._id, accepted: valid.length, rejected: rejectedRows }, 'Dataset ingested');
  return summarise(await UploadBatch.findById(batch._id).lean());
}

function summarise(batch, errorPreview = 50) {
  const { rowErrors = [], ...rest } = batch;
  return { ...rest, rowErrorCount: rowErrors.length, rowErrorPreview: rowErrors.slice(0, errorPreview) };
}

module.exports = { ingest, summarise };
