'use strict';
/**
 * Declarative ingestion rule sets - one per dataset - transcribed from PS section VII.i.
 * Every rule violation = "Warn & Reject row". Keeping rules as data means the README
 * schema table, the validator and the tests all read from one place.
 *
 * Column spec fields:
 *   source   - header in the uploaded file
 *   target   - normalised field name stored in MongoDB
 *   type     - string | number | int | date | enum
 *   pattern  - RegExp for strings
 *   values   - allowed values for enum (caseInsensitive normalises to canonical casing)
 *   min/max, gt - numeric bounds (gt = strictly greater than)
 *   optional - blank allowed (only Actual_Closure_Date)
 */
const {
  ENTITIES, LOCATIONS, CURRENCIES, SEGMENTS, LOAN_TYPES, PRODUCT_TYPES, DATASETS,
} = require('../config/constants');

const common = {
  entity: { target: 'entity', type: 'enum', values: ENTITIES },
  location: { target: 'location', type: 'enum', values: LOCATIONS },
  customerId: { target: 'customerId', type: 'string', pattern: /^CUS-\d+$/, patternHint: 'CUS-<number>' },
  currency: { target: 'currency', type: 'enum', values: CURRENCIES, upper: true },
  date: { type: 'date' },
  rate: { type: 'number', min: 0, max: 100 },
  segment: { target: 'customerSegment', type: 'enum', values: SEGMENTS },
  rating: { target: 'clientRating', type: 'int', min: 1, max: 5 },
  amount: { target: 'amount', type: 'number', gt: 0 },
};

const ASSET = [
  { source: 'Transaction_ID', target: 'transactionId', type: 'string', pattern: /^AST-\d+$/, patternHint: 'AST-<number>', unique: true },
  { source: 'Entity', ...common.entity },
  { source: 'Location', ...common.location },
  { source: 'Customer_ID', ...common.customerId },
  { source: 'Loan_Amount', ...common.amount },
  { source: 'Currency', ...common.currency },
  { source: 'Transaction_Date', target: 'transactionDate', ...common.date },
  { source: 'Maturity_Date', target: 'maturityDate', ...common.date },
  { source: 'Interest_Rate_Pct', target: 'interestRatePct', ...common.rate },
  { source: 'Market_Interest_Rate_Pct', target: 'marketInterestRatePct', ...common.rate },
  { source: 'Loan_Type', target: 'productType', type: 'enum', values: LOAN_TYPES },
  { source: 'Customer_Segment', ...common.segment },
  { source: 'Client_Rating', ...common.rating },
];

const LIABILITY = [
  { source: 'Transaction_ID', target: 'transactionId', type: 'string', pattern: /^LIA-\d+$/, patternHint: 'LIA-<number>', unique: true },
  { source: 'Entity', ...common.entity },
  { source: 'Location', ...common.location },
  { source: 'Customer_ID', ...common.customerId },
  { source: 'Amount', ...common.amount },
  { source: 'Currency', ...common.currency },
  { source: 'Transaction_Date', target: 'transactionDate', ...common.date },
  { source: 'Maturity_Date', target: 'maturityDate', ...common.date },
  { source: 'Interest_Rate_Pct', target: 'interestRatePct', ...common.rate },
  { source: 'Market_Interest_Rate_Pct', target: 'marketInterestRatePct', ...common.rate },
  { source: 'Product_Type', target: 'productType', type: 'enum', values: PRODUCT_TYPES },
  { source: 'Customer_Segment', ...common.segment },
  { source: 'Client_Rating', ...common.rating },
];

const HISTORICAL = [
  { source: 'Transaction_ID', target: 'transactionId', type: 'string', pattern: /^(AST|LIA)-\d+$/, patternHint: 'AST-<number> or LIA-<number>', unique: true },
  { source: 'Entity', ...common.entity },
  { source: 'Type', target: 'type', type: 'enum', values: ['Asset', 'Liability'], caseInsensitive: true },
  { source: 'Location', ...common.location },
  { source: 'Transaction_Date', target: 'transactionDate', ...common.date },
  { source: 'Customer_ID', ...common.customerId },
  { source: 'Customer_Segment', ...common.segment },
  { source: 'Client_Rating', ...common.rating },
  { source: 'Amount', ...common.amount },
  { source: 'Currency', ...common.currency },
  { source: 'Interest_Rate_Pct', target: 'interestRatePct', ...common.rate },
  { source: 'Market_Interest_Rate_Pct', target: 'marketInterestRatePct', ...common.rate },
  { source: 'Product_Type', target: 'productType', type: 'enum', values: [...LOAN_TYPES, ...PRODUCT_TYPES] },
  { source: 'Contractual_Maturity_Date', target: 'contractualMaturityDate', ...common.date },
  { source: 'Actual_Closure_Date', target: 'actualClosureDate', ...common.date, optional: true },
];

const RULESETS = {
  [DATASETS.ASSET]: { columns: ASSET, checkMaturityOrder: ['transactionDate', 'maturityDate'] },
  [DATASETS.LIABILITY]: { columns: LIABILITY, checkMaturityOrder: ['transactionDate', 'maturityDate'] },
  // PS does not require closure/maturity ordering for the historical log, so none is enforced.
  [DATASETS.HISTORICAL]: { columns: HISTORICAL, checkMaturityOrder: null },
};

module.exports = { RULESETS };
