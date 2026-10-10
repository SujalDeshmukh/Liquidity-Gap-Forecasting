'use strict';
/**
 * Turns a predicted early-exit / pre-closure probability into an adjusted maturity date.
 * The formula is deliberately isolated here so the team can change it (or let the ML
 * service return the date itself) without touching ladder code. See docs/ML_CONTRACT.md.
 */
const config = require('../config');
const { addDays, daysBetween, utcMidnight } = require('../utils/dates');

function clampToCalc(date, calcDate) {
  return date < calcDate ? utcMidnight(calcDate) : utcMidnight(date);
}

/**
 * @param {{maturityDate: Date, prediction?: {probability:number, modelAdjustedMaturityDate?: Date}}} txn
 * @param {Date} calcDate
 * @param {object} [opts] override config (tests / what-if)
 * @returns {{ adjustedMaturityDate: Date, probability: number|null, daysEarlier: number, pctEarly: number }}
 */
function adjustedMaturity(txn, calcDate, opts = {}) {
  const mode = opts.mode || config.calc.behaviouralMode;
  const factor = opts.factor ?? config.calc.behaviouralShiftFactor;
  const threshold = opts.threshold ?? config.calc.behaviouralThreshold;
  const p = txn.prediction && typeof txn.prediction.probability === 'number' ? txn.prediction.probability : null;

  const maturity = utcMidnight(txn.maturityDate);
  const remaining = Math.max(0, daysBetween(calcDate, maturity));
  let adjusted = maturity;

  if (p !== null) {
    if (mode === 'model' && txn.prediction.modelAdjustedMaturityDate) {
      adjusted = utcMidnight(txn.prediction.modelAdjustedMaturityDate);
    } else if (mode === 'threshold') {
      if (p >= threshold) adjusted = addDays(calcDate, Math.round(remaining * (1 - p)));
    } else {
      // linear (default): pull maturity earlier by p x remaining tenor x factor
      adjusted = addDays(maturity, -Math.round(p * remaining * factor));
    }
  }
  adjusted = clampToCalc(adjusted, calcDate);
  if (adjusted > maturity) adjusted = maturity; // behaviour never extends a contract

  const daysEarlier = daysBetween(adjusted, maturity);
  return {
    adjustedMaturityDate: adjusted,
    probability: p,
    daysEarlier,
    pctEarly: remaining > 0 ? daysEarlier / remaining : 0,
  };
}

module.exports = { adjustedMaturity };
