'use strict';
const config = require('../config');
const { getActiveBatches, loadHistorical } = require('../services/dataset.service');
const analytics = require('../services/analytics.service');
const { toReporting } = require('../config/fx');
const cache = require('../utils/cache');

async function behaviour(req, res) {
  const { currency, dimension } = req.valid.query;
  const location = req.scope.location;
  const active = await getActiveBatches();
  const key = ['analytics', active.HISTORICAL && active.HISTORICAL._id, currency, location, dimension].join(':');
  const result = await cache.wrap(key, async () => {
    const records = await loadHistorical(active, { currency, location });
    return {
      currency, location,
      amountCurrency: currency === 'ALL' ? config.calc.reportingCurrency : currency,
      summary: analytics.summary(records),
      trend: analytics.earlyExitTrend(records, dimension),
      outflows: analytics.outflowAnomalies(records, { convert: currency === 'ALL' ? toReporting : null }),
    };
  });
  res.json(result);
}

module.exports = { behaviour };
