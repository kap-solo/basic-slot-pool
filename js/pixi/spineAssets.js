/**
 * Load Spine skeleton data for symbols that ship with assets.
 * Returns Map<symbolId, import('@esotericsoftware/spine-core').SkeletonData>
 */

import { Assets, Cache } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { SYMBOL_VISUAL } from './symbols.js';

/** @type {Map<string, import('@esotericsoftware/spine-core').SkeletonData> | null} */
let cache = null;

async function loadSpinePair(paths) {
  const skeletonAlias = `spine-skel:${paths.skeleton}`;
  const atlasAlias = `spine-atlas:${paths.atlas}`;
  const scale = paths.scale ?? 1;
  const cacheKey = `${skeletonAlias}-${atlasAlias}-${scale}`;

  if (!Assets.cache.has(skeletonAlias)) {
    await Assets.load({ alias: skeletonAlias, src: paths.skeleton });
  }
  if (!Assets.cache.has(atlasAlias)) {
    await Assets.load({ alias: atlasAlias, src: paths.atlas });
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

/**
 * @returns {Promise<Map<string, import('@esotericsoftware/spine-core').SkeletonData>>}
 */
export async function loadSpineSymbolRegistry() {
  if (cache) return cache;

  /** @type {Map<string, import('@esotericsoftware/spine-core').SkeletonData>} */
  const loaded = new Map();

  for (const [id, visual] of Object.entries(SYMBOL_VISUAL)) {
    if (!visual.spine?.skeleton || !visual.spine?.atlas) continue;
    try {
      const data = await loadSpinePair(visual.spine);
      loaded.set(id, data);
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
