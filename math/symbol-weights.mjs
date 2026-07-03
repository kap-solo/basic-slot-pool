/**
 * Symbol weights — ordinary ~58%, premium ~27%, wild ~4% on initial deal.
 */

import { ALL_SYMBOLS } from './symbols.mjs';

/** @type {Record<string, number>} */
export const INITIAL_SYMBOL_WEIGHTS = {
  CH: 140,
  LM: 140,
  OR: 140,
  GR: 140,
  ST: 55,
  S7: 55,
  DM: 45,
  CR: 45,
  WD: 30,
};

/** Slightly richer pay mix on refill — keeps cascades active. */
export const REFILL_SYMBOL_WEIGHTS = {
  CH: 130,
  LM: 130,
  OR: 130,
  GR: 130,
  ST: 62,
  S7: 62,
  DM: 52,
  CR: 52,
  WD: 35,
};

/** Aggressive refill for hunting multi-cascade tail books. */
export const HUNT_REFILL_SYMBOL_WEIGHTS = {
  CH: 100,
  LM: 100,
  OR: 100,
  GR: 100,
  ST: 80,
  S7: 80,
  DM: 70,
  CR: 70,
  WD: 45,
};

/** Heavy premium bias — offline hero-book hunt only. */
export const EXTREME_HUNT_REFILL_SYMBOL_WEIGHTS = {
  CH: 70,
  LM: 70,
  OR: 70,
  GR: 70,
  ST: 110,
  S7: 110,
  DM: 100,
  CR: 100,
  WD: 55,
};

/**
 * @param {Record<string, number>} table
 */
function normalize(table) {
  const total = Object.values(table).reduce((sum, w) => sum + w, 0);
  /** @type {Record<string, number>} */
  const out = {};
  for (const [symbol, weight] of Object.entries(table)) {
    out[symbol] = weight / total;
  }
  return out;
}

const INITIAL = normalize(INITIAL_SYMBOL_WEIGHTS);
const REFILL = normalize(REFILL_SYMBOL_WEIGHTS);
const HUNT_REFILL = normalize(HUNT_REFILL_SYMBOL_WEIGHTS);
const EXTREME_HUNT_REFILL = normalize(EXTREME_HUNT_REFILL_SYMBOL_WEIGHTS);

/**
 * @param {() => number} rng01
 * @param {Record<string, number>} table
 */
function pickWeighted(rng01, table) {
  let r = rng01();
  for (const [symbol, weight] of Object.entries(table)) {
    r -= weight;
    if (r <= 0) return symbol;
  }
  return ALL_SYMBOLS.at(-1);
}

/** @param {() => number} rng01 @param {Record<string, number>} [table] */
export function createRefillSymbolRngFromTable(rng01, table = REFILL) {
  const normalized = normalize(table);
  return () => pickWeighted(rng01, normalized);
}

/** @param {() => number} rng01 */
export function createInitialSymbolRng(rng01) {
  return () => pickWeighted(rng01, INITIAL);
}

/** @param {() => number} rng01 */
export function createRefillSymbolRng(rng01) {
  return () => pickWeighted(rng01, REFILL);
}

/** @param {() => number} rng01 */
export function createHuntRefillSymbolRng(rng01) {
  return () => pickWeighted(rng01, HUNT_REFILL);
}

/** @param {() => number} rng01 */
export function createExtremeHuntRefillSymbolRng(rng01) {
  return () => pickWeighted(rng01, EXTREME_HUNT_REFILL);
}

export function payingCellShareInitial() {
  return Object.entries(INITIAL)
    .filter(([id]) => id !== 'WD')
    .reduce((sum, [, weight]) => sum + weight, 0);
}
