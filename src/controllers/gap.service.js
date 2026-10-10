const Asset = require('../models/Asset');
const Liability = require('../models/Liability');
const mlClient = require('./ml.client');
const recommendationService = require('./recommendation.service');
const { calculateTimeBucket, calculateSimpleInterest, addDays } = require('../utils/dates');

exports.calculateLadder = async (calculationDate = new Date(), scope, mode = 'deterministic', whatIfShifts = { assetShift: 0, liabilityShift: 0 }) => {
    const query = {};
    if (scope.currency) query.currency = scope.currency;
    if (scope.location) query.location = scope.location;

    const assets = await Asset.find(query).lean();
    const liabilities = await Liability.find(query).lean();

    let predictions = new Map();
    if (mode === 'behavioural' && (assets.length > 0 || liabilities.length > 0)) {
        // Fetch AI adjustments from Python backend (does not re-run during what-if scenarios if cached/passed properly)
        const mlResponse = await mlClient.getPredictions(assets, liabilities, calculationDate);
        predictions = new Map(mlResponse.map(p => [p.transactionId, p]));
    }

    const buckets = initializeBuckets();

    // Process Assets
    assets.forEach(asset => {
        let maturityDate = new Date(asset.maturityDate);
        const prediction = predictions.get(asset.transactionId);
        
        if (mode === 'behavioural' && prediction) {
            maturityDate = new Date(prediction.adjustedMaturityDate);
        }
        if (whatIfShifts.assetShift) {
            maturityDate = addDays(maturityDate, whatIfShifts.assetShift);
        }

        const amount = asset.loanAmount + calculateSimpleInterest(asset.loanAmount, asset.interestRatePct, asset.transactionDate, maturityDate);
        const bucketKey = calculateTimeBucket(new Date(calculationDate), maturityDate);
        
        if (buckets[bucketKey]) {
            buckets[bucketKey].inflows += amount;
            // Output 4: Transaction Drill-Down structure
            buckets[bucketKey].transactions.push({
                transactionId: asset.transactionId,
                type: 'Asset',
                amount: amount,
                contractualMaturityDate: asset.maturityDate,
                adjustedMaturityDate: maturityDate,
                probability: prediction?.probability || null,
                rationale: prediction?.rationale || null
            });
        }
    });

    // Process Liabilities
    liabilities.forEach(liability => {
        let maturityDate = new Date(liability.maturityDate);
        const prediction = predictions.get(liability.transactionId);
        
        if (mode === 'behavioural' && prediction) {
            maturityDate = new Date(prediction.adjustedMaturityDate);
        }
        if (whatIfShifts.liabilityShift) {
            maturityDate = addDays(maturityDate, whatIfShifts.liabilityShift);
        }

        const amount = liability.amount + calculateSimpleInterest(liability.amount, liability.interestRatePct, liability.transactionDate, maturityDate);
        const bucketKey = calculateTimeBucket(new Date(calculationDate), maturityDate);
        
        if (buckets[bucketKey]) {
            buckets[bucketKey].outflows += amount;
            // Output 4: Transaction Drill-Down structure
            buckets[bucketKey].transactions.push({
                transactionId: liability.transactionId,
                type: 'Liability',
                amount: amount,
                contractualMaturityDate: liability.maturityDate,
                adjustedMaturityDate: maturityDate,
                probability: prediction?.probability || null,
                rationale: prediction?.rationale || null
            });
        }
    });

    // Compute Net Gap and Generate Recommendations
    Object.keys(buckets).forEach(key => {
        buckets[key].netGap = buckets[key].inflows - buckets[key].outflows;
    });

    // Output 5: Recommendations
    const recommendations = recommendationService.generateForBuckets(buckets);

    return { buckets, recommendations };
};

const initializeBuckets = () => ({
    '0-1M': { inflows: 0, outflows: 0, netGap: 0, transactions: [] },
    '1-3M': { inflows: 0, outflows: 0, netGap: 0, transactions: [] },
    '3-12M': { inflows: 0, outflows: 0, netGap: 0, transactions: [] },
    '1-5Y': { inflows: 0, outflows: 0, netGap: 0, transactions: [] },
    '>5Y': { inflows: 0, outflows: 0, netGap: 0, transactions: [] }
});