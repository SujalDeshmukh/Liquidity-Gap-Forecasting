'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const h = require('../utils/asyncHandler');
const { authenticate } = require('../middleware/auth');
const { requireRole, scopeLocation } = require('../middleware/rbac');
const { validate, schemas } = require('../middleware/validate');
const upload = require('../middleware/upload');
const { ROLES } = require('../config/constants');

const auth = require('../controllers/auth.controller');
const data = require('../controllers/data.controller');
const gap = require('../controllers/gap.controller');
const scenario = require('../controllers/scenario.controller');
const analytics = require('../controllers/analytics.controller');
const health = require('../controllers/health.controller');

const router = express.Router();
const MODES = '(deterministic|behavioural)';

// ---- Management endpoints (no auth: used by orchestrators / evaluators) ----
router.get('/health', health.liveness);
router.get('/health/db', h(health.db));
router.get('/health/ml', h(health.mlHealth));

// ---- Auth ----
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
router.post('/api/auth/login', loginLimiter, validate(schemas.loginBody, 'body'), h(auth.login));
router.get('/api/auth/me', authenticate, auth.me);

// Everything below requires a valid JWT
router.use('/api', authenticate);

router.get('/api/meta', data.meta);

// ---- Data management ----
router.post('/api/data/upload/:dataset', requireRole(ROLES.SUPPORT), upload.single('file'), h(data.upload));
router.get('/api/data/batches', h(data.listBatches));
router.get('/api/data/batches/:id/errors', h(data.batchErrors));
router.get('/api/data/status', h(data.status));
router.get('/api/data/preview/:dataset', scopeLocation, h(data.preview));

// ---- Behavioural predictions (ML) ----
router.post('/api/predictions/run', requireRole(ROLES.SUPPORT), h(data.runPredictions));
router.get('/api/predictions/latest', h(data.latestPrediction));

// ---- Gap ladders ----
router.get(`/api/gap/:mode${MODES}/ladder`, scopeLocation, validate(schemas.ladderQuery), h(gap.ladder));
router.get(`/api/gap/:mode${MODES}/transactions`, scopeLocation, validate(schemas.drillQuery), h(gap.transactions));
router.get(`/api/gap/:mode${MODES}/export.xlsx`, scopeLocation, validate(schemas.ladderQuery), h(gap.exportXlsx));
router.get('/api/gap/behavioural/rationale/:transactionId', scopeLocation, validate(schemas.ladderQuery), h(gap.rationale));
router.get('/api/gap/compare', scopeLocation, validate(schemas.ladderQuery), h(gap.compare));
router.get('/api/recommendations', scopeLocation, validate(schemas.ladderQuery), h(gap.recommendations));

// ---- What-if ----
router.post('/api/scenario', scopeLocation, validate(schemas.scenarioBody, 'body'), h(scenario.run));

// ---- Historical analytics ----
router.get('/api/analytics/behaviour', scopeLocation, validate(schemas.analyticsQuery), h(analytics.behaviour));

module.exports = router;
