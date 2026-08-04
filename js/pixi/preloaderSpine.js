/**
 * Preloader Spine — bo_anim above the session load bar.
 */

import './bootstrap.js';
import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { loadSpineAsset } from './spineAssets.js';

export const PRELOADER_SPINE = {
  skeleton: 'assets/spine/bo_anim.json',
  atlas: 'assets/spine/bo_anim.atlas',
};

/** Atlas page — Image preload during session preloader (before Spine decode). */
export const PRELOADER_SPINE_TEXTURE_ASSETS = ['assets/spine/bo_anim.webp'];

const PRELOAD_ANIM = 'loader';
const MAX_SPINE_TICK_SEC = 1 / 30;
const SPINE_FIT = 0.92;

/** Decode preloader Spine during session preloader. */
export function warmPreloaderSpine() {
  return loadSpineAsset(PRELOADER_SPINE);
}

/**
 * @param {import('@esotericsoftware/spine-pixi-v8').SkeletonData} data
 * @param {string} name
 */
function hasAnim(data, name) {
  return data.animations.some((entry) => entry.name === name);
}

/**
 * @param {HTMLElement} hostEl
 */
async function measureHost(hostEl) {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  const rect = hostEl.getBoundingClientRect();
  return {
    width: Math.max(120, Math.round(rect.width || 280)),
    height: Math.max(48, Math.round(rect.height || 120)),
  };
}

/**
 * @param {Spine} spine
 * @param {Application} app
 * @param {HTMLElement} hostEl
 */
function layoutPreloaderSpineInHost(spine, app, hostEl) {
  const rect = hostEl.getBoundingClientRect();
  const width = Math.max(120, Math.round(rect.width || 280));
  const height = Math.max(48, Math.round(rect.height || 120));
  if (width !== app.screen.width || height !== app.screen.height) {
    app.renderer.resize(width, height);
  }

  const bounds = spine.getLocalBounds();
  const skeletonW = bounds.width || 1221;
  const skeletonH = bounds.height || 784;
  const scale = Math.min(width / skeletonW, height / skeletonH) * SPINE_FIT;
  spine.scale.set(scale);
  spine.x = width / 2 - (bounds.x + bounds.width / 2) * scale;
  spine.y = height / 2 - (bounds.y + bounds.height / 2) * scale;
}

/**
 * @param {HTMLElement} hostEl
 */
export async function mountPreloaderSpine(hostEl) {
  const data = await loadSpineAsset(PRELOADER_SPINE);
  const { width, height } = await measureHost(hostEl);

  const app = new Application();
  await app.init({
    width,
    height,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  app.canvas.style.display = 'block';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';

  const spine = new Spine(data);
  spine.eventMode = 'none';
  layoutPreloaderSpineInHost(spine, app, hostEl);

  const anim = hasAnim(data, PRELOAD_ANIM)
    ? PRELOAD_ANIM
    : data.animations[0]?.name;
  if (anim) {
    spine.state.setAnimation(0, anim, false);
  }

  app.stage.addChild(spine);
  hostEl.replaceChildren(app.canvas);

  /** @param {import('pixi.js').Ticker} ticker */
  const onTick = (ticker) => {
    const delta = Math.min(ticker.deltaMS / 1000, MAX_SPINE_TICK_SEC);
    spine.update(delta);
  };
  app.ticker.add(onTick);

  return {
    relayout: () => layoutPreloaderSpineInHost(spine, app, hostEl),
    destroy() {
      app.ticker.remove(onTick);
      app.destroy(true, { children: true });
      hostEl.replaceChildren();
    },
  };
}
