'use strict';
/**
 * File -> array of row objects keyed by header.
 * Works for .xlsx/.xls and .csv through SheetJS. Real Excel date cells are converted to
 * YYYY-MM-DD from their serial number (timezone-safe); text cells are passed through untouched
 * so the validator can enforce the YYYY-MM-DD rule on them.
 */
const XLSX = require('xlsx');
const AppError = require('../utils/AppError');

const pad = (n) => String(n).padStart(2, '0');

function cellToValue(cell) {
  if (!cell) return null;
  if (cell.t === 'd' && cell.v instanceof Date) {
    const d = cell.v;
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (cell.t === 'n' && cell.z && XLSX.SSF.is_date(cell.z)) {
    const p = XLSX.SSF.parse_date_code(cell.v);
    return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : String(cell.v);
  }
  if (cell.t === 'z' || cell.t === 'e') return null;
  return cell.v;
}

/**
 * @param {Buffer} buffer
 * @param {string} originalName used to decide CSV vs Excel
 * @returns {{ headers: string[], rows: Object[] }} rows carry __row = sheet row number (header = 1)
 */
function parseFile(buffer, originalName = '') {
  const isCsv = /\.csv$/i.test(originalName);
  let wb;
  try {
    // raw:true keeps CSV text as text (no locale date guessing); cellDates:false keeps Excel serials
    wb = XLSX.read(buffer, { type: 'buffer', raw: isCsv, cellDates: false, cellNF: true, dense: false });
  } catch (err) {
    throw AppError.badRequest(`Could not read file: ${err.message}`);
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw AppError.badRequest('The file has no sheets');
  const ws = wb.Sheets[sheetName];
  if (!ws['!ref']) throw AppError.badRequest('The first sheet is empty');

  const range = XLSX.utils.decode_range(ws['!ref']);
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cell = ws[XLSX.utils.encode_cell({ r: range.s.r, c })];
    headers.push(cell ? String(cell.v).trim() : '');
  }

  const rows = [];
  for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
    const row = { __row: r + 1 };
    let empty = true;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const key = headers[c - range.s.c];
      if (!key) continue;
      const v = cellToValue(ws[XLSX.utils.encode_cell({ r, c })]);
      if (v !== null && v !== '') empty = false;
      row[key] = v;
    }
    if (!empty) rows.push(row); // skip trailing blank lines
  }
  return { headers, rows, sheetName };
}

module.exports = { parseFile };
