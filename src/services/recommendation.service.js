'use strict';
/**
 * Rule-based recommendation engine (PS VII.xi) driven by BEHAVIOURAL gaps per
 * currency x location x bucket, with the deterministic gap shown for context.
 * Rules are plain data so treasury users can tune wording without code changes.
 */
const config = require('../config');

const ACTIONS = {
  shortfall: {
    '0-1M': 'Raise short-term funding (overnight / repo / interbank)',
    '1-3M': 'Raise short-term funding (1–3M money market or CDs)',
    '3-12M': 'Raise term funding or run a term-deposit campaign',
    '1-5Y': 'Issue medium-term debt or lengthen deposit tenors',
    '>5Y': 'Secure long-term structural funding',
  },
  surplus: {
    '0-1M': 'Place surplus in overnight / money-market deposits',
    '1-3M': 'Invest surplus in 3M Treasury bills',
    '3-12M': 'Invest surplus in 6M Treasury',
    '1-5Y': 'Invest surplus in a 1–5Y government bond ladder',
    '>5Y': 'Deploy surplus into long-dated assets or reduce long-term funding',
  },
};

function formatAmount(n, ccy) {
  const abs = Math.abs(n);
  const s = abs >= 1e9 ? `${(abs / 1e9).toFixed(2)}B` : abs >= 1e6 ? `${(abs / 1e6).toFixed(1)}M` : `${Math.round(abs / 1e3)}K`;
  return `${ccy} ${s}`;
}

function roundUp(n, unit) {
  return Math.ceil(Math.abs(n) / unit) * unit;
}

function severityOf(gap, bucketKey, assets, liabilities) {
  const gross = Math.max(assets, liabilities, 1);
  let ratio = Math.abs(gap) / gross;
  if (gap < 0 && (bucketKey === '0-1M' || bucketKey === '1-3M')) ratio *= 1.5; // near-term shortfalls are more urgent
  if (ratio >= 0.5) return 'HIGH';
  if (ratio >= 0.2) return 'MEDIUM';
  return 'LOW';
}

/**
 * @param {object} beh  behavioural ladder (with breakdown)
 * @param {object} det  deterministic ladder (with breakdown) for the same filters
 * @param {object} [opts] { minGap, roundTo }
 */
function generateRecommendations(beh, det, opts = {}) {
  const minGap = opts.minGap ?? config.reco.minGap;
  const roundTo = opts.roundTo ?? config.reco.roundTo;
  const detIndex = new Map(det.breakdown.map((r) => [`${r.currency}|${r.location}`, r]));
  const out = [];

  for (const row of beh.breakdown) {
    const detRow = detIndex.get(`${row.currency}|${row.location}`);
    row.buckets.forEach((b, i) => {
      if (Math.abs(b.netGap) < minGap) return;
      const kind = b.netGap < 0 ? 'shortfall' : 'surplus';
      const amount = roundUp(b.netGap, roundTo);
      const detGap = detRow ? detRow.buckets[i].netGap : 0;
      const delta = b.netGap - detGap;
      const rationale = [
        `Behavioural ${kind === 'shortfall' ? 'outflows exceed inflows' : 'inflows exceed outflows'} by ${formatAmount(b.netGap, row.currency)} in ${b.label}.`,
        `Contractual view: ${detGap < 0 ? 'shortfall' : 'surplus'} of ${formatAmount(detGap, row.currency)}.`,
        Math.abs(delta) >= minGap / 2
          ? `Customer behaviour ${delta < 0 ? 'worsens' : 'improves'} this bucket by ${formatAmount(delta, row.currency)}.`
          : 'Behaviour has little effect on this bucket.',
      ].join(' ');
      out.push({
        id: `${row.currency}-${row.location}-${b.key}`.replace(/\s+/g, ''),
        currency: row.currency,
        location: row.location,
        bucket: b.key,
        bucketLabel: b.label,
        type: kind === 'shortfall' ? 'FUNDING' : 'INVESTMENT',
        severity: severityOf(b.netGap, b.key, b.assets, b.liabilities),
        behaviouralGap: b.netGap,
        deterministicGap: detGap,
        amount,
        action: `${ACTIONS[kind][b.key]} – ${formatAmount(amount, row.currency)}`,
        rationale,
      });
    });
  }

  const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || Math.abs(b.behaviouralGap) - Math.abs(a.behaviouralGap));
}

module.exports = { generateRecommendations, formatAmount, ACTIONS };
