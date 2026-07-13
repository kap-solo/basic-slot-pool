/**
 * Cluster pay rules — shared by simulation, validation, and client copy.
 */

import {
  ORDINARY_SYMBOLS,
  PAYING_SYMBOLS,
  PREMIUM_SYMBOLS,
  isPayingSymbolId,
} from './symbols.mjs';

export { WILD_SYMBOL, ORDINARY_SYMBOLS, PREMIUM_SYMBOLS, PAYING_SYMBOLS } from './symbols.mjs';

export const MIN_CLUSTER_SIZE = 5;
export const MAX_CASCADE_LADDER = 8;

/** Legacy tier anchors — used for docs only; pays are per-symbol below. */
export const ORDINARY_BASE_PAY = 0.1;
export const PREMIUM_BASE_PAY = 5;

/** Snap wins to 0.01× ($0.01 on a $1 bet) so shaped symbol pays survive quantization. */
export const WIN_MULT_STEP = 0.01;

/**
 * Base pay at minimum cluster size (× bet, before size + cascade multipliers).
 * Ordinary spread is wider than premium — each symbol has its own value.
 */
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

/**
 * @param {number} mult
 */
export function quantizeWinMult(mult) {
  if (!Number.isFinite(mult) || mult <= 0) return 0;
  return Math.round(mult / WIN_MULT_STEP) * WIN_MULT_STEP;
}

/**
 * Book / lookup payout in centi-multipliers (100 = 1×).
 * @param {number} mult
 */
export function payoutMultiplierFromMult(mult) {
  return Math.round(quantizeWinMult(mult) * 100);
}

/** Cluster-size multiplier — steeper at the top for polarised tail. */
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

export function isPayingSymbol(symbol) {
  return isPayingSymbolId(symbol);
}

export function basePayForSymbol(symbol) {
  return SYMBOL_BASE_PAY[symbol] ?? 0;
}

/**
 * @param {number} size
 */
export function clusterSizeMultiplier(size) {
  if (size < MIN_CLUSTER_SIZE) return 0;
  if (CLUSTER_SIZE_MULTIPLIERS[size] != null) return CLUSTER_SIZE_MULTIPLIERS[size];
  if (size >= 13) return 10 + (size - 12) * 4;
  return 1;
}

/**
 * @param {string} symbol
 * @param {number} size
 */
export function clusterBaseMultiplier(symbol, size) {
  const base = basePayForSymbol(symbol);
  if (!base) return 0;
  return base * clusterSizeMultiplier(size);
}

export function cascadeMultiplier(cascadeIndex) {
  return Math.min(Math.max(1, cascadeIndex), MAX_CASCADE_LADDER);
}

/** Display rows for paytable modal — one row per paying symbol. */
export const CLUSTER_PAYTABLE = PAYING_SYMBOLS.map((symbolId) => ({
  symbolId,
  symbols: [symbolId],
  minSize: MIN_CLUSTER_SIZE,
  multiplier: SYMBOL_BASE_PAY[symbolId],
  label: symbolId,
}));
