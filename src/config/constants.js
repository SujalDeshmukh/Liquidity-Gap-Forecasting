'use strict';
/** Domain enumerations taken verbatim from the PS rule sets (section VII.i). */

const ENTITY_LOCATION = Object.freeze({
  'IBC HongKong': 'Hong Kong',
  'IBC USA': 'New York',
  'IBC UK': 'London',
  'IBC Singapore': 'Singapore',
  'IBC SA': 'Paris',
});

const ENTITIES = Object.keys(ENTITY_LOCATION);
const LOCATIONS = Object.values(ENTITY_LOCATION);
const CURRENCIES = ['USD', 'EUR', 'GBP', 'SGD', 'HKD'];
const SEGMENTS = ['Retail', 'Corporate', 'SME', 'Institutional'];
const LOAN_TYPES = ['Loan-Type-A', 'Loan-Type-B', 'Loan-Type-C', 'Loan-Type-D', 'Loan-Type-E'];
const PRODUCT_TYPES = ['Product-A', 'Product-B', 'Product-C', 'Product-D', 'Product-E'];

/** Standard maturity buckets. `months` is the inclusive upper bound measured from the calculation date. */
const BUCKETS = Object.freeze([
  { key: '0-1M', label: '0–1M', months: 1 },
  { key: '1-3M', label: '1–3M', months: 3 },
  { key: '3-12M', label: '3–12M', months: 12 },
  { key: '1-5Y', label: '1–5Y', months: 60 },
  { key: '>5Y', label: '>5Y', months: Infinity },
]);
const BUCKET_KEYS = BUCKETS.map((b) => b.key);

const ROLES = Object.freeze({ SUPPORT: 'SUPPORT', LOCATION_USER: 'LOCATION_USER' });
const DATASETS = Object.freeze({ ASSET: 'ASSET', LIABILITY: 'LIABILITY', HISTORICAL: 'HISTORICAL' });
const LADDER_MODES = Object.freeze({ DETERMINISTIC: 'deterministic', BEHAVIOURAL: 'behavioural' });

module.exports = {
  ENTITY_LOCATION, ENTITIES, LOCATIONS, CURRENCIES, SEGMENTS, LOAN_TYPES, PRODUCT_TYPES,
  BUCKETS, BUCKET_KEYS, ROLES, DATASETS, LADDER_MODES,
};
