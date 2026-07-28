/**
 * Cluster pop — 11-frame blob spritesheet overlay on dissolving symbols.
 * Sheet: assets/blobsprite.png — 4×3 grid of 256×256 frames (1024×768).
 */

import { Assets, Rectangle, Sprite, Texture } from 'pixi.js';
import { TIMING } from './timing.js';

const BLOB_SPRITE_SRC = 'assets/blobsprite.png';
const FRAME_SIZE = 256;
const FRAME_COUNT = 11;
const FRAMES_PER_ROW = 4;

/** @type {Texture[] | null} */
let frames = null;

/** @param {number} speed */
export function clusterBlobPopDurationMs(speed = 1) {
  const total =
    TIMING.blobPopSpritePlayMs + TIMING.blobPopSpriteHoldMs + TIMING.blobPopSpriteExitMs;
  return Math.max(120, Math.round(total / speed));
}

/** @param {number} index */
function blobFrameRect(index) {
  const col = index % FRAMES_PER_ROW;
  const row = Math.floor(index / FRAMES_PER_ROW);
  return new Rectangle(col * FRAME_SIZE, row * FRAME_SIZE, FRAME_SIZE, FRAME_SIZE);
}

/** @returns {Promise<Texture[]>} */
export async function ensureBlobPopSpriteFrames() {
  if (frames) return frames;

  const sheet = await Assets.load(BLOB_SPRITE_SRC);
  frames = Array.from(
    { length: FRAME_COUNT },
    (_, index) =>
      new Texture({
        source: sheet.source,
        frame: blobFrameRect(index),
      }),
  );
  return frames;
}

/**
 * @param {Sprite} overlay
 * @param {Texture[]} sheetFrames
 * @param {number} durationMs
 * @param {{ atMs?: number, onAt?: () => void }} [hooks]
 */
function animateBlobFrames(overlay, sheetFrames, durationMs, { atMs, onAt } = {}) {
  const frameMs = durationMs / FRAME_COUNT;

  return new Promise((resolve) => {
    let frame = 0;
    let atFired = false;
    const start = performance.now();
    const step = (now) => {
      const elapsed = now - start;
      if (!atFired && onAt && atMs != null && elapsed >= atMs) {
        atFired = true;
        onAt();
      }
      const idx = Math.min(FRAME_COUNT - 1, Math.floor(elapsed / frameMs));
      if (idx !== frame) {
        frame = idx;
        overlay.texture = sheetFrames[frame];
      }
      if (elapsed < durationMs) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** @param {number} ms */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {import('pixi.js').Container} root
 * @param {number} durationMs
 */
function fadeOutRoot(root, durationMs) {
  const startAlpha = root.alpha;
  const startScale = root.scale.x;

  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 2;
      root.alpha = startAlpha * (1 - eased);
      root.scale.set(startScale * (1 - eased * 0.35));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/**
 * Blob overlay plays on a fully visible symbol, holds, then root fades out together.
 * @param {import('pixi.js').Container} root — symbol root container
 * @param {{ cellW: number, cellH: number, speed?: number, onCover?: () => void }} opts
 */
export async function playClusterBlobPop(root, { cellW, cellH, speed = 1, onCover } = {}) {
  let sheetFrames;
  try {
    sheetFrames = await ensureBlobPopSpriteFrames();
  } catch (err) {
    console.warn('[Basic Slot] Blob pop overlay skipped.', err);
    await fadeOutRoot(root, Math.round(TIMING.blobPopSpriteExitMs / speed));
    return;
  }

  const playMs = Math.round(TIMING.blobPopSpritePlayMs / speed);
  const holdMs = Math.round(TIMING.blobPopSpriteHoldMs / speed);
  const exitMs = Math.round(TIMING.blobPopSpriteExitMs / speed);

  const overlay = new Sprite(sheetFrames[0]);
  overlay.anchor.set(0.5);
  overlay.eventMode = 'none';

  const fit = Math.min(cellW, cellH) * 0.96;
  overlay.scale.set(fit / FRAME_SIZE);
  root.addChild(overlay);

  await animateBlobFrames(overlay, sheetFrames, playMs, {
    atMs: playMs * 0.35,
    onAt: onCover,
  });
  await delay(holdMs);
  await fadeOutRoot(root, exitMs);
}

/**
 * @deprecated Use playClusterBlobPop — kept for preload call sites.
 */
export const playBlobPopSpriteOverlay = playClusterBlobPop;
