/**
 * On-boarding Spine — fr1/fr2_anim (intro → loop), fr3_anim (stable segment loop).
 */

import './bootstrap.js';
import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { loadSpineAsset } from './spineAssets.js';

export const ONBOARDING_SPINE_FR1 = {
  skeleton: 'assets/spine/fr1_anim.json',
  atlas: 'assets/spine/fr1_anim.atlas',
};

export const ONBOARDING_SPINE_FR2 = {
  skeleton: 'assets/spine/fr2_anim.json',
  atlas: 'assets/spine/fr2_anim.atlas',
};

export const ONBOARDING_SPINE_FR3 = {
  skeleton: 'assets/spine/fr3_anim.json',
  atlas: 'assets/spine/fr3_anim.atlas',
};

/** @typedef {'fr1' | 'fr2' | 'fr3'} OnboardingSpineId */

/** @type {Record<OnboardingSpineId, { skeleton: string, atlas: string }>} */
export const ONBOARDING_SPINE_BY_ID = {
  fr1: ONBOARDING_SPINE_FR1,
  fr2: ONBOARDING_SPINE_FR2,
  fr3: ONBOARDING_SPINE_FR3,
};

/** Atlas page paths — Image preload during session preloader (before Spine decode). */
export const ONBOARDING_SPINE_TEXTURE_ASSETS = Object.keys(ONBOARDING_SPINE_BY_ID).map(
  (id) => `assets/spine/${id}_anim.webp`,
);

/** @deprecated Use ONBOARDING_SPINE_FR1 */
export const ONBOARDING_SPINE = ONBOARDING_SPINE_FR1;

const INTRO_ANIM = 'intro';
const LOOP_ANIM = 'loop';
const LEGACY_LOOP_ANIM = 'animation';
const SPINE_FIT = 0.88;
const MAX_SPINE_TICK_SEC = 1 / 30;
/** fr3_anim holds on the last frame until ~4.33s — trim the loop to the active motion. */
const FR3_LOOP_END_SEC = 3.7;

/** Shared onboarding art cell — fence attachment size in every onboarding Spine export. */
const ONBOARDING_FENCE_SIZE = { width: 1000, height: 1100 };
const ONBOARDING_FENCE_SLOT = 'fence';

/**
 * Per-spine visual tuning (1 = neutral). Fence size is shared; use this only for
 * minor art padding differences between assets.
 * @type {Partial<Record<OnboardingSpineId, number>>}
 */
const ONBOARDING_SPINE_VISUAL_FIT = {
  fr1: 1,
  fr2: 1,
  fr3: 1,
};

/**
 * Layout metrics from the shared fence cell — both fr1 and fr3 ship a 1000×1100 fence
 * attachment, so scale and center stay matched regardless of skeleton export bounds.
 *
 * @param {Spine} spine
 * @param {OnboardingSpineId} spineId
 */
function captureOnboardingFenceMetrics(spine, spineId) {
  const { width: fenceW, height: fenceH } = ONBOARDING_FENCE_SIZE;
  const slot = spine.skeleton.findSlot(ONBOARDING_FENCE_SLOT);
  let centerX = 0;
  let centerY = 0;

  if (slot?.bone) {
    const bone = slot.bone;
    const att = slot.attachment;
    const offsetX = att && typeof att.x === 'number' ? att.x : 0;
    const offsetY = att && typeof att.y === 'number' ? att.y : 0;
    centerX = bone.worldX + offsetX * bone.a + offsetY * bone.b;
    centerY = bone.worldY + offsetX * bone.c + offsetY * bone.d;
  }

  return {
    x: centerX - fenceW / 2,
    y: centerY - fenceH / 2,
    width: fenceW,
    height: fenceH,
    visualFit: ONBOARDING_SPINE_VISUAL_FIT[spineId] ?? 1,
  };
}

/**
 * @param {Spine} spine
 * @param {import('@esotericsoftware/spine-pixi-v8').SkeletonData} data
 */
function playIntroThenLoop(spine, data) {
  if (!hasAnim(data, INTRO_ANIM) || !hasAnim(data, LOOP_ANIM)) return false;
  const intro = spine.state.setAnimation(0, INTRO_ANIM, false);
  intro.mixDuration = 0;
  const loop = spine.state.addAnimation(0, LOOP_ANIM, true, 0);
  loop.mixDuration = 0;
  return true;
}

/**
 * @param {Spine} spine
 * @param {string} anim
 * @param {number} startSec
 * @param {number} endSec
 */
function playStableSegmentLoop(spine, anim, startSec, endSec) {
  const restart = () => {
    const entry = spine.state.setAnimation(0, anim, false);
    entry.animationStart = startSec;
    entry.animationEnd = endSec;
    entry.mixDuration = 0;
    entry.trackTime = 0;
  };

  restart();

  const listener = {
    complete(entry) {
      if (entry.trackIndex !== 0) return;
      restart();
    },
  };
  spine.state.addListener(listener);
  return listener;
}

/**
 * @param {Spine} spine
 * @param {string} anim
 */
function playFr3StableLoop(spine, anim) {
  return playStableSegmentLoop(spine, anim, 0, FR3_LOOP_END_SEC);
}

/**
 * @param {Spine} spine
 * @param {import('@esotericsoftware/spine-pixi-v8').SkeletonData} data
 * @param {OnboardingSpineId} spineId
 * @returns {import('@esotericsoftware/spine-core').AnimationStateListener | null}
 */
function startOnboardingSpineMotion(spine, data, spineId) {
  if (spineId === 'fr1' || spineId === 'fr2') {
    if (playIntroThenLoop(spine, data)) return null;
    const fallback = hasAnim(data, LEGACY_LOOP_ANIM)
      ? LEGACY_LOOP_ANIM
      : data.animations[0]?.name;
    if (!fallback) return null;
    const entry = spine.state.setAnimation(0, fallback, true);
    entry.mixDuration = 0;
    return null;
  }

  if (spineId === 'fr3') {
    const anim = hasAnim(data, LEGACY_LOOP_ANIM)
      ? LEGACY_LOOP_ANIM
      : data.animations[0]?.name;
    if (!anim) return null;
    return playFr3StableLoop(spine, anim);
  }

  const anim = hasAnim(data, LOOP_ANIM)
    ? LOOP_ANIM
    : data.animations[0]?.name;
  if (!anim) return null;
  const entry = spine.state.setAnimation(0, anim, true);
  entry.mixDuration = 0;
  return null;
}

/** Decode onboarding Spine assets during session preloader. */
export function warmOnboardingSpine() {
  return Promise.all(
    Object.entries(ONBOARDING_SPINE_BY_ID).map(async ([spineId, paths]) => {
      await loadSpineAsset(paths);
      console.info(`[Basic Slot] Onboarding Spine "${spineId}" warmed.`);
    }),
  );
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
 * @param {number} [attempts]
 */
async function measureHost(hostEl, attempts = 6) {
  let width = 0;
  let height = 0;
  for (let i = 0; i < attempts; i += 1) {
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
    const rect = hostEl.getBoundingClientRect();
    width = Math.round(rect.width);
    height = Math.round(rect.height);
    if (width >= 48 && height >= 48) break;
  }
  return {
    width: Math.max(48, width || 48),
    height: Math.max(48, height || 48),
  };
}

/**
 * @param {Spine} spine
 * @param {Application} app
 * @param {HTMLElement} hostEl
 * @param {ReturnType<typeof captureOnboardingFenceMetrics>} metrics
 */
function layoutSpineInHost(spine, app, hostEl, metrics) {
  const rect = hostEl.getBoundingClientRect();
  const width = Math.max(48, Math.round(rect.width) || 48);
  const height = Math.max(48, Math.round(rect.height) || 48);
  if (width !== app.screen.width || height !== app.screen.height) {
    app.renderer.resize(width, height);
  }

  const scale =
    Math.min(width / metrics.width, height / metrics.height)
    * SPINE_FIT
    * metrics.visualFit;
  spine.scale.set(scale);
  spine.x = width / 2 - (metrics.x + metrics.width / 2) * scale;
  spine.y = height / 2 - (metrics.y + metrics.height / 2) * scale;
}

/**
 * @param {HTMLElement} hostEl
 * @param {{ spine?: OnboardingSpineId, autoplay?: boolean }} [opts]
 */
export async function mountOnboardingSpine(hostEl, { spine: spineId = 'fr1', autoplay = true } = {}) {
  const paths = ONBOARDING_SPINE_BY_ID[spineId] ?? ONBOARDING_SPINE_FR1;
  const data = await loadSpineAsset(paths);
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
  spine.autoUpdate = false;
  spine.eventMode = 'none';
  spine.skeleton.setToSetupPose();
  spine.update(0);

  const layoutMetrics = captureOnboardingFenceMetrics(spine, spineId);
  /** @type {import('@esotericsoftware/spine-core').AnimationStateListener | null} */
  let loopListener = null;
  let motionStarted = false;
  let ticking = false;

  function startMotion() {
    if (motionStarted) return;
    motionStarted = true;
    spine.skeleton.setToSetupPose();
    spine.update(0);
    loopListener = startOnboardingSpineMotion(spine, data, spineId);
  }

  if (autoplay) {
    startMotion();
    ticking = true;
  }

  layoutSpineInHost(spine, app, hostEl, layoutMetrics);
  app.stage.addChild(spine);
  hostEl.replaceChildren(app.canvas);

  /** @param {import('pixi.js').Ticker} ticker */
  const onTick = (ticker) => {
    if (!ticking) return;
    const delta = Math.min(ticker.deltaMS / 1000, MAX_SPINE_TICK_SEC);
    spine.update(delta);
  };
  app.ticker.add(onTick);

  return {
    host: hostEl,
    relayout: () => layoutSpineInHost(spine, app, hostEl, layoutMetrics),
    settleLayout: async () => {
      await measureHost(hostEl, 4);
      layoutSpineInHost(spine, app, hostEl, layoutMetrics);
    },
    play() {
      if (!motionStarted) startMotion();
      ticking = true;
    },
    destroy() {
      if (loopListener) {
        spine.state.removeListener(loopListener);
      }
      app.ticker.remove(onTick);
      app.destroy(true, { children: true });
      hostEl.replaceChildren();
    },
  };
}
