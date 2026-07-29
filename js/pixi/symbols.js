/**
 * Symbol visuals + future Spine asset paths.
 * Placeholder tier styling: ordinary = flat/low, premium = gold/gem, wild = green sash.
 */

import { SYMBOLS } from '../config.js';
import { formatBasePayMult, basePayForSymbol } from '../cluster.js';

/** @typedef {{ skeleton: string, atlas: string, scale?: number, designSize?: { width: number, height: number } }} SpineAssetPaths */
/** @typedef {{ idle?: string, land?: string, win?: string, cascade?: string, spin?: string, dissolve?: string }} SymbolAnimations */

/** Shared Spine export — one skeleton, per-symbol tracks like idle_cherry. */
export const SYMBOLS_ALL_SPINE = {
  skeleton: 'assets/spine/symbols_spinr-flat.json',
  atlas: 'assets/spine/symbols_spinr-flat.atlas',
  scale: 1,
  designSize: { width: 256, height: 256 },
};

/** Spine editor export lands in assets/spine/symbols_all/ — copy json/atlas/png to SYMBOLS_ALL_SPINE paths. */

/** Game symbol id → symbols_spinr-flat track suffix (idle_{suffix}). */
export const SYMBOLS_ALL_TRACK = {
  CH: 'cherry',
  LM: 'lemon',
  OR: 'orange',
  GR: 'grape',
  ST: 'star',
  S7: '7',
  DM: 'diamond',
  CR: 'crown',
  WD: 'wild',
  SC: 'scatter',
};

/** Symbols with exported `fall_{suffix}` tracks in symbols_spinr-flat. */
export const SPIN_FALL_SYMBOLS = new Set([
  'CH',
  'LM',
  'OR',
  'GR',
  'S7',
  'CR',
  'DM',
  'SC',
  'ST',
  'WD',
]);

/** Spine track names — export matching keys from the editor. */
export const SYMBOL_ANIMATION_DEFAULTS = {
  idle: 'idle',
  land: 'land',
  win: 'win',
  cascade: 'cascade',
};

/** Performance blob (green square) — maps runtime states to Spine tracks in `assets/spine/blob`. */
export const BLOB_ANIMATION_DEFAULTS = {
  idle: 'idle',
  spin: 'fall',
  land: 'idle',
  dissolve: 'melt',
};

/** Suki Engine standard Spine export canvas — see `@kap-solo/suki-engine` `SPINE_TEXTURE_CANVAS_SIZE`. */
export const SPINE_TEXTURE_CANVAS_SIZE = 256;

/** Board fit ratio — see `@kap-solo/suki-engine` `SPINE_SYMBOL_FIT_RATIO`. */
export const SPINE_SYMBOL_FIT_RATIO = 0.84;

/**
 * Per-symbol animations in symbols_spinr-flat — fall on spin when a fall track exists.
 * @param {string} id
 * @returns {SymbolAnimations}
 */
export function symbolsAllAnimations(id) {
  const suffix = SYMBOLS_ALL_TRACK[id];
  if (!suffix) return { ...SYMBOL_ANIMATION_DEFAULTS };
  const idle = `idle_${suffix}`;
  const fall = `fall_${suffix}`;
  const win = suffix === 'star' ? 'win_star' : idle;
  const spin = SPIN_FALL_SYMBOLS.has(id) ? fall : idle;
  return { idle, spin, land: idle, win, cascade: idle };
}

/**
 * @param {string} id
 * @param {{ color: number, accent?: number, ledgerIcon?: string }} base
 */
function withSymbolsAllSpine(id, base) {
  return {
    ...base,
    spine: { ...SYMBOLS_ALL_SPINE },
    animations: symbolsAllAnimations(id),
  };
}

/** @type {Record<string, { color: number, accent?: number, spine?: SpineAssetPaths | null, ledgerIcon?: string, animations?: SymbolAnimations }>} */
export const SYMBOL_VISUAL = {
  CH: withSymbolsAllSpine('CH', { color: 0x8b4558, accent: 0xc96a7a }),
  LM: withSymbolsAllSpine('LM', { color: 0x7a7a2e, accent: 0xb8b84a }),
  OR: withSymbolsAllSpine('OR', { color: 0x9a5520, accent: 0xd47a32 }),
  GR: withSymbolsAllSpine('GR', { color: 0x5c3d7a, accent: 0x8a5cad }),
  ST: withSymbolsAllSpine('ST', { color: 0x1a4a8c, accent: 0x3d8fd9 }),
  S7: withSymbolsAllSpine('S7', { color: 0x6a1a8c, accent: 0xa040d0 }),
  DM: withSymbolsAllSpine('DM', { color: 0x0a6878, accent: 0x28b8d0 }),
  CR: withSymbolsAllSpine('CR', { color: 0x8a6500, accent: 0xd4a017 }),
  WD: withSymbolsAllSpine('WD', { color: 0x1a6b3a, accent: 0x3ecf6e }),
  SC: withSymbolsAllSpine('SC', { color: 0x4a2080, accent: 0xc080ff }),
  /** Client-only performance blob — green square on the reveal strip. */
  BL: {
    color: 0x16a34a,
    accent: 0xbbf7d0,
    spine: {
      skeleton: 'assets/spine/blob/blob.json',
      atlas: 'assets/spine/blob/blob.atlas',
      scale: 1,
      designSize: { width: 256, height: 256 },
    },
    animations: { ...BLOB_ANIMATION_DEFAULTS },
  },
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

/** Static icon for HTML ledger rows — falls back to glyph when unset. */
export function symbolLedgerIcon(id) {
  return symbolVisual(id).ledgerIcon ?? null;
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
export function isScatterSymbol(id) {
  return symbolTier(id) === 'scatter';
}

/** @param {string} id */
export function isPremiumSymbol(id) {
  return symbolTier(id) === 'premium';
}

/** @param {string} id */
export function isOrdinarySymbol(id) {
  return symbolTier(id) === 'ordinary';
}

/** Pay badge shown on placeholder tiles — per-symbol shaped pays. */
export function symbolPayBadge(id) {
  const tier = symbolTier(id);
  if (tier === 'wild') return 'WILD';
  if (tier === 'scatter') return null;
  return formatBasePayMult(basePayForSymbol(id));
}
