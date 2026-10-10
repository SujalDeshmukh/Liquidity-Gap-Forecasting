// Output 5: Recommendations
exports.generateForBuckets = (buckets) => {
    const recommendations = [];

    Object.entries(buckets).forEach(([bucketName, data]) => {
        const gap = data.netGap;
        
        if (gap < 0) {
            const amountStr = Math.abs(gap).toLocaleString(undefined, { minimumFractionDigits: 2 });
            if (['0-1M', '1-3M'].includes(bucketName)) {
                recommendations.push(`Raise short-term funding of ${amountStr} to cover a projected liquidity shortfall in the ${bucketName} window.`);
            } else {
                recommendations.push(`Monitor increasing structural liquidity shortfall of ${amountStr} in the ${bucketName} horizon. Consider extending deposit maturities.`);
            }
        } else if (gap > 0 && ['0-1M', '1-3M', '3-12M'].includes(bucketName)) {
            const amountStr = gap.toLocaleString(undefined, { minimumFractionDigits: 2 });
            recommendations.push(`Review surplus liquidity of ${amountStr} in the ${bucketName} bucket for potential short-term investment.`);
        }
    });

    // Assess overall risk
    const earlyExitHighRiskCount = Object.values(buckets)
        .flatMap(b => b.transactions)
        .filter(t => t.type === 'Liability' && t.probability > 0.6).length;

    if (earlyExitHighRiskCount > 10) {
        recommendations.push("Monitor increased early-withdrawal risk in the selected portfolio; high probability of deposit flight detected.");
    }

    return recommendations;
};