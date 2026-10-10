'use strict';
const { pingDB } = require('../config/db');
const ml = require('../services/ml.client');
const cache = require('../utils/cache');
const pkg = require('../../package.json');

const startedAt = new Date();

function liveness(_req, res) {
  res.json({ status: 'UP', service: pkg.name, version: pkg.version, startedAt, uptimeSeconds: Math.round(process.uptime()), cache: cache.stats() });
}

async function db(_req, res) {
  try {
    const r = await pingDB();
    res.status(r.ok ? 200 : 503).json({ status: r.ok ? 'UP' : 'DOWN', ...r });
  } catch (err) {
    res.status(503).json({ status: 'DOWN', error: err.message });
  }
}

async function mlHealth(_req, res) {
  const r = await ml.health();
  res.status(r.ok ? 200 : 503).json({ status: r.ok ? 'UP' : 'DOWN', ...r });
}

module.exports = { liveness, db, mlHealth };
