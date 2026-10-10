'use strict';
/** Operational error with an HTTP status; anything else is treated as a 500 by the error handler. */
class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
    this.isOperational = true;
  }
  static badRequest(msg, details) { return new AppError(400, msg, details); }
  static unauthorized(msg = 'Authentication required') { return new AppError(401, msg); }
  static forbidden(msg = 'You do not have access to this resource') { return new AppError(403, msg); }
  static notFound(msg = 'Not found') { return new AppError(404, msg); }
  static conflict(msg, details) { return new AppError(409, msg, details); }
  static unavailable(msg, details) { return new AppError(503, msg, details); }
}
module.exports = AppError;
