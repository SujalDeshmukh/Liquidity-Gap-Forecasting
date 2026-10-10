'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./index');

let table = null;
function loadTable() {
  if (table) return table;
  table = JSON.parse(fs.readFileSync(path.resolve(config.calc.fxRatesFile), 'utf8'));
  if (table.base !== config.calc.reportingCurrency) {
    throw new Error(`FX table base (${table.base}) must equal REPORTING_CURRENCY (${config.calc.reportingCurrency})`);
  }
  return table;
}

/** Convert an amount in `ccy` into the reporting currency using the static table. */
function toReporting(amount, ccy) {
  const r = loadTable().rates[ccy];
  if (r === undefined) throw new Error(`No FX rate configured for ${ccy}`);
  return amount * r;
}

module.exports = { toReporting, loadTable };
