/**
 * Session preload — static assets + Pixi/Spine runtime warm-up before first spin.
 */

import { preloadAssets } from '@kap-solo/suki-engine/client/suki/assetLoader.js';
import { buildPreloadAssets } from './audio.js';
import { primeAutoButtonGraphic } from './autoButtonGraphic.js';
import { primeBuyButtonGraphics } from './buyButtonGraphic.js';
import { ensureCharacterSpineReady } from './character.js';
import { warmFeatureIntroSpine } from './pixi/featureIntroSpine.js';
import { warmOnboardingSpine } from './pixi/onboardingSpine.js';
import { ensureBlobPopSpriteFrames } from './pixi/blobSpriteOverlay.js';
import { primeSpinButtonGraphic } from './spinButtonGraphic.js';

/** Raster/SVG paths warmed via Image preload (Spine atlas pages + UI + backgrounds). */
export const PRELOAD_IMAGE_ASSETS = [
  'assets/ui/cabinet-bg.webp',
  'assets/ui/spin_button.svg',
  'assets/ui/auto_button.svg',
  'assets/ui/bonus.svg',
  'assets/ui/bonus_social.svg',
  'assets/ui/warning-tape.png',
  'assets/ui/b_bonus_badge.png',
  'assets/ui/g_bonus_badge.png',
  'assets/desktop_bg.jpg',
  'assets/desktop_bg_bonus.jpg',
  'assets/mobile_bg_LRG.jpg',
  'assets/mobile_bg_LRG_bonus.jpg',
  'assets/mobile_bg_REG.jpg',
  'assets/mobile_bg_REG_bonus.jpg',
  'assets/character.png',
  'assets/blobsprite.png',
  'assets/spine/symbols_spinr-flat.webp',
  'assets/spine/stone-spine.png',
  'assets/spine/blob/blob.png',
  'assets/spine/character/character.webp',
  'assets/spine/free_spins.webp',
  'assets/spine/fr1_anim.webp',
  'assets/spine/fr3_anim.webp',
];

/** @returns {import('@kap-solo/suki-engine/client/suki/assetLoader.js').PreloadAsset[]} */
export function buildStaticPreloadAssets() {
  const images = PRELOAD_IMAGE_ASSETS.map((src) => ({ src, type: 'image' }));
  return [...buildPreloadAssets(), ...images];
}

function primeBetChromeGraphics() {
  return Promise.all([
    primeSpinButtonGraphic(),
    primeAutoButtonGraphic(),
    primeBuyButtonGraphics(),
  ]);
}

/**
 * @param {object} options
 * @param {(percent: number) => void} [options.onProgress]
 * @param {() => void | Promise<void>} options.warmRuntime — Pixi board, Spine registry, blob sheet
 * @param {() => void | Promise<void>} options.connect — RGS auth / session resume
 */
export async function runSessionPreload({ onProgress, warmRuntime, connect }) {
  let staticProgress = 0;
  let runtimeProgress = 0;

  const report = () => {
    onProgress?.(Math.round(staticProgress * 0.35 + runtimeProgress * 0.65));
  };

  onProgress?.(0);

  await Promise.all([
    preloadAssets(buildStaticPreloadAssets(), (percent) => {
      staticProgress = percent / 100;
      report();
    }),
    (async () => {
      await warmRuntime();
      runtimeProgress = 0.82;
      report();
      await connect();
      runtimeProgress = 1;
      report();
    })(),
  ]);

  onProgress?.(100);
}

/** Pixi board + bet chrome + feature/character warm-up after static assets begin loading. */
export async function warmGameRuntime(initSlotStage) {
  await initSlotStage();
  await Promise.all([
    ensureBlobPopSpriteFrames().catch((err) => {
      console.warn('[Basic Slot] Blob pop sprite preload failed.', err);
    }),
    warmFeatureIntroSpine().catch((err) => {
      console.warn('[Basic Slot] Feature Spine preload failed.', err);
    }),
    warmOnboardingSpine().catch((err) => {
      console.warn('[Basic Slot] Onboarding Spine preload failed.', err);
    }),
    ensureCharacterSpineReady().catch((err) => {
      console.warn('[Basic Slot] Character Spine preload failed.', err);
    }),
    primeBetChromeGraphics(),
  ]);
}
