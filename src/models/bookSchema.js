'use strict';
const { Schema } = require('mongoose');
const { ENTITIES, LOCATIONS, CURRENCIES, SEGMENTS } = require('../config/constants');

/** Per-feature contribution returned by the ML service (drives the rationale panel). */
const RationaleSchema = new Schema(
  { feature: String, value: Schema.Types.Mixed, impact: Number, description: String },
  { _id: false }
);

const PredictionSchema = new Schema(
  {
    probability: { type: Number, min: 0, max: 1 },
    // Optional: if the ML team returns an explicit expected exit date it is used in "model" mode
    modelAdjustedMaturityDate: Date,
    rationale: [RationaleSchema],
    modelVersion: String,
    isStub: Boolean,
    predictedAt: Date,
    runId: { type: Schema.Types.ObjectId, ref: 'PredictionRun' },
  },
  { _id: false }
);

/**
 * Asset (loans) and Liability (deposits/borrowings) books share one normalised shape.
 * Source column differences (Loan_Amount vs Amount, Loan_Type vs Product_Type) are
 * resolved in the parser so downstream code never branches on them.
 */
function makeBookSchema(productEnum) {
  const schema = new Schema(
    {
      batchId: { type: Schema.Types.ObjectId, ref: 'UploadBatch', required: true, index: true },
      transactionId: { type: String, required: true },
      entity: { type: String, enum: ENTITIES, required: true },
      location: { type: String, enum: LOCATIONS, required: true },
      customerId: { type: String, required: true },
      amount: { type: Number, required: true, min: 0 },
      currency: { type: String, enum: CURRENCIES, required: true },
      transactionDate: { type: Date, required: true },
      maturityDate: { type: Date, required: true },
      interestRatePct: { type: Number, required: true },
      marketInterestRatePct: { type: Number, required: true },
      productType: { type: String, enum: productEnum, required: true },
      customerSegment: { type: String, enum: SEGMENTS, required: true },
      clientRating: { type: Number, min: 1, max: 5, required: true },
      // Derived at ingestion (simple interest, no intermediate payments - PS guardrail IX.ii)
      tenorDays: Number,
      interestAmount: Number,
      maturityAmount: Number,
      prediction: PredictionSchema,
    },
    { timestamps: true, versionKey: false }
  );
  schema.index({ batchId: 1, transactionId: 1 }, { unique: true });
  schema.index({ batchId: 1, location: 1, currency: 1 });
  return schema;
}

module.exports = { makeBookSchema };
