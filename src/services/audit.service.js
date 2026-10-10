'use strict';
const { AuditLog } = require('../models');
const logger = require('../utils/logger');

/** Fire-and-forget audit entry; an audit failure must never break the user's request. */
function audit(req, action, details = {}, outcome = 'SUCCESS') {
  const user = req && req.user ? req.user : {};
  AuditLog.create({
    action,
    userId: user.userId || details.userId,
    role: user.role,
    location: user.location,
    outcome,
    details,
    ip: req ? req.ip : undefined,
  }).catch((err) => logger.error({ err, action }, 'Failed to write audit log'));
  logger.info({ audit: action, userId: user.userId || details.userId, outcome }, 'audit');
}

module.exports = { audit };
