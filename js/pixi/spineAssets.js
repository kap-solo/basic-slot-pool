/**
 * Load Spine skeleton data for symbols that ship with assets.
 * Returns Map<symbolId, import('@esotericsoftware/spine-core').SkeletonData>
 */

import { Assets } from 'pixi.js';
import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';
import { SYMBOL_VISUAL } from './symbols.js';

/** @type {Map<string, SPINE_PIXI.SkeletonData> | null} */
let cache = null;

async function loadSpinePair(paths) {
  const alias = `spine-${paths.skeleton}-${paths.atlas}`;
  if (!Assets.cache.has(alias)) {
    await Assets.load({
      alias,
      src: {
        skeleton: paths.skeleton,
        atlas: paths.atlas,
      },
      data: { scale: paths.scale ?? 1 },
    });
  }
  return /** @type {SPINE_PIXI.SkeletonData} */ (Assets.get(alias));
}

/**
 * @returns {Promise<Map<string, SPINE_PIXI.SkeletonData>>}
 */
export async function loadSpineSymbolRegistry() {
  if (cache) return cache;

  /** @type {Map<string, SPINE_PIXI.SkeletonData>} */
  const loaded = new Map();

  for (const [id, visual] of Object.entries(SYMBOL_VISUAL)) {
    if (!visual.spine?.skeleton || !visual.spine?.atlas) continue;
    try {
      const data = await loadSpinePair(visual.spine);
      loaded.set(id, data);
    } catch (err) {
      console.warn(`[Basic Slot] Spine symbol "${id}" unavailable — using placeholder.`, err);
    }
  }

  cache = loaded;
  return loaded;
}

/** @param {string} id @param {Map<string, SPINE_PIXI.SkeletonData>} registry */
export function getSpineData(id, registry) {
  return registry.get(id) ?? null;
}
