'use strict';
const mongoose = require('mongoose');
const { DATASETS } = require('../config/constants');

const RowErrorSchema = new mongoose.Schema(
  { row: Number, transactionId: String, field: String, message: String, value: mongoose.Schema.Types.Mixed },
  { _id: false }
);

/**
 * One document per uploaded file. Exactly one batch per dataset is ACTIVE at a time;
 * every query reads from the active batch, so switching batches is atomic for readers.
 */
const UploadBatchSchema = new mongoose.Schema(
  {
    dataset: { type: String, enum: Object.values(DATASETS), required: true },
    fileName: String,
    fileSizeBytes: Number,
    asOfDate: { type: Date, required: true }, // calculation date for this data refresh
    uploadedBy: String,
    status: { type: String, enum: ['PROCESSING', 'ACTIVE', 'SUPERSEDED', 'FAILED'], default: 'PROCESSING' },
    totalRows: Number,
    acceptedRows: Number,
    rejectedRows: Number,
    rowErrors: [RowErrorSchema],
    rowErrorsTruncated: { type: Boolean, default: false },
    failureReason: String,
    completedAt: Date,
  },
  { timestamps: true, versionKey: false }
);
UploadBatchSchema.index({ dataset: 1, status: 1 });

module.exports = mongoose.model('UploadBatch', UploadBatchSchema, 'upload_batches');
