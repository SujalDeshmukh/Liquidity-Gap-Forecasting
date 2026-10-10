'use strict';
const multer = require('multer');
const config = require('../config');
const AppError = require('../utils/AppError');

const ALLOWED = /\.(csv|xlsx|xls)$/i;

/** Memory storage: files are parsed straight from the buffer and never written to disk. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ALLOWED.test(file.originalname) ? cb(null, true) : cb(AppError.badRequest('Only .csv, .xlsx or .xls files are accepted')),
});

module.exports = upload;
