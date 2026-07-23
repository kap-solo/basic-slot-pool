/**
 * Desktop landscape background — crossfades to bonus art during free spins.
 * Transition timing matches character bonus mode (900ms ease).
 */

import { BET_UI_VARIANT, resolveBetUiVariant } from './betUiVariant.js';

/** Bonus/base crossfade duration (ms) — keep in sync with character.js. */
const BG_CROSSFADE_MS = 900;

/** @type {Promise<void>} */
let modeTransition = Promise.resolve();

/** @type {{
 *   host: HTMLElement,
 *   shell: HTMLElement,
 *   stack: HTMLElement,
 *   baseLayer: HTMLElement,
 *   bonusLayer: HTMLElement,
 *   inBonusMode: boolean,
 * } | null} */
let hostContext = null;

/**
 * @param {HTMLElement} host
 */
function ensureHostStack(host) {
  if (hostContext?.host === host) return hostContext;

  const stack = document.createElement('div');
  stack.className = 'suki-bg__stack';

  const baseLayer = document.createElement('div');
  baseLayer.className = 'suki-bg__layer suki-bg__layer--base is-visible';

  const bonusLayer = document.createElement('div');
  bonusLayer.className = 'suki-bg__layer suki-bg__layer--bonus is-hidden';

  stack.append(baseLayer, bonusLayer);
  stack.style.setProperty('--bg-crossfade-ms', `${BG_CROSSFADE_MS}ms`);
  host.replaceChildren(stack);
  host.dataset.bgMount = 'stack';

  hostContext = {
    host,
    shell: hostContext?.shell ?? host,
    stack,
    baseLayer,
    bonusLayer,
    inBonusMode: false,
  };
  return hostContext;
}

function destroyBackgroundHost() {
  hostContext?.host.replaceChildren();
  if (hostContext?.host) {
    delete hostContext.host.dataset.bgMount;
  }
  hostContext = null;
}

/**
 * @param {HTMLElement} layer
 * @param {boolean} visible
 * @param {{ animate?: boolean }} [opts]
 */
function setLayerVisible(layer, visible, { animate = true } = {}) {
  layer.classList.toggle('is-visible', visible);
  layer.classList.toggle('is-hidden', !visible);
  if (animate) return waitForLayerFade(layer);
  layer.style.transitionDuration = '0ms';
  void layer.offsetWidth;
  layer.style.transitionDuration = '';
  return Promise.resolve();
}

/** @param {HTMLElement} layer */
function waitForLayerFade(layer) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      layer.removeEventListener('transitionend', onTransitionEnd);
      clearTimeout(fallback);
      resolve();
    };
    const onTransitionEnd = (event) => {
      if (event.target !== layer || event.propertyName !== 'opacity') return;
      finish();
    };
    layer.addEventListener('transitionend', onTransitionEnd);
    const fallback = setTimeout(finish, BG_CROSSFADE_MS + 80);
  });
}

/**
 * @param {{ animate?: boolean }} [opts]
 */
function syncBackgroundLayers({ animate = true } = {}) {
  if (!hostContext) return Promise.resolve();
  const { baseLayer, bonusLayer, inBonusMode } = hostContext;
  const showBonus = inBonusMode;

  if (!animate) {
    baseLayer.classList.toggle('is-visible', !showBonus);
    baseLayer.classList.toggle('is-hidden', showBonus);
    bonusLayer.classList.toggle('is-visible', showBonus);
    bonusLayer.classList.toggle('is-hidden', !showBonus);
    return Promise.resolve();
  }

  return Promise.all([
    setLayerVisible(baseLayer, !showBonus, { animate: true }),
    setLayerVisible(bonusLayer, showBonus, { animate: true }),
  ]).then(() => {});
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} shell
 */
function refreshBackground(host, shell) {
  const isDesktop = resolveBetUiVariant(shell) === BET_UI_VARIANT.DESKTOP;
  if (!isDesktop) {
    destroyBackgroundHost();
    return;
  }
  ensureHostStack(host);
  syncBackgroundLayers({ animate: false });
}

/**
 * @param {boolean} active
 * @param {{ animate?: boolean }} [opts]
 */
async function applyBonusMode(active, { animate = true } = {}) {
  if (!hostContext) return;
  if (hostContext.inBonusMode === active) {
    syncBackgroundLayers({ animate: false });
    return;
  }

  hostContext.inBonusMode = active;
  await syncBackgroundLayers({ animate });
}

/**
 * @param {boolean} active
 * @param {{ animate?: boolean }} [opts]
 */
export function setBackgroundBonusMode(active, { animate = true } = {}) {
  modeTransition = modeTransition
    .then(() => applyBonusMode(active, { animate }))
    .catch((err) => {
      console.warn('[Basic Slot] Background bonus mode transition failed.', err);
    });
  return modeTransition;
}

/**
 * @param {object} options
 * @param {HTMLElement | null | undefined} options.host
 * @param {HTMLElement | null | undefined} options.shell
 */
export function initGameBackground({ host, shell }) {
  if (!host || !shell) {
    return {
      destroy() {},
      setBonusMode: setBackgroundBonusMode,
    };
  }

  if (hostContext) hostContext.shell = shell;

  const observer = new MutationObserver(() => refreshBackground(host, shell));
  observer.observe(shell, {
    attributes: true,
    attributeFilter: ['data-bet-ui-variant', 'data-suki-orientation', 'data-suki-screen'],
  });

  refreshBackground(host, shell);

  return {
    destroy() {
      observer.disconnect();
      destroyBackgroundHost();
    },
    setBonusMode: setBackgroundBonusMode,
  };
}
