/** Reel spin timing — turbo divides these durations. */
export const TIMING = {
  reelStaggerMs: 180,
  spinMs: 780,
  preSpinMs: 200,
  /** Max jelly settle after drive completes (ms). */
  spinJiggleSettleMs: 580,
  /** Per-reel delay before land jelly — left reel bounces first (ms). */
  spinJellyLandStaggerMs: 52,
  /** Residual grid spring after land (ms) — only if offset remains. */
  spinLandGridMs: 160,
  /** Post-land spin jelly — separate from cascade tumble jelly below. */
  spinJellyStiffness: 56,
  spinJellyDamping: 3.35,
  spinJellyMinMs: 440,
  spinJellyLandVelFactor: 0.44,
  spinJellySquashRatio: 0.028,
  spinJellyMaxBelowRatio: 0.065,
  spinJellyMaxAboveRatio: 0.072,
  spinJellyTailMs: 110,
  spinJellyChainCoupling: 0.38,
  /** Strip spring — lower damping = more wobble. */
  jiggleStripStiffness: 118,
  jiggleStripDamping: 12.2,
  jiggleStripMass: 1.06,
  /** Per-row lane springs (bottom row = slot 0). */
  jiggleRowStiffness: 75,
  jiggleRowStiffnessStep: 8,
  jiggleRowDamping: 9,
  jiggleRowDampingStep: 0.95,
  /** How much row lag follows strip velocity. */
  jiggleVelCoupling: 0.088,
  /** Row-to-row chain — higher = symbols wobble more relative to each other. */
  jiggleRowChainCoupling: 0.52,
  /** Max row lag offset (cell height fraction) — keeps lane packed. */
  jiggleMaxRowLagRatio: 0.08,
  paddingBase: 10,
  paddingPerReel: 2,
  /** Breath after land impact before first cascade highlight (ms). */
  firstCascadeLeadMs: 52,
  /** Brief lead before chained cascade highlights — unchanged chain timing. */
  cascadeLeadMs: 120,
  /** Win flash before symbols pop. */
  cascadeHighlightMs: 380,
  /** Non-win symbols dim/undim during cluster highlight. */
  cascadeDimInMs: 300,
  cascadeDimOutMs: 240,
  /** Win amount label — lingers a little longer than the highlight flash. */
  cascadeWinPopupMs: 560,
  /** Cascade ladder row fades after the round settles. */
  cascadeLadderFadeMs: 420,
  cascadePopMs: 195,
  tumbleGravityMs: 270,
  tumbleDropMs: 300,
  tumbleFillStaggerMs: 38,
  /** Performance blob — hold after strip land before gap + mini-tumble (ms). */
  blobHoldMs: 250,
  /** gameReveal — blank beat between fall-off and result drop-in (ms). */
  revealBlankMs: 120,
  /** Free-spin counter — tick when refill drop-in begins (see assignment below). */
  freeSpinCounterDelayMs: 0,
  /** gameReveal refill strip scroll — slightly slower than cascade tumbleDropMs. */
  revealRefillMs: 440,
  /**
   * Cascade tumble — uses spin land jelly params; only chain release timing is cascade-specific.
   */
  cascadeChainReleaseMs: 340,
  cascadeJiggleSettleMs: 640,
};

TIMING.freeSpinCounterDelayMs = TIMING.preSpinMs + TIMING.revealBlankMs;
