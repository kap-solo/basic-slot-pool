/**
 * Bet UI layout variant — desktop vs mobile.
 *
 * Desktop: Stake landscape screens (desktop, laptop, popout L/S).
 * Mobile: Stake mobile screens (mobile L/M/S) and portrait viewports.
 *
 * Stamped on the shell and bet-ui root as data-bet-ui-variant for CSS/JS.
 */

/** @typedef {'desktop' | 'mobile'} BetUiVariant */

export const BET_UI_VARIANT = {
  DESKTOP: 'desktop',
  MOBILE: 'mobile',
};

/** Stake screen ids that use the desktop bet UI. */
export const DESKTOP_SCREEN_IDS = new Set(['desktop', 'laptop', 'popout-l', 'popout-s']);

/** Stake screen ids that use the mobile bet UI. */
export const MOBILE_SCREEN_IDS = new Set(['mobile-l', 'mobile-m', 'mobile-s']);

/**
 * @param {HTMLElement | null | undefined} shell — `.suki-stake-shell`
 * @returns {BetUiVariant}
 */
export function resolveBetUiVariant(shell) {
  if (!shell) return BET_UI_VARIANT.MOBILE;

  const screenId = shell.dataset.sukiScreen || '';
  if (MOBILE_SCREEN_IDS.has(screenId)) return BET_UI_VARIANT.MOBILE;
  if (DESKTOP_SCREEN_IDS.has(screenId)) return BET_UI_VARIANT.DESKTOP;

  const orientation = shell.dataset.sukiOrientation || '';
  return orientation === 'landscape' ? BET_UI_VARIANT.DESKTOP : BET_UI_VARIANT.MOBILE;
}

/**
 * @param {HTMLElement | null | undefined} shell
 * @param {HTMLElement | null | undefined} betUiRoot — `#bet-ui-root`
 * @param {BetUiVariant} variant
 */
export function applyBetUiVariant(shell, betUiRoot, variant) {
  if (shell) {
    shell.dataset.betUiVariant = variant;
  }
  if (!betUiRoot) return;

  betUiRoot.dataset.betUiVariant = variant;
  betUiRoot.classList.remove('bet-ui-variant--desktop', 'bet-ui-variant--mobile');
  betUiRoot.classList.add(`bet-ui-variant--${variant}`);

  const inner = betUiRoot.querySelector('.suki-bet-ui');
  if (inner) {
    inner.dataset.betUiVariant = variant;
  }
}

/**
 * Keep bet UI variant in sync with Stake layout context (screen + orientation).
 *
 * @param {object} options
 * @param {HTMLElement} options.shell
 * @param {HTMLElement | null} [options.betUiRoot]
 * @param {(variant: BetUiVariant) => void} [options.onChange]
 * @param {(variant: BetUiVariant) => void} [options.onLayoutRefresh]
 */
export function initBetUiVariant({ shell, betUiRoot = null, onChange, onLayoutRefresh }) {
  /** @type {BetUiVariant | null} */
  let current = null;

  function refresh() {
    const variant = resolveBetUiVariant(shell);
    if (variant === current) {
      onLayoutRefresh?.(variant);
      return;
    }
    current = variant;
    applyBetUiVariant(shell, betUiRoot, variant);
    onChange?.(variant);
  }

  const observer = new MutationObserver(refresh);
  observer.observe(shell, {
    attributes: true,
    attributeFilter: ['data-suki-orientation', 'data-suki-screen', 'data-suki-portrait-family'],
  });
  window.addEventListener('resize', refresh);
  refresh();

  return {
    getVariant: () => current,
    refresh,
    destroy() {
      observer.disconnect();
      window.removeEventListener('resize', refresh);
    },
  };
}
