'use strict';
const mongoose = require('mongoose');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
}

/** Used by GET /health/db (management endpoint). */
async function pingDB() {
  if (mongoose.connection.readyState !== 1) {
    return { ok: false, state: mongoose.STATES[mongoose.connection.readyState] };
  }
  const started = Date.now();
  await mongoose.connection.db.admin().ping();
  return { ok: true, latencyMs: Date.now() - started, db: mongoose.connection.name };
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, pingDB, disconnectDB };
