'use strict';
/**
 * Historical behavioural analytics (PS VII adv.iii / functional xi):
 *  - early-exit rate over time by product type or customer segment
 *  - deposit-outflow anomaly detection vs a rolling N-day average
 */
const config = require('../config');
const { toISODate, addDays, utcMidnight } = require('../utils/dates');

const monthKey = (d) => toISODate(d).slice(0, 7);

/** Early-exit rate per closure month, grouped by `dimension` (productType | customerSegment | type). */
function earlyExitTrend(records, dimension = 'productType') {
  const closed = records.filter((r) => r.actualClosureDate);
  const groups = new Map(); // month -> group -> {closed, early}
  for (const r of closed) {
    const m = monthKey(r.actualClosureDate);
    const g = r[dimension];
    if (!groups.has(m)) groups.set(m, new Map());
    const mg = groups.get(m);
    if (!mg.has(g)) mg.set(g, { closed: 0, early: 0 });
    const c = mg.get(g);
    c.closed += 1;
    if (r.earlyExit) c.early += 1;
  }
  const series = [...new Set(closed.map((r) => r[dimension]))].sort();
  const months = [...groups.keys()].sort();
  const points = months.map((m) => {
    const row = { month: m };
    for (const s of series) {
      const c = groups.get(m).get(s);
      row[s] = c && c.closed ? Math.round((c.early / c.closed) * 1000) / 10 : null;
    }
    return row;
  });
  return { dimension, series, points };
}

function summary(records) {
  const closed = records.filter((r) => r.actualClosureDate);
  const early = closed.filter((r) => r.earlyExit);
  const byType = (t) => {
    const c = closed.filter((r) => r.type === t);
    return c.length ? Math.round((c.filter((r) => r.earlyExit).length / c.length) * 1000) / 10 : null;
  };
  return {
    totalRecords: records.length,
    openContracts: records.length - closed.length,
    closedContracts: closed.length,
    earlyExits: early.length,
    earlyExitRatePct: closed.length ? Math.round((early.length / closed.length) * 1000) / 10 : null,
    loanPreClosureRatePct: byType('Asset'),
    depositEarlyWithdrawalRatePct: byType('Liability'),
    avgDaysEarly: early.length ? Math.round(early.reduce((a, r) => a + r.daysEarly, 0) / early.length) : null,
  };
}

/**
 * Daily deposit outflows (liability closures) vs trailing average of the previous `windowDays`.
 * Flags days where outflow >= multiplier x trailing average.
 * Amounts are summed in the record currency when a single currency is selected, otherwise
 * converted with the caller-supplied `convert` function.
 */
function outflowAnomalies(records, { windowDays = config.analytics.windowDays, multiplier = config.analytics.multiplier, convert } = {}) {
  const daily = new Map();
  for (const r of records) {
    if (r.type !== 'Liability' || !r.actualClosureDate) continue;
    const k = toISODate(r.actualClosureDate);
    const v = convert ? convert(r.amount, r.currency) : r.amount;
    daily.set(k, (daily.get(k) || 0) + v);
  }
  if (!daily.size) return { windowDays, multiplier, series: [], anomalies: [] };

  const keys = [...daily.keys()].sort();
  const start = utcMidnight(new Date(keys[0]));
  const end = utcMidnight(new Date(keys[keys.length - 1]));
  const series = [];
  const window = [];
  let windowSum = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const k = toISODate(d);
    const outflow = daily.get(k) || 0;
    const avg = window.length >= Math.min(windowDays, 30) ? windowSum / window.length : null; // need some history
    const ratio = avg ? outflow / avg : null;
    series.push({
      date: k,
      outflow: Math.round(outflow),
      rollingAvg: avg === null ? null : Math.round(avg),
      ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
      anomaly: ratio !== null && ratio >= multiplier,
    });
    window.push(outflow);
    windowSum += outflow;
    if (window.length > windowDays) windowSum -= window.shift();
  }
  const anomalies = series
    .filter((s) => s.anomaly)
    .map((s) => ({ ...s, message: `Deposit outflow ${s.ratio}x higher than ${windowDays}-day average` }))
    .sort((a, b) => b.ratio - a.ratio);
  return { windowDays, multiplier, series, anomalies };
}

module.exports = { earlyExitTrend, summary, outflowAnomalies };
