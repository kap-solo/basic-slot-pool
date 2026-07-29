/** Spine motion tracks that play at real-time speed (never scrub/timeScale-compressed). */

/** @param {string} animName */
export function isSpinFallAnim(animName) {
  return animName.startsWith('fall_');
}

/** @param {string} animName */
export function isMotionFallAnim(animName) {
  return isSpinFallAnim(animName);
}

/** @param {string} animName */
export function isRealtimeMotionAnim(animName) {
  return isSpinFallAnim(animName);
}
