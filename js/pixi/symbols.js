/**
 * Symbol visuals + future Spine asset paths.
 * Placeholder tier styling: ordinary = flat/low, premium = gold/gem, wild = green sash.
 */

import { SYMBOLS } from '../config.js';

/** @typedef {{ skeleton: string, atlas: string, scale?: number }} SpineAssetPaths */

/** @type {Record<string, { color: number, accent?: number, spine?: SpineAssetPaths | null, animations?: { idle?: string, land?: string, win?: string } }>} */
export const SYMBOL_VISUAL = {
  CH: { color: 0x8b4558, accent: 0xc96a7a, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  LM: { color: 0x7a7a2e, accent: 0xb8b84a, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  OR: { color: 0x9a5520, accent: 0xd47a32, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  GR: { color: 0x5c3d7a, accent: 0x8a5cad, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  ST: { color: 0x1a4a8c, accent: 0x3d8fd9, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  S7: { color: 0x6a1a8c, accent: 0xa040d0, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  DM: { color: 0x0a6878, accent: 0x28b8d0, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  CR: { color: 0x8a6500, accent: 0xd4a017, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  WD: { color: 0x1a6b3a, accent: 0x3ecf6e, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
  /** Client-only performance blob — green square on the reveal strip. */
  BL: { color: 0x16a34a, accent: 0xbbf7d0, spine: null, animations: { idle: 'idle', land: 'land', win: 'win' } },
};

export const SYMBOL_IDS = Object.keys(SYMBOLS);

/** @param {string} id */
export function symbolLabel(id) {
  return SYMBOLS[id]?.label ?? id ?? '?';
}

/** @param {string} id */
export function symbolGlyph(id) {
  return SYMBOLS[id]?.glyph ?? id ?? '?';
}

/** @param {string} id */
export function symbolTier(id) {
  return SYMBOLS[id]?.tier ?? 'ordinary';
}

/** @param {string} id */
export function symbolVisual(id) {
  return SYMBOL_VISUAL[id] ?? { color: 0x888888, spine: null };
}

/** @param {string} id */
export function isWildSymbol(id) {
  return symbolTier(id) === 'wild';
}

/** @param {string} id */
export function isPremiumSymbol(id) {
  return symbolTier(id) === 'premium';
}

/** @param {string} id */
export function isOrdinarySymbol(id) {
  return symbolTier(id) === 'ordinary';
}

/** Pay badge shown on placeholder tiles. */
export function symbolPayBadge(id) {
  const tier = symbolTier(id);
  if (tier === 'wild') return 'WILD';
  if (tier === 'premium') return '5×';
  return '0.1×';
}
