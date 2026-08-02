/**
 * Cluster pay rules — math lives in books; these helpers are for client display.
 * Keep SYMBOL_BASE_PAY in sync with math/paytable.mjs.
 */

import { ORDINARY_SYMBOLS, PREMIUM_SYMBOLS, SYMBOLS, WILD_SYMBOL } from './config.js';

export const MIN_CLUSTER_SIZE = 5;
export const MAX_CASCADE_LADDER = 8;
export const WIN_MULT_STEP = 0.01;

/** @type {Record<string, number>} */
export const SYMBOL_BASE_PAY = {
  CH: 0.08,
  LM: 0.1,
  OR: 0.12,
  GR: 0.14,
  ST: 4,
  S7: 5,
  DM: 5,
  CR: 6,
};

export const ORDINARY_BASE_PAY = 0.1;
export const PREMIUM_BASE_PAY = 5;

/** Cluster-size multiplier curve (matches math/paytable.mjs). */
export const CLUSTER_SIZE_MULTIPLIERS = {
  5: 1,
  6: 1.2,
  7: 1.5,
  8: 2,
  9: 3,
  10: 4.5,
  11: 6.5,
  12: 10,
};

/**
 * @typedef {object} ClusterWin
 * @property {string} symbol
 * @property {[number, number][]} cells — [col, row] column-major grid
 * @property {number} size
 * @property {number} multiplier
 */

/** One paytable row per symbol — shaped pays, not flat tiers. */
export const CLUSTER_PAYTABLE = [...ORDINARY_SYMBOLS, ...PREMIUM_SYMBOLS].map((symbolId) => ({
  symbolId,
  symbols: [symbolId],
  minSize: MIN_CLUSTER_SIZE,
  multiplier: SYMBOL_BASE_PAY[symbolId],
  label: SYMBOLS[symbolId]?.label ?? symbolId,
}));

/** @param {number} col @param {number} row */
export function clusterCellKey(col, row) {
  return `${col},${row}`;
}

/** @param {ClusterWin[] | null | undefined} clusters */
export function winCellsFromClusters(clusters) {
  /** @type {Set<string>} */
  const keys = new Set();
  for (const cluster of clusters ?? []) {
    for (const cell of cluster.cells ?? []) {
      if (!Array.isArray(cell) || cell.length < 2) continue;
      keys.add(clusterCellKey(cell[0], cell[1]));
    }
  }
  return keys;
}

/** @param {string} symbolId */
export function basePayForSymbol(symbolId) {
  return SYMBOL_BASE_PAY[symbolId] ?? 0;
}

/** @param {number} mult */
export function formatBasePayMult(mult) {
  if (!Number.isFinite(mult) || mult <= 0) return '—';
  if (mult >= 1) {
    const rounded = Math.round(mult * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}×` : `${rounded.toFixed(1)}×`;
  }
  const rounded = Math.round(mult * 100) / 100;
  return `${rounded}×`;
}

/** @param {number} size */
export function clusterSizeMultiplier(size) {
  if (size < MIN_CLUSTER_SIZE) return 0;
  if (CLUSTER_SIZE_MULTIPLIERS[size] != null) return CLUSTER_SIZE_MULTIPLIERS[size];
  if (size >= 13) return 10 + (size - 12) * 4;
  return 1;
}

/** @param {number} cascadeIndex 1-based cascade step — matches math/paytable.mjs */
export function cascadeMultiplier(cascadeIndex) {
  return Math.min(Math.max(1, cascadeIndex), MAX_CASCADE_LADDER);
}

/** @param {string} symbolId @param {number} size */
export function clusterBaseMultiplier(symbolId, size) {
  const base = basePayForSymbol(symbolId);
  if (!base) return 0;
  return base * clusterSizeMultiplier(size);
}

/** @param {number} mult */
export function quantizeWinMult(mult) {
  if (!Number.isFinite(mult) || mult <= 0) return 0;
  return Math.round(mult / WIN_MULT_STEP) * WIN_MULT_STEP;
}

/**
 * Minimum-cluster step multiplier (base pay only, no size boost) — matches math books.
 * @param {{ symbol: string }[] | null | undefined} clusters
 */
export function baseStepMultiplierFromClusters(clusters) {
  let sum = 0;
  for (const cluster of clusters ?? []) {
    sum += basePayForSymbol(cluster.symbol);
  }
  return quantizeWinMult(sum);
}

/** @param {string} symbolId */
export function clusterPayLabel(symbolId) {
  return SYMBOLS[symbolId]?.label ?? symbolId;
}

/** @param {string} symbolId */
export function symbolTierLabel(symbolId) {
  const tier = SYMBOLS[symbolId]?.tier;
  if (tier === 'premium') return 'Premium';
  if (tier === 'ordinary') return 'Ordinary';
  if (symbolId === WILD_SYMBOL) return 'Wild';
  return '';
}

/** @param {string[]} symbolIds */
export function formatSymbolList(symbolIds) {
  return symbolIds.map((id) => SYMBOLS[id]?.label ?? id).join(', ');
}
