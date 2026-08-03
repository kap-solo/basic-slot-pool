/**
 * On-boarding Spine placeholder — fr1_anim skeleton on loop.
 */

import './bootstrap.js';
import { Application } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { loadSpineAsset } from './spineAssets.js';

export const ONBOARDING_SPINE_FR1 = {
  skeleton: 'assets/spine/fr1_anim.json',
  atlas: 'assets/spine/fr1_anim.atlas',
};

export const ONBOARDING_SPINE_FR3 = {
  skeleton: 'assets/spine/fr3_anim.json',
  atlas: 'assets/spine/fr3_anim.atlas',
};

/** @typedef {'fr1' | 'fr3'} OnboardingSpineId */

/** @type {Record<OnboardingSpineId, { skeleton: string, atlas: string }>} */
export const ONBOARDING_SPINE_BY_ID = {
  fr1: ONBOARDING_SPINE_FR1,
  fr3: ONBOARDING_SPINE_FR3,
};

/** @deprecated Use ONBOARDING_SPINE_FR1 */
export const ONBOARDING_SPINE = ONBOARDING_SPINE_FR1;

const LOOP_ANIM = 'animation';
const SPINE_FIT = 0.88;
/**
 * fr1_anim is a one-shot feature reveal (~3.4s): looping the full clip flashes white,
 * and loop=true with animationStart/end freezes on the first frame in spine-pixi-v8.
 * Replay a stable mid segment (loop=false) and restart on complete instead.
 */
const FR1_LOOP_START_SEC = 0.35;
const FR1_LOOP_END_SEC = 1.85;

/**
 * @param {Spine} spine
 * @param {string} anim
 */
function playFr1StableLoop(spine, anim) {
  const restart = () => {
    const entry = spine.state.setAnimation(0, anim, false);
    entry.animationStart = FR1_LOOP_START_SEC;
    entry.animationEnd = FR1_LOOP_END_SEC;
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

/** Decode onboarding Spine assets during session preloader. */
export function warmOnboardingSpine() {
  return Promise.all(
    Object.values(ONBOARDING_SPINE_BY_ID).map((paths) => loadSpineAsset(paths)),
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
 */
function layoutSpineInHost(spine, app, hostEl) {
  const rect = hostEl.getBoundingClientRect();
  const width = Math.max(48, Math.round(rect.width) || 48);
  const height = Math.max(48, Math.round(rect.height) || 48);
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
 * @param {{ spine?: OnboardingSpineId }} [opts]
 */
export async function mountOnboardingSpine(hostEl, { spine: spineId = 'fr1' } = {}) {
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

  const anim = hasAnim(data, LOOP_ANIM)
    ? LOOP_ANIM
    : data.animations[0]?.name;
  /** @type {import('@esotericsoftware/spine-core').AnimationStateListener | null} */
  let fr1LoopListener = null;
  if (anim) {
    if (spineId === 'fr1') {
      fr1LoopListener = playFr1StableLoop(spine, anim);
    } else {
      const entry = spine.state.setAnimation(0, anim, true);
      entry.timeScale = 1;
    }
  }

  layoutSpineInHost(spine, app, hostEl);
  app.stage.addChild(spine);
  hostEl.replaceChildren(app.canvas);

  spine.ticker = app.ticker;
  spine.autoUpdate = true;
  app.ticker.start();
  spine.update(0);

  return {
    host: hostEl,
    relayout: () => layoutSpineInHost(spine, app, hostEl),
    settleLayout: async () => {
      await measureHost(hostEl, 4);
      layoutSpineInHost(spine, app, hostEl);
    },
    destroy() {
      if (fr1LoopListener) {
        spine.state.removeListener(fr1LoopListener);
      }
      spine.autoUpdate = false;
      app.ticker.stop();
      app.destroy(true, { children: true });
      hostEl.replaceChildren();
    },
  };
}
