/**
 * Buy Bonus profile — 20× base bet, ~19× average feature win, ~96% buy RTP.
 */

export const BUY_COST_MULT = 20;
export const BUY_TARGET_MEAN_MULT = 19;
export const BUY_TARGET_RTP = 0.96;
export const BUY_MAX_RTP = 0.968;

/** Payout centi-multipliers (100 = 1× base bet). */
export const BUY_WEIGHT_PROFILE = [
  { band: 'buy_low', prob: 0.12, payoutCents: 800, minMult: 6, maxMult: 11.9 },
  { band: 'buy_core', prob: 0.48, payoutCents: 1800, minMult: 14, maxMult: 20.9 },
  { band: 'buy_strong', prob: 0.28, payoutCents: 2200, minMult: 21, maxMult: 27.9 },
  { band: 'buy_peak', prob: 0.09, payoutCents: 3400, minMult: 28, maxMult: 42 },
  { band: 'buy_rare', prob: 0.03, payoutCents: 5500, minMult: 42.01, maxMult: 75 },
];

export const BUY_POOL_TARGETS = {
  buy_low: 10,
  buy_core: 28,
  buy_strong: 18,
  buy_peak: 8,
  buy_rare: 4,
};

export function buyProfileTheoreticalMean() {
  return BUY_WEIGHT_PROFILE.reduce((sum, row) => sum + row.prob * (row.payoutCents / 100), 0);
}

export function buyProfileTheoreticalRtp() {
  return buyProfileTheoreticalMean() / BUY_COST_MULT;
}
