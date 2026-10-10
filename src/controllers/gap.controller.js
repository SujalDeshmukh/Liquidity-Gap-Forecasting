const asyncHandler = require('../utils/asyncHandler');
const gapService = require('../services/gap.service');

// Output 1: Deterministic Liquidity Gap Ladder & Output 4: Drill-Down
exports.getDeterministicLadder = asyncHandler(async (req, res) => {
    const { calculationDate, currency, location } = req.query;
    const scope = req.user.role === 'support' ? { currency, location } : { currency, location: req.user.location };
    
    const data = await gapService.calculateLadder(calculationDate, scope, 'deterministic');
    res.json({ success: true, data });
});

// Output 2: AI-Adjusted Liquidity Gap Ladder & Output 4: Drill-Down
exports.getBehaviouralLadder = asyncHandler(async (req, res) => {
    const { calculationDate, currency, location } = req.query;
    const scope = req.user.role === 'support' ? { currency, location } : { currency, location: req.user.location };
    
    const data = await gapService.calculateLadder(calculationDate, scope, 'behavioural');
    res.json({ success: true, data });
});

// Output 3: Gap Comparison
exports.getGapComparison = asyncHandler(async (req, res) => {
    const { calculationDate, currency, location } = req.query;
    const scope = req.user.role === 'support' ? { currency, location } : { currency, location: req.user.location };
    
    const deterministic = await gapService.calculateLadder(calculationDate, scope, 'deterministic');
    const behavioural = await gapService.calculateLadder(calculationDate, scope, 'behavioural');
    
    const comparison = Object.keys(deterministic.buckets).reduce((acc, bucket) => {
        acc[bucket] = {
            deterministicGap: deterministic.buckets[bucket].netGap,
            behaviouralGap: behavioural.buckets[bucket].netGap,
            variance: behavioural.buckets[bucket].netGap - deterministic.buckets[bucket].netGap
        };
        return acc;
    }, {});

    res.json({ success: true, data: comparison });
});

// Output 7: What-if Scenario Results
exports.getWhatIfScenario = asyncHandler(async (req, res) => {
    // Expects tenor shifts in days (e.g., assetShiftDays: 14, liabilityShiftDays: -30)
    const { calculationDate, currency, location, assetShiftDays, liabilityShiftDays, baseModel = 'deterministic' } = req.query;
    const scope = req.user.role === 'support' ? { currency, location } : { currency, location: req.user.location };
    
    const data = await gapService.calculateLadder(calculationDate, scope, baseModel, {
        assetShift: parseInt(assetShiftDays) || 0,
        liabilityShift: parseInt(liabilityShiftDays) || 0
    });
    
    res.json({ success: true, data });
});