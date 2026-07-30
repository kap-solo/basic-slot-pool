/** Re-export Stake screen inference from Suki Engine. */
export {
  readViewportSize,
  isPopoutSSize,
  inferPopoutSScreen,
  inferPopoutSFromRoot,
  applyInferredStakeScreen,
  schedulePopoutSInference,
  patchStakeLayoutForProduction,
  isPopoutSViewport,
} from '@kap-solo/suki-engine/client/suki/stakeScreenInfer.js';
