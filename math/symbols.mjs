/**
 * Symbol registry — shared by math, weights, and client copy.
 */

export const WILD_SYMBOL = 'WD';
export const SCATTER_SYMBOL = 'SC';

export const ORDINARY_SYMBOLS = ['CH', 'LM', 'OR', 'GR'];
export const PREMIUM_SYMBOLS = ['ST', 'S7', 'DM', 'CR'];
export const PAYING_SYMBOLS = [...ORDINARY_SYMBOLS, ...PREMIUM_SYMBOLS];
export const ALL_SYMBOLS = [...PAYING_SYMBOLS, WILD_SYMBOL, SCATTER_SYMBOL];

/** @type {Record<string, 'ordinary' | 'premium' | 'wild' | 'scatter'>} */
export const SYMBOL_TIER = Object.fromEntries([
  ...ORDINARY_SYMBOLS.map((id) => [id, 'ordinary']),
  ...PREMIUM_SYMBOLS.map((id) => [id, 'premium']),
  [WILD_SYMBOL, 'wild'],
  [SCATTER_SYMBOL, 'scatter'],
]);

/** Cluster resolution order — premium first, then ordinary. */
export const PAY_SYMBOL_PRIORITY = [...PREMIUM_SYMBOLS, ...ORDINARY_SYMBOLS];

export function isWildSymbol(symbol) {
  return symbol === WILD_SYMBOL;
}

export function isScatterSymbol(symbol) {
  return symbol === SCATTER_SYMBOL;
}

export function isPayingSymbolId(symbol) {
  const tier = SYMBOL_TIER[symbol];
  return tier === 'ordinary' || tier === 'premium';
}
