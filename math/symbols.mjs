/**
 * Symbol registry — shared by math, weights, and client copy.
 */

export const WILD_SYMBOL = 'WD';

export const ORDINARY_SYMBOLS = ['CH', 'LM', 'OR', 'GR'];
export const PREMIUM_SYMBOLS = ['ST', 'S7', 'DM', 'CR'];
export const PAYING_SYMBOLS = [...ORDINARY_SYMBOLS, ...PREMIUM_SYMBOLS];
export const ALL_SYMBOLS = [...PAYING_SYMBOLS, WILD_SYMBOL];

/** @type {Record<string, 'ordinary' | 'premium' | 'wild'>} */
export const SYMBOL_TIER = Object.fromEntries([
  ...ORDINARY_SYMBOLS.map((id) => [id, 'ordinary']),
  ...PREMIUM_SYMBOLS.map((id) => [id, 'premium']),
  [WILD_SYMBOL, 'wild'],
]);

/** Cluster resolution order — premium first, then ordinary. */
export const PAY_SYMBOL_PRIORITY = [...PREMIUM_SYMBOLS, ...ORDINARY_SYMBOLS];

export function isWildSymbol(symbol) {
  return symbol === WILD_SYMBOL;
}

export function isPayingSymbolId(symbol) {
  return symbol in SYMBOL_TIER && SYMBOL_TIER[symbol] !== 'wild';
}
