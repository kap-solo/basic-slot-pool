/**
 * Load Spine skeleton data for symbols that ship with assets.
 * Returns Map<symbolId, import('@esotericsoftware/spine-core').SkeletonData>
 */

import { Assets, Cache } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { BUILD_COMMIT } from '../build-info.js';
import { SYMBOL_VISUAL } from './symbols.js';

/** @type {Map<string, import('@esotericsoftware/spine-core').SkeletonData> | null} */
let cache = null;

/** One bust token per dev page load so Spine file edits show after refresh. */
let devAssetBust = null;

/** @param {string} path */
function versionedSpineSrc(path) {
  const sep = path.includes('?') ? '&' : '?';
  const dev = typeof location !== 'undefined' && /[?&]dev=true/.test(location.search);
  if (dev) {
    devAssetBust ??= Date.now();
    return `${path}${sep}v=${BUILD_COMMIT}-${devAssetBust}`;
  }
  return `${path}${sep}v=${BUILD_COMMIT}`;
}

async function loadSpinePair(paths) {
  const skeletonSrc = versionedSpineSrc(paths.skeleton);
  const atlasSrc = versionedSpineSrc(paths.atlas);
  const skeletonAlias = `spine-skel:${skeletonSrc}`;
  const atlasAlias = `spine-atlas:${atlasSrc}`;
  const scale = paths.scale ?? 1;
  const cacheKey = `${skeletonAlias}-${atlasAlias}-${scale}`;

  if (!Assets.cache.has(skeletonAlias)) {
    await Assets.load({ alias: skeletonAlias, src: skeletonSrc });
  }
  if (!Assets.cache.has(atlasAlias)) {
    await Assets.load({ alias: atlasAlias, src: atlasSrc });
  }

  if (!Cache.has(cacheKey)) {
    const probe = Spine.from({
      skeleton: skeletonAlias,
      atlas: atlasAlias,
      scale,
      autoUpdate: false,
    });
    probe.destroy({ children: true });
  }

  return /** @type {import('@esotericsoftware/spine-core').SkeletonData} */ (Cache.get(cacheKey));
}

/** @param {import('./symbols.js').SpineAssetPaths} spine */
function spinePairKey(spine) {
  return `${spine.skeleton}|${spine.atlas}|${spine.scale ?? 1}`;
}

/**
 * @returns {Promise<Map<string, import('@esotericsoftware/spine-core').SkeletonData>>}
 */
export async function loadSpineSymbolRegistry() {
  if (cache) return cache;

  /** @type {Map<string, import('@esotericsoftware/spine-core').SkeletonData>} */
  const loaded = new Map();
  /** @type {Map<string, import('@esotericsoftware/spine-core').SkeletonData>} */
  const pairCache = new Map();

  for (const [id, visual] of Object.entries(SYMBOL_VISUAL)) {
    if (!visual.spine?.skeleton || !visual.spine?.atlas) continue;
    const pairKey = spinePairKey(visual.spine);
    try {
      if (!pairCache.has(pairKey)) {
        pairCache.set(pairKey, await loadSpinePair(visual.spine));
      }
      loaded.set(id, pairCache.get(pairKey));
      console.info(`[Basic Slot] Spine symbol "${id}" loaded.`);
    } catch (err) {
      console.warn(`[Basic Slot] Spine symbol "${id}" unavailable — using placeholder.`, err);
    }
  }

  cache = loaded;
  return loaded;
}

/** @param {string} id @param {Map<string, import('@esotericsoftware/spine-core').SkeletonData>} registry */
export function getSpineData(id, registry) {
  return registry.get(id) ?? null;
}

/**
 * Load a standalone Spine asset (e.g. flank character) outside the symbol registry.
 * @param {{ skeleton: string, atlas: string, scale?: number }} paths
 * @returns {Promise<import('@esotericsoftware/spine-core').SkeletonData>}
 */
export async function loadSpineAsset(paths) {
  return loadSpinePair(paths);
}
