'use strict';
const path = require('path');
require('dotenv').config({ path: process.env.DOTENV_PATH || path.resolve(__dirname, '../../.env') });

const env = process.env.NODE_ENV || 'development';
const isTest = env === 'test';

function required(name, testDefault) {
  const v = process.env[name];
  if (v) return v;
  if (isTest && testDefault !== undefined) return testDefault;
  throw new Error(`Missing required environment variable: ${name}`);
}
const num = (name, def) => (process.env[name] !== undefined && process.env[name] !== '' ? Number(process.env[name]) : def);

const config = {
  env,
  isTest,
  port: num('PORT', 5000),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  logLevel: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),

  mongoUri: required('MONGO_URI', ''),

  jwt: {
    secret: required('JWT_SECRET', 'test-secret'),
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },
  seedUsersFile: process.env.SEED_USERS_FILE || './seed/users.seed.json',

  ml: {
    url: process.env.ML_SERVICE_URL || 'http://localhost:8000',
    timeoutMs: num('ML_TIMEOUT_MS', 30000),
    batchSize: num('ML_BATCH_SIZE', 500),
  },

  calc: {
    dayCountBasis: num('DAY_COUNT_BASIS', 365),
    reportingCurrency: process.env.REPORTING_CURRENCY || 'EUR',
    fxRatesFile: process.env.FX_RATES_FILE || path.resolve(__dirname, 'fx-rates.json'),
    behaviouralMode: process.env.BEHAVIOURAL_ADJUSTMENT_MODE || 'linear',
    behaviouralShiftFactor: num('BEHAVIOURAL_SHIFT_FACTOR', 1),
    behaviouralThreshold: num('BEHAVIOURAL_THRESHOLD', 0.5),
  },

  reco: {
    minGap: num('RECO_MIN_GAP', 1_000_000),
    roundTo: num('RECO_ROUND_TO', 100_000),
  },

  analytics: {
    windowDays: num('ANOMALY_WINDOW_DAYS', 90),
    multiplier: num('ANOMALY_MULTIPLIER', 3),
  },

  upload: {
    maxMb: num('MAX_UPLOAD_MB', 50),
    maxStoredErrors: num('MAX_STORED_ERRORS', 2000),
  },
  cacheTtlSeconds: num('CACHE_TTL_SECONDS', 600),
};

module.exports = config;
