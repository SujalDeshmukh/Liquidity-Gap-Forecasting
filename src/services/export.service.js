'use strict';
/** Excel export of ladder, drill-down transactions and recommendations (PS advanced task ii). */
const XLSX = require('xlsx');
const { toISODate } = require('../utils/dates');

function ladderSheet(ladder) {
  return XLSX.utils.json_to_sheet(
    ladder.buckets.map((b) => ({
      Bucket: b.label, Assets: b.assets, Liabilities: b.liabilities, 'Net Gap': b.netGap,
      'Asset Count': b.assetCount, 'Liability Count': b.liabilityCount,
    }))
  );
}

function breakdownSheet(ladder) {
  const rows = [];
  for (const r of ladder.breakdown) {
    for (const b of r.buckets) {
      rows.push({ Currency: r.currency, Location: r.location, Bucket: b.label, Assets: b.assets, Liabilities: b.liabilities, 'Net Gap': b.netGap });
    }
  }
  return XLSX.utils.json_to_sheet(rows);
}

function transactionsSheet(rows) {
  return XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      'Transaction ID': r.transactionId, Side: r.side, 'Customer ID': r.customerId, Location: r.location, Currency: r.currency,
      Product: r.productType, Segment: r.customerSegment, Principal: r.principal, Interest: r.interest, 'Cash Flow': r.cashflow,
      'Contractual Maturity': toISODate(r.contractualMaturityDate), 'Effective Maturity': toISODate(r.effectiveMaturityDate),
      Bucket: r.bucket, 'Early-exit Probability': r.probability ?? '', 'Days Earlier': r.daysEarlier ?? '',
    }))
  );
}

function recommendationsSheet(recos) {
  return XLSX.utils.json_to_sheet(
    recos.map((r) => ({
      Severity: r.severity, Currency: r.currency, Location: r.location, Bucket: r.bucketLabel, Action: r.action,
      'Behavioural Gap': r.behaviouralGap, 'Deterministic Gap': r.deterministicGap, Rationale: r.rationale,
    }))
  );
}

/** @returns {Buffer} xlsx file */
function buildWorkbook({ ladder, recommendations }) {
  const wb = XLSX.utils.book_new();
  const meta = XLSX.utils.aoa_to_sheet([
    ['Liquid+ export'], ['Mode', ladder.mode], ['Calculation date', toISODate(ladder.calculationDate)],
    ['Currency', ladder.currency], ['Location', ladder.location],
    ['Amounts in', ladder.amountCurrency || ladder.currency], ['Generated at', new Date().toISOString()],
  ]);
  XLSX.utils.book_append_sheet(wb, meta, 'Summary');
  XLSX.utils.book_append_sheet(wb, ladderSheet(ladder), 'Gap Ladder');
  XLSX.utils.book_append_sheet(wb, breakdownSheet(ladder), 'By Currency-Location');
  XLSX.utils.book_append_sheet(wb, transactionsSheet(ladder.rows), 'Transactions');
  if (recommendations) XLSX.utils.book_append_sheet(wb, recommendationsSheet(recommendations), 'Recommendations');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { buildWorkbook };
