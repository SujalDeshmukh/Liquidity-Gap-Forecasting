'use strict';
const mongoose = require('mongoose');
const { Schema } = mongoose;
const { ENTITIES, LOCATIONS, CURRENCIES, SEGMENTS, LOAN_TYPES, PRODUCT_TYPES } = require('../config/constants');

const HistoricalLogSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'UploadBatch', required: true, index: true },
    transactionId: { type: String, required: true },
    entity: { type: String, enum: ENTITIES, required: true },
    type: { type: String, enum: ['Asset', 'Liability'], required: true },
    location: { type: String, enum: LOCATIONS, required: true },
    transactionDate: { type: Date, required: true },
    customerId: { type: String, required: true },
    customerSegment: { type: String, enum: SEGMENTS, required: true },
    clientRating: { type: Number, min: 1, max: 5, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    interestRatePct: Number,
    marketInterestRatePct: Number,
    productType: { type: String, enum: [...LOAN_TYPES, ...PRODUCT_TYPES], required: true },
    contractualMaturityDate: { type: Date, required: true },
    actualClosureDate: { type: Date, default: null }, // null = still-open contract
    // Derived
    isOpen: Boolean,
    earlyExit: Boolean,
    daysEarly: Number,
  },
  { timestamps: true, versionKey: false }
);
HistoricalLogSchema.index({ batchId: 1, transactionId: 1 }, { unique: true });
HistoricalLogSchema.index({ batchId: 1, location: 1, type: 1, actualClosureDate: 1 });

module.exports = mongoose.model('HistoricalLog', HistoricalLogSchema, 'historical_log');
