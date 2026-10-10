'use strict';
/**
 * All dates are handled as UTC midnight to avoid timezone drift between
 * Excel parsing, MongoDB storage and the browser.
 */
const DAY_MS = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse strict YYYY-MM-DD into a UTC Date; returns null if invalid (e.g. 2026-02-30). */
function parseISODate(str) {
  if (typeof str !== 'string') return null;
  const m = ISO_RE.exec(str.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function toISODate(date) {
  return date ? new Date(date).toISOString().slice(0, 10) : null;
}

function utcMidnight(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function todayUTC() {
  return utcMidnight(new Date());
}

function daysBetween(a, b) {
  return Math.round((utcMidnight(b) - utcMidnight(a)) / DAY_MS);
}

function addDays(date, n) {
  return new Date(utcMidnight(date).getTime() + n * DAY_MS);
}

/** Calendar-month addition, clamped to month end (31 Jan + 1M = 28/29 Feb). */
function addMonths(date, n) {
  const d = utcMidnight(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}

/** Shift by {value, unit}. unit in days|weeks|months|years; negative value = earlier. */
function shiftDate(date, value, unit) {
  switch (unit) {
    case 'days': return addDays(date, value);
    case 'weeks': return addDays(date, value * 7);
    case 'months': return addMonths(date, value);
    case 'years': return addMonths(date, value * 12);
    default: throw new Error(`Unsupported shift unit: ${unit}`);
  }
}

/** Extract a DDMMYYYY stamp from names like "asset_book - 10102026.xlsx". */
function dateFromFilename(name) {
  const m = /(\d{2})(\d{2})(\d{4})(?!\d)/.exec(name || '');
  if (!m) return null;
  return parseISODate(`${m[3]}-${m[2]}-${m[1]}`);
}

module.exports = {
  DAY_MS, parseISODate, toISODate, utcMidnight, todayUTC, daysBetween, addDays, addMonths, shiftDate, dateFromFilename,
};
