/**
 * Scatter tease — 1–2 scatters on base reveal, no bonus. Initial deal only (SC refill weight 0).
 */

/** Payout centi-multipliers (100 = 1× base bet). */
export const TEASE_WEIGHT_PROFILE = [
  { band: 'tease_1_loss', prob: 0.008, payoutCents: 0, minMult: 0, maxMult: 0, scatterCount: 1 },
  { band: 'tease_1_win', prob: 0.004, payoutCents: 25, minMult: 0.08, maxMult: 1.5, scatterCount: 1 },
  { band: 'tease_2_loss', prob: 0.002, payoutCents: 0, minMult: 0, maxMult: 0, scatterCount: 2 },
  { band: 'tease_2_win', prob: 0.001, payoutCents: 40, minMult: 0.08, maxMult: 2.5, scatterCount: 2 },
];

export const TEASE_POOL_TARGETS = {
  tease_1_loss: 14,
  tease_1_win: 10,
  tease_2_loss: 8,
  tease_2_win: 6,
};

export function teaseProfileTriggerRate() {
  return TEASE_WEIGHT_PROFILE.reduce((sum, row) => sum + row.prob, 0);
}

export function teaseProfileTheoreticalMean() {
  return TEASE_WEIGHT_PROFILE.reduce((sum, row) => sum + row.prob * (row.payoutCents / 100), 0);
}
