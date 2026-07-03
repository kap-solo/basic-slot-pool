/**
 * RTP and volatility analysis for lookup tables + book pools.
 */

/**
 * @param {{ id: number, weight: number, payout: number }[]} lookup payout in cents (100 = 1×)
 * @param {Map<number, { payoutMultiplier: number, events?: object[] }>} books
 */
export function analyzeLookup(lookup, books) {
  const weightTotal = lookup.reduce((sum, row) => sum + row.weight, 0);
  let rtp = 0;
  let hitRate = 0;
  let sumSquares = 0;
  let maxPay = 0;
  let cascadeHitRate = 0;
  let cascadeStepsSum = 0;
  let winCount = 0;

  for (const row of lookup) {
    const p = row.weight / weightTotal;
    const mult = row.payout / 100;
    rtp += p * mult;
    sumSquares += p * mult * mult;
    if (mult > 0) hitRate += p;
    if (mult > maxPay) maxPay = mult;

    const book = books.get(row.id);
    if (!book) continue;
    const cascades = countCascadeSteps(book);
    if (mult > 0) {
      winCount += 1;
      cascadeStepsSum += cascades;
      if (cascades >= 2) cascadeHitRate += p;
    }
  }

  const variance = sumSquares - rtp * rtp;
  const stdDev = Math.sqrt(Math.max(0, variance));

  return {
    rtp,
    rtpPercent: rtp * 100,
    hitRate,
    hitRatePercent: hitRate * 100,
    stdDev,
    maxPay,
    avgCascadeStepsOnWin: winCount ? cascadeStepsSum / winCount : 0,
    multiCascadeRate: cascadeHitRate,
    multiCascadeRatePercent: cascadeHitRate * 100,
    bookCount: lookup.length,
    weightTotal,
  };
}

/** @param {{ events?: object[] }} book */
export function countCascadeSteps(book) {
  return (book.events ?? []).filter((event) => event.type === 'clusterWin').length;
}

/**
 * @param {object} stats
 * @param {{ targetRtp?: number, maxRtp?: number }} [opts]
 */
export function formatStatsReport(stats, { targetRtp = 0.96, maxRtp = 0.967 } = {}) {
  const lines = [
    `RTP:           ${stats.rtpPercent.toFixed(3)}% (target ${(targetRtp * 100).toFixed(1)}%, cap ${(maxRtp * 100).toFixed(1)}%)`,
    `Hit rate:      ${stats.hitRatePercent.toFixed(2)}% (any win > 0)`,
    `Std dev:       ${stats.stdDev.toFixed(2)}× (medium vol target ~8–14×)`,
    `Max payout:    ${stats.maxPay.toFixed(2)}×`,
    `Multi-cascade: ${stats.multiCascadeRatePercent.toFixed(2)}% of spins reach 2+ cascade steps`,
    `Books:         ${stats.bookCount}`,
  ];
  if (stats.rtp > maxRtp) lines.push('⚠ RTP exceeds regulatory cap — reduce high-tier weights or pays.');
  return lines.join('\n');
}
