'use strict';
const AppError = require('../utils/AppError');
const { ROLES, LOCATIONS } = require('../config/constants');

/** Allow only the listed roles. */
const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user.role) ? next() : next(AppError.forbidden('Your role cannot perform this action'));

/**
 * Location scoping (PS VII.xii):
 *  - LOCATION_USER: always pinned to their assigned location; asking for another one is a 403.
 *  - SUPPORT: may pass ?location=<name> or ALL (default ALL).
 * Result is written to req.scope.location and must be the ONLY location value services use.
 */
function scopeLocation(req, _res, next) {
  const requested = (req.query.location || req.body?.location || 'ALL').toString();
  if (requested !== 'ALL' && !LOCATIONS.includes(requested)) {
    return next(AppError.badRequest(`Unknown location ${requested}`));
  }
  if (req.user.role === ROLES.SUPPORT) {
    req.scope = { location: requested };
    return next();
  }
  if (requested !== 'ALL' && requested !== req.user.location) {
    return next(AppError.forbidden(`You can only access data for ${req.user.location}`));
  }
  req.scope = { location: req.user.location };
  return next();
}

module.exports = { requireRole, scopeLocation };
