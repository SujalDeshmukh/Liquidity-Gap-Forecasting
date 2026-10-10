'use strict';
const mongoose = require('mongoose');

/** Append-only audit trail (login, upload, prediction run, scenario, export). */
const AuditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    userId: String,
    role: String,
    location: String,
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
    details: mongoose.Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);
AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema, 'audit_logs');
