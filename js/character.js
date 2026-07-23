/**
 * Flank character — Spine on desktop breakpoints, hidden on mobile.
 * During free spins, crossfades to a static PNG from the first spin onward.
 */

import './pixi/bootstrap.js';
import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BET_UI_VARIANT, resolveBetUiVariant } from './betUiVariant.js';
import { loadSpineAsset } from './pixi/spineAssets.js';

const CHARACTER_SPINE = {
  skeleton: 'assets/spine/character/character.json',
  atlas: 'assets/spine/character/character.atlas',
};

const CHARACTER_PNG_SRC = 'assets/character.png';

const CHARACTER_ANIMATIONS = {
  idle: 'idle',
  win: 'win',
};

/** Display scale relative to height-fit baseline (1 = previous default). */
const CHARACTER_DISPLAY_SCALE = 0.86;

/** Horizontal offset from the left flank anchor (px). */
const CHARACTER_OFFSET_X = 25;

/** Spine playback as a fraction of authored speed (1 = default, 0.2 = 20% of default). */
const CHARACTER_ANIMATION_SPEED = 0.2;

/** Bonus/base crossfade duration (ms). */
const CHARACTER_CROSSFADE_MS = 900;

/** @type {import('@esotericsoftware/spine-core').SkeletonData | null} */
let skeletonData = null;

/** @type {Promise<import('@esotericsoftware/spine-core').SkeletonData | null> | null} */
let skeletonLoad = null;

/** @type {Promise<void>} */
let modeTransition = Promise.resolve();

/** @type {{
 *   host: HTMLElement,
 *   shell: HTMLElement,
 *   stack: HTMLElement,
 *   spineLayer: HTMLElement,
 *   pngLayer: HTMLElement,
 *   pngImg: HTMLImageElement,
 *   inBonusMode: boolean,
 * } | null} */
let hostContext = null;

/** @type {{
 *   app: Application,
 *   spine: Spine,
 *   onTick: (ticker: import('pixi.js').Ticker) => void,
 *   host: HTMLElement,
 *   shell: HTMLElement,
 *   canvasHeight: number,
 * } | null} */
let activeMount = null;

/**
 * @param {import('@esotericsoftware/spine-core').SkeletonData} data
 * @param {string} name
 */
function spineAnimHasKeyframes(data, name) {
  return Boolean(data.findAnimation?.(name));
}

/**
 * @param {Spine} spine
 * @param {number} canvasHeight
 * @returns {number}
 */
function layoutCharacterSpine(spine, canvasHeight) {
  spine.skeleton.setToSetupPose();
  spine.update(0);

  const bounds = spine.getLocalBounds();
  const scale = (canvasHeight * 0.98 * CHARACTER_DISPLAY_SCALE) / Math.max(bounds.height, 1);
  spine.scale.set(scale);
  spine.x = -bounds.x * scale;
  spine.y = canvasHeight - (bounds.y + bounds.height) * scale;
  return bounds.width * scale;
}

/** @param {HTMLElement} stack */
function applyCharacterOffset(stack) {
  stack.style.marginLeft = `${CHARACTER_OFFSET_X}px`;
}

/**
 * @param {HTMLElement} host
 */
function ensureHostStack(host) {
  if (hostContext?.host === host) return hostContext;

  const stack = document.createElement('div');
  stack.className = 'character-host__stack';

  const spineLayer = document.createElement('div');
  spineLayer.className = 'character-host__layer character-host__layer--spine is-visible';

  const pngLayer = document.createElement('div');
  pngLayer.className = 'character-host__layer character-host__layer--png is-hidden';

  const pngImg = document.createElement('img');
  pngImg.className = 'character-host__img';
  pngImg.src = CHARACTER_PNG_SRC;
  pngImg.alt = '';
  pngImg.decoding = 'async';

  pngLayer.appendChild(pngImg);
  stack.append(spineLayer, pngLayer);
  applyCharacterOffset(stack);
  stack.style.setProperty('--character-crossfade-ms', `${CHARACTER_CROSSFADE_MS}ms`);
  host.replaceChildren(stack);
  host.dataset.characterMount = 'stack';

  hostContext = {
    host,
    shell: hostContext?.shell ?? host,
    stack,
    spineLayer,
    pngLayer,
    pngImg,
    inBonusMode: false,
  };
  return hostContext;
}

async function ensureSkeletonData() {
  if (skeletonData) return skeletonData;
  if (!skeletonLoad) {
    skeletonLoad = loadSpineAsset(CHARACTER_SPINE)
      .then((data) => {
        skeletonData = data;
        console.info('[Basic Slot] Spine character loaded.');
        return data;
      })
      .catch((err) => {
        console.warn('[Basic Slot] Spine character unavailable.', err);
        skeletonLoad = null;
        return null;
      });
  }
  return skeletonLoad;
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} shell
 */
async function readCanvasHeight(host, shell) {
  for (let frame = 0; frame < 30; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const hostHeight = host.clientHeight;
    if (hostHeight > 0) {
      return Math.max(320, Math.round(hostHeight));
    }
  }

  return Math.max(320, Math.round(host.clientHeight || shell.clientHeight || 0));
}

/** @param {Spine} spine */
function applyCharacterAnimationSpeed(spine) {
  spine.state.timeScale = CHARACTER_ANIMATION_SPEED;
}

/** @param {Spine} spine */
function playCharacterIdle(spine) {
  const idle = CHARACTER_ANIMATIONS.idle;
  if (spineAnimHasKeyframes(spine.skeleton.data, idle)) {
    spine.state.setAnimation(0, idle, true);
    applyCharacterAnimationSpeed(spine);
  }
}

function pauseSpineTicker() {
  if (!activeMount) return;
  activeMount.app.ticker.remove(activeMount.onTick);
}

function resumeSpineTicker() {
  if (!activeMount || hostContext?.inBonusMode) return;
  activeMount.app.ticker.add(activeMount.onTick);
}

function relayoutActiveMount() {
  if (!activeMount || !hostContext) return;
  const { app, spine, host } = activeMount;
  const hostHeight = host.clientHeight;
  if (hostHeight <= 0) return;

  const canvasHeight = Math.max(320, Math.round(hostHeight));
  const contentWidth = layoutCharacterSpine(spine, canvasHeight);
  app.renderer.resize(Math.ceil(contentWidth), canvasHeight);
  activeMount.canvasHeight = canvasHeight;
}

/** Re-measure the flank host and resize the active Spine mount. */
export function relayoutCharacter() {
  if (!hostContext) return;
  if (activeMount) {
    relayoutActiveMount();
    return;
  }
  refreshCharacter(hostContext.host, hostContext.shell);
}

function destroySpineMount() {
  if (!activeMount) return;
  const { app, onTick } = activeMount;
  app.ticker.remove(onTick);
  app.destroy(true, { children: true, texture: false, textureSource: false });
  hostContext?.spineLayer.replaceChildren();
  activeMount = null;
}

function destroyCharacterHost() {
  destroySpineMount();
  hostContext?.host.replaceChildren();
  if (hostContext?.host) {
    delete hostContext.host.dataset.characterMount;
  }
  hostContext = null;
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} shell
 */
async function mountCharacterSpine(host, shell) {
  if (hostContext) hostContext.shell = shell;
  const ctx = ensureHostStack(host);
  ctx.shell = shell;

  const data = await ensureSkeletonData();
  if (!data) return;

  const canvasHeight = await readCanvasHeight(host, shell);

  if (activeMount?.host === host) {
    relayoutActiveMount();
    syncCharacterLayers({ animate: false });
    return;
  }

  destroySpineMount();

  const app = new Application();
  await app.init({
    width: 320,
    height: canvasHeight,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  app.canvas.className = 'character-host__canvas';
  app.canvas.style.display = 'block';
  app.canvas.style.height = '100%';
  app.canvas.style.width = 'auto';

  const spine = new Spine(data);
  spine.eventMode = 'none';
  const contentWidth = layoutCharacterSpine(spine, canvasHeight);
  app.renderer.resize(Math.ceil(contentWidth), canvasHeight);
  app.stage.addChild(spine);
  playCharacterIdle(spine);

  /** @param {import('pixi.js').Ticker} ticker */
  const onTick = (ticker) => {
    spine.update(ticker.deltaMS / 1000);
  };

  ctx.spineLayer.replaceChildren(app.canvas);
  activeMount = { app, spine, onTick, host, shell, canvasHeight };

  if (ctx.inBonusMode) pauseSpineTicker();
  else app.ticker.add(onTick);

  syncCharacterLayers({ animate: false });
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
    const fallback = setTimeout(finish, CHARACTER_CROSSFADE_MS + 80);
  });
}

/**
 * @param {{ animate?: boolean }} [opts]
 */
function syncCharacterLayers({ animate = true } = {}) {
  if (!hostContext) return Promise.resolve();
  const { spineLayer, pngLayer, inBonusMode } = hostContext;
  const showPng = inBonusMode;

  if (showPng) pauseSpineTicker();
  else resumeSpineTicker();

  if (!animate) {
    spineLayer.classList.toggle('is-visible', !showPng);
    spineLayer.classList.toggle('is-hidden', showPng);
    pngLayer.classList.toggle('is-visible', showPng);
    pngLayer.classList.toggle('is-hidden', !showPng);
    return Promise.resolve();
  }

  return Promise.all([
    setLayerVisible(spineLayer, !showPng, { animate: true }),
    setLayerVisible(pngLayer, showPng, { animate: true }),
  ]).then(() => {});
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} shell
 */
function refreshCharacter(host, shell) {
  const isDesktop = resolveBetUiVariant(shell) === BET_UI_VARIANT.DESKTOP;
  if (!isDesktop) {
    destroyCharacterHost();
    return;
  }
  void mountCharacterSpine(host, shell);
}

/**
 * @param {boolean} active
 * @param {{ animate?: boolean }} [opts]
 */
async function applyBonusMode(active, { animate = true } = {}) {
  if (!hostContext) return;
  if (hostContext.inBonusMode === active) {
    syncCharacterLayers({ animate: false });
    return;
  }

  hostContext.inBonusMode = active;
  await syncCharacterLayers({ animate });
}

/**
 * @param {boolean} active
 * @param {{ animate?: boolean }} [opts]
 */
export function setCharacterBonusMode(active, { animate = true } = {}) {
  modeTransition = modeTransition
    .then(() => applyBonusMode(active, { animate }))
    .catch((err) => {
      console.warn('[Basic Slot] Character bonus mode transition failed.', err);
    });
  return modeTransition;
}

/**
 * One-shot win track when available, then return to idle.
 */
export function playCharacterWin() {
  if (hostContext?.inBonusMode) return;
  const spine = activeMount?.spine;
  if (!spine) return;

  const data = spine.skeleton.data;
  const win = CHARACTER_ANIMATIONS.win;
  const idle = CHARACTER_ANIMATIONS.idle;
  if (!spineAnimHasKeyframes(data, win)) return;

  const entry = spine.state.setAnimation(0, win, false);
  entry.timeScale = CHARACTER_ANIMATION_SPEED;
  if (spineAnimHasKeyframes(data, idle)) {
    entry.listener = {
      complete: () => {
        playCharacterIdle(spine);
      },
    };
  }
}

/**
 * Mount the flank character on desktop breakpoints only.
 *
 * @param {object} options
 * @param {HTMLElement | null | undefined} options.host
 * @param {HTMLElement | null | undefined} options.shell
 */
export function initCharacter({ host, shell }) {
  if (!host || !shell) {
    return {
      destroy() {},
      playWin: playCharacterWin,
      setBonusMode: setCharacterBonusMode,
      relayout: relayoutCharacter,
    };
  }

  if (hostContext) hostContext.shell = shell;

  const observer = new MutationObserver(() => refreshCharacter(host, shell));
  observer.observe(shell, {
    attributes: true,
    attributeFilter: ['data-bet-ui-variant', 'data-suki-orientation', 'data-suki-screen', 'data-suki-replay'],
  });

  const hostResizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => {
      if (activeMount && host.clientHeight > 0) {
        relayoutActiveMount();
        return;
      }
      if (resolveBetUiVariant(shell) === BET_UI_VARIANT.DESKTOP && host.clientHeight > 0) {
        refreshCharacter(host, shell);
      }
    })
    : null;
  hostResizeObserver?.observe(host);

  const onResize = () => {
    if (activeMount) relayoutActiveMount();
    else refreshCharacter(host, shell);
  };

  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', onResize);
  refreshCharacter(host, shell);

  return {
    destroy() {
      observer.disconnect();
      hostResizeObserver?.disconnect();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      destroyCharacterHost();
    },
    playWin: playCharacterWin,
    setBonusMode: setCharacterBonusMode,
    relayout: relayoutCharacter,
  };
}
