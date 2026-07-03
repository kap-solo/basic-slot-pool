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

export const ORDINARY_BASE_PAY = 0.1;
export const PREMIUM_BASE_PAY = 5;

/** All win multipliers snap to this step (0.1× on a $1 bet = $0.10). */
export const WIN_MULT_STEP = 0.1;

/**
 * Snap a win multiplier to the nearest 0.1× increment.
 * @param {number} mult
 */
export function quantizeWinMult(mult) {
  if (!Number.isFinite(mult) || mult <= 0) return 0;
  return Math.round(mult / WIN_MULT_STEP) * WIN_MULT_STEP;
}

/**
 * Book / lookup payout in centi-multipliers (100 = 1×), always a multiple of 10.
 * @param {number} mult
 */
export function payoutMultiplierFromMult(mult) {
  return Math.round(quantizeWinMult(mult) * 100);
}

/** Base pay at minimum cluster size (× bet, before size + cascade multipliers). */
export const SYMBOL_BASE_PAY = Object.fromEntries([
  ...ORDINARY_SYMBOLS.map((id) => [id, ORDINARY_BASE_PAY]),
  ...PREMIUM_SYMBOLS.map((id) => [id, PREMIUM_BASE_PAY]),
]);

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

/** Display rows for paytable modal (client). */
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
