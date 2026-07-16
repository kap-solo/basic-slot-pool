/**
 * Infer Popout S on Stake production when the dev preview toolbar is absent.
 * Other Stake viewports intentionally leave data-suki-screen unset — they worked
 * with generic orientation CSS before Popout S needed special handling.
 */

import { STAKE_SCREENS, createScreenRegistry } from '@kap-solo/suki-engine/client/suki/stakeScreens.js';
import { showDevTools } from '@kap-solo/suki-engine/client/suki/environment.js';

const screenRegistry = createScreenRegistry();
const POPOUT_S = STAKE_SCREENS.find((s) => s.id === 'popout-s') ?? null;

/** @typedef {import('@kap-solo/suki-engine/client/suki/stakeScreens.js').StakeScreen} StakeScreen */

/**
 * @returns {{ width: number, height: number }}
 */
export function readViewportSize() {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const width = Math.round(
    window.visualViewport?.width
    ?? document.documentElement?.clientWidth
    ?? window.innerWidth
    ?? 0,
  );
  const height = Math.round(
    window.visualViewport?.height
    ?? document.documentElement?.clientHeight
    ?? window.innerHeight
    ?? 0,
  );
  return { width, height };
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {boolean}
 */
export function isPopoutSSize(width, height) {
  if (!POPOUT_S) return false;
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 1 || h < 1) return false;
  if (w / Math.max(h, 1) < 1.35) return false;

  const tolerance = Math.max(16, Math.round(Math.min(w, h) * 0.08));
  const dw = Math.abs(w - POPOUT_S.width);
  const dh = Math.abs(h - POPOUT_S.height);
  if (dw <= tolerance && dh <= tolerance) return true;

  return h <= 320 && w <= 640;
}

/**
 * @param {number} width
 * @param {number} height
 * @returns {StakeScreen | null}
 */
export function inferPopoutSScreen(width, height) {
  if (!POPOUT_S) return null;

  const urlId = screenRegistry.resolveIdFromUrl();
  if (urlId === 'popout-s') return POPOUT_S;

  return isPopoutSSize(width, height) ? POPOUT_S : null;
}

/**
 * @param {HTMLElement | null | undefined} root
 * @returns {StakeScreen | null}
 */
export function inferPopoutSFromRoot(root) {
  const { width, height } = readViewportSize();
  const rect = root?.getBoundingClientRect();
  const shellW = Math.round(rect?.width ?? 0);
  const shellH = Math.round(rect?.height ?? 0);

  if (shellW >= 32 && shellH >= 32 && isPopoutSSize(shellW, shellH)) {
    return POPOUT_S;
  }

  return inferPopoutSScreen(width, height);
}

/**
 * @param {HTMLElement} root
 * @param {boolean} active
 */
function stampPopoutS(root, active) {
  root.classList.toggle('suki-viewport-popout-s', active);
  if (active) {
    root.dataset.sukiScreen = 'popout-s';
  } else if (root.dataset.sukiScreen === 'popout-s') {
    delete root.dataset.sukiScreen;
  }
}

/**
 * @param {HTMLElement | null | undefined} root
 * @param {() => void} [onApplied]
 * @returns {StakeScreen | null}
 */
export function applyInferredStakeScreen(root, onApplied) {
  if (!root || showDevTools()) return null;

  const wasPopoutS = root.classList.contains('suki-viewport-popout-s');
  const inferred = inferPopoutSFromRoot(root);
  const isPopoutS = inferred?.id === 'popout-s';

  stampPopoutS(root, isPopoutS);
  if (wasPopoutS !== isPopoutS) onApplied?.();
  return inferred;
}

/**
 * @param {HTMLElement | null | undefined} root
 * @param {{ refresh?: () => void } | null | undefined} stakeLayout
 * @param {() => void} [onApplied]
 */
export function patchStakeLayoutForProduction(root, stakeLayout, onApplied) {
  if (!root || !stakeLayout?.refresh || showDevTools()) return;

  const refresh = stakeLayout.refresh.bind(stakeLayout);
  stakeLayout.refresh = () => {
    refresh();
    applyInferredStakeScreen(root, onApplied);
  };

  let attempts = 0;
  function schedule() {
    if (attempts >= 24) return;
    attempts += 1;
    applyInferredStakeScreen(root, onApplied);
    const { width, height } = readViewportSize();
    if (!root.classList.contains('suki-viewport-popout-s') && isPopoutSSize(width, height)) {
      requestAnimationFrame(schedule);
    }
  }

  schedule();
}

/** @param {HTMLElement | null | undefined} shell */
export function isPopoutSViewport(shell) {
  if (shell?.dataset.sukiScreen === 'popout-s') return true;
  if (shell?.classList.contains('suki-viewport-popout-s')) return true;
  const { width, height } = readViewportSize();
  return isPopoutSSize(width, height);
}
