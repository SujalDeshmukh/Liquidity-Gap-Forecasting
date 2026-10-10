'use strict';
/**
 * Batch-scores every live transaction through the ML service and stores the probability +
 * rationale on the asset / liability documents. Runs in the background; progress is tracked
 * in the prediction_runs collection so the UI can poll it.
 */
const config = require('../config');
const cache = require('../utils/cache');
const logger = require('../utils/logger');
const { Asset, Liability, PredictionRun } = require('../models');
const { getActiveBatches } = require('./dataset.service');
const ml = require('./ml.client');
const { parseISODate } = require('../utils/dates');

async function latestRun() {
  return PredictionRun.findOne().sort({ createdAt: -1 }).lean();
}

async function scoreCollection(Model, side, batch, calcDate, run) {
  const docs = await Model.find({ batchId: batch._id }).lean();
  const ops = [];
  for (let i = 0; i < docs.length; i += config.ml.batchSize) {
    const chunk = docs.slice(i, i + config.ml.batchSize);
    const res = await ml.predict(chunk.map((d) => ml.toMlPayload(d, side, calcDate)));
    const byId = new Map(res.predictions.map((p) => [p.transaction_id, p]));
    for (const d of chunk) {
      const p = byId.get(d.transactionId);
      if (!p || typeof p.probability !== 'number') continue;
      ops.push({
        updateOne: {
          filter: { _id: d._id },
          update: {
            $set: {
              prediction: {
                probability: Math.min(1, Math.max(0, p.probability)),
                modelAdjustedMaturityDate: p.adjusted_maturity_date ? parseISODate(p.adjusted_maturity_date) : undefined,
                rationale: Array.isArray(p.rationale) ? p.rationale : [],
                modelVersion: res.model_version,
                isStub: Boolean(res.is_stub),
                predictedAt: new Date(),
                runId: run._id,
              },
            },
          },
        },
      });
    }
    run.modelVersion = res.model_version;
    run.isStub = Boolean(res.is_stub);
    run.predictedCount += chunk.length;
    await PredictionRun.updateOne({ _id: run._id }, { predictedCount: run.predictedCount, modelVersion: run.modelVersion, isStub: run.isStub });
  }
  if (ops.length) await Model.bulkWrite(ops, { ordered: false });
  return ops.length;
}

/**
 * Start a run. Returns immediately with the run document; work continues in the background.
 * If a run is already in progress it is returned instead of starting a second one.
 */
async function startRun(triggeredBy) {
  const running = await PredictionRun.findOne({ status: 'RUNNING' }).lean();
  if (running) return { run: running, started: false };

  const active = await getActiveBatches();
  if (!active.ASSET || !active.LIABILITY) {
    return { run: null, started: false, reason: 'Both the asset and liability books must be uploaded first' };
  }
  const calcDate = new Date(Math.max(active.ASSET.asOfDate, active.LIABILITY.asOfDate));
  const [na, nl] = await Promise.all([
    Asset.countDocuments({ batchId: active.ASSET._id }),
    Liability.countDocuments({ batchId: active.LIABILITY._id }),
  ]);
  const run = await PredictionRun.create({
    assetBatchId: active.ASSET._id, liabilityBatchId: active.LIABILITY._id, totalCount: na + nl, triggeredBy,
  });

  (async () => {
    const r = run.toObject();
    try {
      await scoreCollection(Asset, 'Asset', active.ASSET, calcDate, r);
      await scoreCollection(Liability, 'Liability', active.LIABILITY, calcDate, r);
      await PredictionRun.updateOne({ _id: run._id }, { status: 'COMPLETED', finishedAt: new Date() });
      cache.clear();
      logger.info({ runId: run._id, model: r.modelVersion, count: r.predictedCount }, 'Prediction run completed');
    } catch (err) {
      await PredictionRun.updateOne({ _id: run._id }, { status: 'FAILED', error: err.message, finishedAt: new Date() });
      logger.error({ err, runId: run._id }, 'Prediction run failed');
    }
  })();

  return { run: run.toObject(), started: true };
}

module.exports = { startRun, latestRun };
