'use strict';
const multer = require('multer');
const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({ error: { message: `Route ${req.method} ${req.originalUrl} not found` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let message = err.isOperational ? err.message : 'Something went wrong. Check the server logs.';
  let { details } = err;

  if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File is larger than the allowed upload size' : err.message;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Data failed database validation';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  }

  if (status >= 500) logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  else logger.warn({ status, message, path: req.originalUrl }, 'Request failed');

  res.status(status).json({ error: { message, ...(details ? { details } : {}) } });
}

module.exports = { notFound, errorHandler };
