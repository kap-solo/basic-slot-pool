/**
 * Flank character — Spine on desktop breakpoints, hidden on mobile.
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

const CHARACTER_ANIMATIONS = {
  idle: 'idle',
  win: 'win',
};

/** Display scale relative to height-fit baseline (1 = previous default). */
const CHARACTER_DISPLAY_SCALE = 0.86;

/** Horizontal offset from the left flank anchor (px). */
const CHARACTER_OFFSET_X = 25;

/** Spine playback rate (1 = authored speed). */
const CHARACTER_ANIMATION_SPEED = 0.6;

/** @type {import('@esotericsoftware/spine-core').SkeletonData | null} */
let skeletonData = null;

/** @type {Promise<import('@esotericsoftware/spine-core').SkeletonData | null> | null} */
let skeletonLoad = null;

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

/** @param {HTMLCanvasElement} canvas */
function applyCharacterOffset(canvas) {
  canvas.style.marginLeft = `${CHARACTER_OFFSET_X}px`;
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
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  return Math.max(320, Math.round(host.clientHeight || shell.clientHeight || 0));
}

/** @type {{
 *   app: Application,
 *   spine: Spine,
 *   onTick: (ticker: import('pixi.js').Ticker) => void,
 *   host: HTMLElement,
 *   shell: HTMLElement,
 *   canvasHeight: number,
 * } | null} */
let activeMount = null;

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

function relayoutActiveMount() {
  if (!activeMount) return;
  const { app, spine, host, shell } = activeMount;
  const canvasHeight = Math.max(320, Math.round(host.clientHeight || shell.clientHeight || 0));
  const contentWidth = layoutCharacterSpine(spine, canvasHeight);
  app.renderer.resize(Math.ceil(contentWidth), canvasHeight);
  applyCharacterOffset(app.canvas);
  activeMount.canvasHeight = canvasHeight;
}

function destroyCharacter() {
  if (!activeMount) return;
  const { app, onTick, host } = activeMount;
  app.ticker.remove(onTick);
  app.destroy(true, { children: true, texture: false, textureSource: false });
  host.replaceChildren();
  delete host.dataset.characterMount;
  activeMount = null;
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} shell
 */
async function mountCharacterSpine(host, shell) {
  const data = await ensureSkeletonData();
  if (!data) return;

  const canvasHeight = await readCanvasHeight(host, shell);

  if (activeMount?.host === host) {
    relayoutActiveMount();
    return;
  }

  destroyCharacter();

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
  applyCharacterOffset(app.canvas);
  app.stage.addChild(spine);
  playCharacterIdle(spine);

  /** @param {import('pixi.js').Ticker} ticker */
  const onTick = (ticker) => {
    spine.update(ticker.deltaMS / 1000);
  };
  app.ticker.add(onTick);

  host.replaceChildren(app.canvas);
  host.dataset.characterMount = 'spine';
  activeMount = { app, spine, onTick, host, shell, canvasHeight };
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} shell
 */
function refreshCharacter(host, shell) {
  const isDesktop = resolveBetUiVariant(shell) === BET_UI_VARIANT.DESKTOP;
  if (!isDesktop) {
    destroyCharacter();
    return;
  }
  void mountCharacterSpine(host, shell);
}

/**
 * One-shot win track when available, then return to idle.
 */
export function playCharacterWin() {
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
    return { destroy() {}, playWin: playCharacterWin };
  }

  const observer = new MutationObserver(() => refreshCharacter(host, shell));
  observer.observe(shell, {
    attributes: true,
    attributeFilter: ['data-bet-ui-variant', 'data-suki-orientation', 'data-suki-screen'],
  });

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
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      destroyCharacter();
    },
    playWin: playCharacterWin,
  };
}
