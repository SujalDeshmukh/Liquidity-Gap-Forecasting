'use strict';
const mongoose = require('mongoose');

const PredictionRunSchema = new mongoose.Schema(
  {
    assetBatchId: mongoose.Schema.Types.ObjectId,
    liabilityBatchId: mongoose.Schema.Types.ObjectId,
    status: { type: String, enum: ['RUNNING', 'COMPLETED', 'FAILED'], default: 'RUNNING' },
    modelVersion: String,
    isStub: Boolean,
    predictedCount: { type: Number, default: 0 },
    totalCount: Number,
    error: String,
    triggeredBy: String,
    finishedAt: Date,
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.model('PredictionRun', PredictionRunSchema, 'prediction_runs');
