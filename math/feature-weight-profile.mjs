/**
 * Natural scatter feature — ~1/200 trigger, ~16× average total, ~8% feature RTP.
 */

export const FEATURE_TRIGGER_PROB = 0.005;
export const FEATURE_TARGET_MEAN_MULT = 16;
export const FEATURE_TARGET_RTP_SHARE = FEATURE_TRIGGER_PROB * FEATURE_TARGET_MEAN_MULT;

/** Payout centi-multipliers (100 = 1× base bet). */
export const FEATURE_WEIGHT_PROFILE = [
  { band: 'feature_whiff', prob: 0.0008, payoutCents: 250, minMult: 0, maxMult: 5.99 },
  { band: 'feature_low', prob: 0.0012, payoutCents: 900, minMult: 6, maxMult: 11.99 },
  { band: 'feature_core', prob: 0.0016, payoutCents: 1600, minMult: 12, maxMult: 19.99 },
  { band: 'feature_strong', prob: 0.0011, payoutCents: 2100, minMult: 20, maxMult: 27.99 },
  { band: 'feature_peak', prob: 0.0006, payoutCents: 3000, minMult: 28, maxMult: 40 },
  { band: 'feature_rare', prob: 0.0002, payoutCents: 4800, minMult: 40.01, maxMult: 160 },
];

export const FEATURE_POOL_TARGETS = {
  feature_whiff: 6,
  feature_low: 12,
  feature_core: 24,
  feature_strong: 14,
  feature_peak: 8,
  feature_rare: 4,
};

export function featureProfileTheoreticalMean() {
  return FEATURE_WEIGHT_PROFILE.reduce((sum, row) => sum + row.prob * (row.payoutCents / 100), 0);
}

export function featureProfileTriggerRate() {
  return FEATURE_WEIGHT_PROFILE.reduce((sum, row) => sum + row.prob, 0);
}
