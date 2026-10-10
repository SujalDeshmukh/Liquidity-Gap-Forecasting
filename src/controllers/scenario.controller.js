'use strict';
const { runScenario } = require('../services/scenario.service');
const { audit } = require('../services/audit.service');

async function run(req, res) {
  const body = { ...req.valid.body, location: req.scope.location };
  const result = await runScenario(body);
  audit(req, 'SCENARIO_RUN', { assetShift: body.assetShift, liabilityShift: body.liabilityShift, location: body.location });
  res.json(result);
}

module.exports = { run };
