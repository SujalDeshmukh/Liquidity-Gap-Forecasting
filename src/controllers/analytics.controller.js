const asyncHandler = require('../utils/asyncHandler');
const HistoricalLog = require('../models/HistoricalLog');

// Output 6: Historical Behaviour Analytics
exports.getHistoricalAnalytics = asyncHandler(async (req, res) => {
    const { location, currency } = req.query;
    const scope = req.user.role === 'support' ? {} : { location: req.user.location };
    if (location && req.user.role === 'support') scope.location = location;
    if (currency) scope.currency = currency;

    const historicalData = await HistoricalLog.find(scope).lean();

    // 1. Early-exit rates over time (overall percentage)
    const totalClosed = historicalData.filter(t => t.actualClosureDate).length;
    const earlyExits = historicalData.filter(t => 
        t.actualClosureDate && new Date(t.actualClosureDate) < new Date(t.contractualMaturityDate)
    );
    const overallEarlyExitRate = totalClosed > 0 ? (earlyExits.length / totalClosed) * 100 : 0;

    // 2. Trends by product type and customer segment
    const segmentTrends = {};
    earlyExits.forEach(t => {
        const key = `${t.productType} - ${t.customerSegment}`;
        segmentTrends[key] = (segmentTrends[key] || 0) + 1;
    });

    // 3. Deposit outflow anomalies (90-day rolling average comparison)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const recentOutflows = historicalData.filter(t => 
        t.type === 'Liability' && t.actualClosureDate && new Date(t.actualClosureDate) >= ninetyDaysAgo
    );
    
    const totalOutflowAmount = recentOutflows.reduce((sum, t) => sum + t.amount, 0);
    const dailyAverageOutflow = totalOutflowAmount / 90;

    // Identify single-day spikes > 2x the 90-day average
    const outflowByDay = recentOutflows.reduce((acc, t) => {
        const dateStr = new Date(t.actualClosureDate).toISOString().split('T')[0];
        acc[dateStr] = (acc[dateStr] || 0) + t.amount;
        return acc;
    }, {});

    const anomalies = Object.entries(outflowByDay)
        .filter(([date, amount]) => amount > (dailyAverageOutflow * 2))
        .map(([date, amount]) => ({ date, amount, average: dailyAverageOutflow }));

    res.json({
        success: true,
        data: {
            overallEarlyExitRate: overallEarlyExitRate.toFixed(2) + '%',
            earlyExitsBySegmentAndProduct: segmentTrends,
            ninetyDayAverageOutflow: dailyAverageOutflow,
            anomalies
        }
    });
});
