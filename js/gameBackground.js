/**
 * Breakpoint background art — crossfades to *_bonus art during free spins.
 * Transition timing matches character bonus mode (900ms ease).
 */

/** Bonus/base crossfade duration (ms) — keep in sync with character.js. */
const BG_CROSSFADE_MS = 900;

/** @type {Promise<void>} */
let modeTransition = Promise.resolve();

/** @type {HTMLElement | null} */
let shellEl = null;

/**
 * @typedef {{
 *   host: HTMLElement,
 *   stack: HTMLElement,
 *   baseLayer: HTMLElement,
 *   bonusLayer: HTMLElement,
 *   inBonusMode: boolean,
 * }} BackgroundHostContext
 */

/** @type {Map<HTMLElement, BackgroundHostContext>} */
const hostContexts = new Map();

/**
 * @param {HTMLElement} host
 */
function ensureHostStack(host) {
  const existing = hostContexts.get(host);
  if (existing) return existing;

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

  const ctx = {
    host,
    stack,
    baseLayer,
    bonusLayer,
    inBonusMode: false,
  };
  hostContexts.set(host, ctx);
  return ctx;
}

/** @param {HTMLElement} host */
function destroyBackgroundHost(host) {
  host.replaceChildren();
  delete host.dataset.bgMount;
  hostContexts.delete(host);
}

function destroyAllBackgroundHosts() {
  for (const host of [...hostContexts.keys()]) {
    destroyBackgroundHost(host);
  }
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
 * @param {BackgroundHostContext} ctx
 * @param {{ animate?: boolean }} [opts]
 */
function syncBackgroundLayers(ctx, { animate = true } = {}) {
  const { baseLayer, bonusLayer, inBonusMode } = ctx;
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

/** @param {{ animate?: boolean }} [opts] */
function syncAllBackgroundLayers({ animate = true } = {}) {
  const contexts = [...hostContexts.values()];
  if (!contexts.length) return Promise.resolve();
  return Promise.all(contexts.map((ctx) => syncBackgroundLayers(ctx, { animate }))).then(() => {});
}

/**
 * @param {HTMLElement[]} hosts
 */
function refreshBackground(hosts) {
  for (const host of hosts) {
    if (host) ensureHostStack(host);
  }
  syncAllBackgroundLayers({ animate: false });
}

/**
 * @param {boolean} active
 * @param {{ animate?: boolean }} [opts]
 */
async function applyBonusMode(active, { animate = true } = {}) {
  if (!hostContexts.size) return;

  let changed = false;
  for (const ctx of hostContexts.values()) {
    if (ctx.inBonusMode !== active) {
      ctx.inBonusMode = active;
      changed = true;
    }
  }

  if (!changed) {
    syncAllBackgroundLayers({ animate: false });
    return;
  }

  await syncAllBackgroundLayers({ animate });
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
 * @param {HTMLElement | null | undefined} [options.host] Legacy desktop host.
 * @param {HTMLElement | null | undefined} [options.shell]
 */
export function initGameBackground({ host, shell } = {}) {
  shellEl = shell ?? null;

  const hosts = [
    host ?? document.querySelector('.suki-bg-landscape'),
    document.querySelector('.suki-bg-mobile-l'),
    document.querySelector('.suki-bg-mobile-ms'),
  ].filter((el) => el instanceof HTMLElement);

  if (!hosts.length || !shellEl) {
    return {
      destroy() {},
      setBonusMode: setBackgroundBonusMode,
    };
  }

  refreshBackground(hosts);

  const observer = new MutationObserver(() => refreshBackground(hosts));
  observer.observe(shellEl, {
    attributes: true,
    attributeFilter: ['data-bet-ui-variant', 'data-suki-orientation', 'data-suki-screen'],
  });

  return {
    destroy() {
      observer.disconnect();
      destroyAllBackgroundHosts();
      shellEl = null;
    },
    setBonusMode: setBackgroundBonusMode,
  };
}
