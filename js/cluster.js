/**
 * Cluster pay rules — math lives in books; these helpers are for client display.
 */

import { ORDINARY_SYMBOLS, PREMIUM_SYMBOLS, SYMBOLS, WILD_SYMBOL } from './config.js';

export const MIN_CLUSTER_SIZE = 5;
export const MAX_CASCADE_LADDER = 8;
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

/** Display paytable for How to Play / paytable modal. */
export const CLUSTER_PAYTABLE = [
  {
    tier: 'ordinary',
    symbols: ORDINARY_SYMBOLS,
    minSize: MIN_CLUSTER_SIZE,
    multiplier: ORDINARY_BASE_PAY,
    label: 'Ordinary symbols',
  },
  {
    tier: 'premium',
    symbols: PREMIUM_SYMBOLS,
    minSize: MIN_CLUSTER_SIZE,
    multiplier: PREMIUM_BASE_PAY,
    label: 'Premium symbols',
  },
];

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
  const tier = SYMBOLS[symbolId]?.tier;
  if (tier === 'ordinary') return ORDINARY_BASE_PAY;
  if (tier === 'premium') return PREMIUM_BASE_PAY;
  return 0;
}

/** @param {number} size */
export function clusterSizeMultiplier(size) {
  if (size < MIN_CLUSTER_SIZE) return 0;
  if (CLUSTER_SIZE_MULTIPLIERS[size] != null) return CLUSTER_SIZE_MULTIPLIERS[size];
  if (size >= 13) return 10 + (size - 12) * 4;
  return 1;
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
  return Math.round(mult / ORDINARY_BASE_PAY) * ORDINARY_BASE_PAY;
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
  return symbolIds.map((id) => `${SYMBOLS[id]?.glyph ?? id} ${SYMBOLS[id]?.label ?? id}`).join(', ');
}
