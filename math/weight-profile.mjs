/**
 * Player-facing profile — frequent token wins, moderate hits, rare tail.
 * Per-symbol pays in paytable.mjs — ordinary 0.08–0.14×, premium 4–6×.
 * Target ~45% hit rate, ~55% dead spins, ~96% RTP before lookup fine-tune.
 * Scatter tease (~1.5% spins) via tease-weight-profile.mjs.
 * Natural scatter feature adds ~0.5% trigger / ~8% RTP via feature-weight-profile.mjs.
 */

export const TARGET_RTP = 0.96;
export const MAX_RTP = 0.967;

/** Payout values in lookup centi-multipliers (100 = 1× bet). */
export const WEIGHT_PROFILE = [
  { band: 'loss', prob: 0.55, payoutCents: 0, minMult: 0, maxMult: 0 },
  { band: 'micro', prob: 0.14, payoutCents: 10, minMult: 0.08, maxMult: 0.14 },
  { band: 'small', prob: 0.09, payoutCents: 20, minMult: 0.15, maxMult: 0.35 },
  { band: 'medium', prob: 0.08, payoutCents: 70, minMult: 0.55, maxMult: 1.2 },
  { band: 'moderate', prob: 0.04, payoutCents: 350, minMult: 1.21, maxMult: 4.99 },
  { band: 'good', prob: 0.018, payoutCents: 700, minMult: 5, maxMult: 25 },
  { band: 'big', prob: 0.005, payoutCents: 5000, minMult: 45.01, maxMult: 120 },
  { band: 'huge', prob: 0.001, payoutCents: 14000, minMult: 120.01, maxMult: 250 },
];

export function profileTheoreticalRtp() {
  return WEIGHT_PROFILE.reduce((sum, row) => sum + row.prob * (row.payoutCents / 100), 0);
}

export const POOL_TARGETS = {
  loss: 150,
  micro: 65,
  small: 50,
  medium: 40,
  moderate: 35,
  good: 25,
  big: 15,
  huge: 8,
};

export const POOL_SCAN_LIMIT = 5_000_000;
