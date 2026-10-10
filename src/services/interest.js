'use strict';
/**
 * Simple interest, settled in full at maturity (PS guardrail IX.ii):
 *   interest = principal x (rate% / 100) x days(transactionDate -> settlementDate) / basis
 * The settlement date is the contractual maturity for the deterministic view, and the
 * adjusted / shifted maturity for behavioural and what-if views (interest stops accruing
 * when the contract closes early).
 */
const config = require('../config');
const { daysBetween } = require('../utils/dates');

function simpleInterest(principal, ratePct, fromDate, toDate, basis = config.calc.dayCountBasis) {
  const days = Math.max(0, daysBetween(fromDate, toDate));
  return (principal * (ratePct / 100) * days) / basis;
}

/** Total cash that moves on `settlementDate` for one transaction. */
function cashflowAt(txn, settlementDate) {
  const interest = simpleInterest(txn.amount, txn.interestRatePct, txn.transactionDate, settlementDate);
  return { principal: txn.amount, interest, total: txn.amount + interest };
}

/** Fields persisted at ingestion for the contractual view. */
function deriveContractualFields(txn) {
  const tenorDays = daysBetween(txn.transactionDate, txn.maturityDate);
  const { interest, total } = cashflowAt(txn, txn.maturityDate);
  return { tenorDays, interestAmount: round2(interest), maturityAmount: round2(total) };
}

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { simpleInterest, cashflowAt, deriveContractualFields, round2 };
