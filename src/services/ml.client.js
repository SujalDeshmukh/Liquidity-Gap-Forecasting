'use strict';
/**
 * HTTP client for the Python FastAPI ML service. The request/response contract is
 * documented in docs/ML_CONTRACT.md - keep both sides in sync.
 */
const axios = require('axios');
const config = require('../config');
const AppError = require('../utils/AppError');
const { toISODate } = require('../utils/dates');

const http = axios.create({ baseURL: config.ml.url, timeout: config.ml.timeoutMs });

/** Live book document -> ML feature payload (snake_case mirrors historical_log columns). */
function toMlPayload(txn, side, calcDate) {
  return {
    transaction_id: txn.transactionId,
    type: side, // 'Asset' | 'Liability'
    entity: txn.entity,
    location: txn.location,
    customer_id: txn.customerId,
    customer_segment: txn.customerSegment,
    client_rating: txn.clientRating,
    amount: txn.amount,
    currency: txn.currency,
    interest_rate_pct: txn.interestRatePct,
    market_interest_rate_pct: txn.marketInterestRatePct,
    product_type: txn.productType,
    transaction_date: toISODate(txn.transactionDate),
    contractual_maturity_date: toISODate(txn.maturityDate),
    calculation_date: toISODate(calcDate),
  };
}

function wrapError(err, what) {
  if (err.response) {
    return AppError.unavailable(`ML service rejected ${what} (HTTP ${err.response.status})`, err.response.data);
  }
  return AppError.unavailable(`ML service unreachable at ${config.ml.url}: ${err.code || err.message}`);
}

async function health() {
  try {
    const { data } = await http.get('/health', { timeout: 3000 });
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err.code || err.message, url: config.ml.url };
  }
}

/** @param {object[]} transactions output of toMlPayload */
async function predict(transactions) {
  try {
    const { data } = await http.post('/predict', { transactions });
    if (!data || !Array.isArray(data.predictions)) throw new Error('Malformed response: predictions[] missing');
    return data;
  } catch (err) {
    if (err.isOperational) throw err;
    if (err.message && err.message.startsWith('Malformed')) throw AppError.unavailable(err.message);
    throw wrapError(err, 'the prediction request');
  }
}

module.exports = { health, predict, toMlPayload };
