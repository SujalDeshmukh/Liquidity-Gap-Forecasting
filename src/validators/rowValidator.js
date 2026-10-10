'use strict';
const { ENTITY_LOCATION } = require('../config/constants');
const { RULESETS } = require('./rules');
const { parseISODate } = require('../utils/dates');

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const cleaned = v.trim().replace(/,/g, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/** Validate + normalise a single cell. Returns { value } or { error }. */
function validateCell(spec, raw) {
  if (isBlank(raw)) {
    return spec.optional ? { value: null } : { error: 'is mandatory and cannot be blank' };
  }
  switch (spec.type) {
    case 'string': {
      const s = String(raw).trim();
      if (spec.pattern && !spec.pattern.test(s)) return { error: `must match pattern ${spec.patternHint}` };
      return { value: s };
    }
    case 'enum': {
      let s = String(raw).trim();
      if (spec.upper) s = s.toUpperCase();
      if (spec.caseInsensitive) {
        const hit = spec.values.find((v) => v.toLowerCase() === s.toLowerCase());
        if (hit) return { value: hit };
      } else if (spec.values.includes(s)) {
        return { value: s };
      }
      return { error: `must be one of {${spec.values.join(', ')}}` };
    }
    case 'number':
    case 'int': {
      const n = toNumber(raw);
      if (Number.isNaN(n)) return { error: 'must be numeric' };
      if (spec.type === 'int' && !Number.isInteger(n)) return { error: 'must be an integer' };
      if (spec.gt !== undefined && !(n > spec.gt)) return { error: `must be > ${spec.gt}` };
      if (spec.min !== undefined && n < spec.min) return { error: `must be between ${spec.min} and ${spec.max}` };
      if (spec.max !== undefined && n > spec.max) return { error: `must be between ${spec.min} and ${spec.max}` };
      return { value: n };
    }
    case 'date': {
      // The parser converts genuine Excel date cells to YYYY-MM-DD; text must already be YYYY-MM-DD.
      const d = parseISODate(String(raw).trim());
      if (!d) return { error: 'must be a valid date in YYYY-MM-DD format' };
      return { value: d };
    }
    default:
      return { error: `unknown rule type ${spec.type}` };
  }
}

/** Fail fast on a wrong file (e.g. liability file uploaded as assets). */
function checkHeaders(dataset, headers) {
  const expected = RULESETS[dataset].columns.map((c) => c.source);
  const present = new Set(headers.map((h) => String(h).trim()));
  const missing = expected.filter((h) => !present.has(h));
  const unexpected = [...present].filter((h) => h && !expected.includes(h));
  return { ok: missing.length === 0, missing, unexpected };
}

/**
 * Validate every row of a dataset.
 * @param {string} dataset ASSET | LIABILITY | HISTORICAL
 * @param {Array<Object>} rows objects keyed by source header, each carrying __row (1-based sheet row)
 * @returns {{ valid: Object[], errors: Object[], rejectedRows: number }}
 */
function validateRows(dataset, rows) {
  const { columns, checkMaturityOrder } = RULESETS[dataset];
  const valid = [];
  const errors = [];
  const seenIds = new Map();
  const seenRows = new Map();
  let rejectedRows = 0;

  for (const raw of rows) {
    const rowNo = raw.__row;
    const rowErrors = [];
    const doc = {};
    const txnId = isBlank(raw.Transaction_ID) ? undefined : String(raw.Transaction_ID).trim();
    const push = (field, message, value) => rowErrors.push({ row: rowNo, transactionId: txnId, field, message, value });

    // Rule 15: no fully duplicate rows (compare on trimmed raw cell text)
    const signature = columns.map((c) => (isBlank(raw[c.source]) ? '' : String(raw[c.source]).trim())).join('\u0001');
    const isFullDuplicate = seenRows.has(signature);
    if (isFullDuplicate) push('(row)', `Row is a full duplicate of row ${seenRows.get(signature)}`);

    for (const spec of columns) {
      const res = validateCell(spec, raw[spec.source]);
      if (res.error) push(spec.source, `${spec.source} ${res.error}`, raw[spec.source]);
      else doc[spec.target] = res.value;
    }

    // Rule 4/5: Entity -> Location mapping
    if (doc.entity && doc.location && ENTITY_LOCATION[doc.entity] !== doc.location) {
      push('Location', `Location must be ${ENTITY_LOCATION[doc.entity]} for entity ${doc.entity}`, raw.Location);
    }
    // Rule 9: Maturity_Date >= Transaction_Date
    if (checkMaturityOrder) {
      const [a, b] = checkMaturityOrder;
      if (doc[a] && doc[b] && doc[b] < doc[a]) {
        push('Maturity_Date', 'Maturity_Date must be on or after Transaction_Date', raw.Maturity_Date);
      }
    }
    // Rule 1: Transaction_ID unique across the sheet - the first occurrence keeps the ID,
    // every later occurrence is rejected (even if the first one itself failed validation).
    if (doc.transactionId && !isFullDuplicate && seenIds.has(doc.transactionId)) {
      push('Transaction_ID', `Transaction_ID already used on row ${seenIds.get(doc.transactionId)}`, doc.transactionId);
    }

    if (!seenRows.has(signature)) seenRows.set(signature, rowNo);
    if (doc.transactionId && !seenIds.has(doc.transactionId)) seenIds.set(doc.transactionId, rowNo);

    if (rowErrors.length) {
      rejectedRows += 1;
      errors.push(...rowErrors);
    } else {
      valid.push(doc);
    }
  }

  return { valid, errors, rejectedRows };
}

module.exports = { validateRows, validateCell, checkHeaders, isBlank };
