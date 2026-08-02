/**
 * Free-spin feature Spine — free_spins skeleton (intro / loop / end).
 */

import './bootstrap.js';
import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { loadSpineAsset } from './spineAssets.js';

export const FEATURE_INTRO_SPINE = {
  skeleton: 'assets/spine/free_spins.json',
  atlas: 'assets/spine/free_spins.atlas',
};

const INTRO_ANIM = 'intro';
const LOOP_ANIM = 'loop';
const END_ANIM = 'end';
const TEXT_BONE = 'text';
const END_TEXT_Y_OFFSET_PX = 12;
/** Max pre-scale width for label + amount vs spine host. */
const END_TEXT_MAX_WIDTH_RATIO = 0.72;
const END_AMOUNT_MIN_FONT_RATIO = 0.55;
const END_LABEL_MIN_FONT_RATIO = 0.72;
const MAX_SPINE_TICK_SEC = 1 / 30;
const SPINE_FIT = 0.88;

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
    width: Math.max(160, Math.round(rect.width || 280)),
    height: Math.max(160, Math.round(rect.height || 280)),
  };
}

/**
 * @param {HTMLElement} hostEl
 */
async function createFeatureSpineMount(hostEl) {
  const data = await loadSpineAsset(FEATURE_INTRO_SPINE);
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
  layoutFeatureSpineInHost(spine, app, hostEl);

  app.stage.addChild(spine);

  const preserved = hostEl.querySelector('.feature-chrome__end-text');
  hostEl.replaceChildren(app.canvas);
  if (preserved) hostEl.appendChild(preserved);

  return {
    app,
    spine,
    data,
    destroy() {
      app.destroy(true, { children: true });
      const preserved = hostEl.querySelector('.feature-chrome__end-text');
      hostEl.replaceChildren();
      if (preserved) hostEl.appendChild(preserved);
    },
  };
}

/**
 * @param {Spine} spine
 * @param {import('@esotericsoftware/spine-pixi-v8').SkeletonData} data
 */
function playIntroThenLoop(spine, data) {
  if (hasAnim(data, INTRO_ANIM) && hasAnim(data, LOOP_ANIM)) {
    spine.state.setAnimation(0, INTRO_ANIM, false);
    spine.state.addAnimation(0, LOOP_ANIM, true, 0);
    return;
  }

  const fallback = hasAnim(data, INTRO_ANIM)
    ? INTRO_ANIM
    : hasAnim(data, LOOP_ANIM)
      ? LOOP_ANIM
      : data.animations[0]?.name;
  if (!fallback) return;
  spine.state.setAnimation(0, fallback, fallback === LOOP_ANIM);
}

/**
 * @param {Spine} spine
 * @param {Application} app
 * @param {HTMLElement} hostEl
 */
export function layoutFeatureSpineInHost(spine, app, hostEl) {
  const rect = hostEl.getBoundingClientRect();
  const width = Math.max(160, Math.round(rect.width || 280));
  const height = Math.max(160, Math.round(rect.height || 280));
  if (width !== app.screen.width || height !== app.screen.height) {
    app.renderer.resize(width, height);
  }

  const bounds = spine.getLocalBounds();
  const skeletonW = bounds.width || 1000;
  const skeletonH = bounds.height || 1100;
  const scale = Math.min(width / skeletonW, height / skeletonH) * SPINE_FIT;
  spine.scale.set(scale);
  spine.x = width / 2 - (bounds.x + bounds.width / 2) * scale;
  spine.y = height / 2 - (bounds.y + bounds.height / 2) * scale;
}

/**
 * @param {HTMLElement} hostEl
 * @param {HTMLElement} textEl
 * @param {number} worldScale
 */
function fitEndFeatureText(hostEl, textEl, worldScale) {
  const amountEl = textEl.querySelector('.feature-chrome__end-amount');
  const labelEl = textEl.querySelector('.feature-chrome__end-label');
  if (!amountEl) return;

  const scale = Math.max(worldScale, 0.08);
  const maxWidth = Math.max(56, Math.round((hostEl.clientWidth * END_TEXT_MAX_WIDTH_RATIO) / scale));
  textEl.style.maxWidth = `${maxWidth}px`;

  for (const el of [labelEl, amountEl]) {
    if (!el) continue;
    el.style.fontSize = '';
  }

  const fitLine = (el, minRatio) => {
    if (!el) return;
    const computed = getComputedStyle(el);
    let fontSize = parseFloat(computed.fontSize);
    if (!Number.isFinite(fontSize) || fontSize <= 0) return;
    const minFontSize = fontSize * minRatio;
    el.style.fontSize = `${fontSize}px`;
    while (el.scrollWidth > maxWidth && fontSize > minFontSize) {
      fontSize -= 0.5;
      el.style.fontSize = `${fontSize}px`;
    }
  };

  fitLine(labelEl, END_LABEL_MIN_FONT_RATIO);
  fitLine(amountEl, END_AMOUNT_MIN_FONT_RATIO);
}

/**
 * @param {Spine} spine
 * @param {Application} app
 * @param {HTMLElement} hostEl
 * @param {HTMLElement} textEl
 */
function syncEndTextToBone(spine, app, hostEl, textEl) {
  const bone = spine.skeleton.findBone(TEXT_BONE);
  if (!bone) return;

  layoutFeatureSpineInHost(spine, app, hostEl);

  const canvas = app.canvas;
  if (!canvas) return;

  const global = spine.toGlobal({ x: bone.worldX, y: bone.worldY });
  const canvasRect = canvas.getBoundingClientRect();
  const hostRect = hostEl.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0 || app.screen.width <= 0) return;

  const displayX =
    (global.x / app.screen.width) * canvasRect.width + (canvasRect.left - hostRect.left);
  const displayY =
    (global.y / app.screen.height) * canvasRect.height
    + (canvasRect.top - hostRect.top)
    + END_TEXT_Y_OFFSET_PX;

  const worldScale = Math.max(
    Math.hypot(bone.a ?? 1, bone.c ?? 0),
    Math.hypot(bone.b ?? 0, bone.d ?? 1),
  );

  textEl.style.left = `${displayX}px`;
  textEl.style.top = `${displayY}px`;
  textEl.style.transform = `translate(-50%, -50%) scale(${worldScale})`;
  textEl.style.opacity = worldScale < 0.08 ? '0' : '1';
  fitEndFeatureText(hostEl, textEl, worldScale);
}

/**
 * @param {HTMLElement} hostEl
 * @param {{ onAnimationStart?: () => void }} [opts]
 */
export async function mountFeatureIntroSpine(hostEl, { onAnimationStart } = {}) {
  const mount = await createFeatureSpineMount(hostEl);
  const { app, spine, data, destroy: destroyCanvas } = mount;

  playIntroThenLoop(spine, data);
  onAnimationStart?.();

  /** @param {import('pixi.js').Ticker} ticker */
  const onTick = (ticker) => {
    const delta = Math.min(ticker.deltaMS / 1000, MAX_SPINE_TICK_SEC);
    spine.update(delta);
  };
  app.ticker.add(onTick);

  return {
    relayout: () => layoutFeatureSpineInHost(spine, app, hostEl),
    destroy() {
      app.ticker.remove(onTick);
      destroyCanvas();
    },
  };
}

/**
 * @param {HTMLElement} hostEl
 * @param {HTMLElement} textEl
 * @param {{ label?: string, amount?: string }} [opts]
 */
export async function mountFeatureEndSpine(hostEl, textEl, { label = '', amount = '' } = {}) {
  const labelEl = textEl.querySelector('.feature-chrome__end-label');
  const amountEl = textEl.querySelector('.feature-chrome__end-amount');
  if (labelEl) labelEl.textContent = label;
  if (amountEl) amountEl.textContent = amount;

  const mount = await createFeatureSpineMount(hostEl);
  const { app, spine, data, destroy: destroyCanvas } = mount;

  if (hasAnim(data, END_ANIM)) {
    spine.state.setAnimation(0, END_ANIM, false);
  } else if (hasAnim(data, LOOP_ANIM)) {
    spine.state.setAnimation(0, LOOP_ANIM, true);
  }

  const syncText = () => syncEndTextToBone(spine, app, hostEl, textEl);

  /** @param {import('pixi.js').Ticker} ticker */
  const onEndTick = (ticker) => {
    const delta = Math.min(ticker.deltaMS / 1000, MAX_SPINE_TICK_SEC);
    spine.update(delta);
    syncText();
  };
  app.ticker.add(onEndTick);
  syncText();

  return {
    syncText,
    relayout: () => layoutFeatureSpineInHost(spine, app, hostEl),
    destroy() {
      app.ticker.remove(onEndTick);
      destroyCanvas();
    },
  };
}
