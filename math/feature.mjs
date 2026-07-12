/**
 * Free-spins feature — book events, scatter trigger, multi-spin simulation.
 *
 * Target (v1): 3 scatters on base reveal → 8 free spins, ~16× avg feature total,
 * funded at ~8% RTP @ 1/200 trigger (lookup tuning later).
 */

import {
  cascadeMultiplier,
  clusterBaseMultiplier,
  payoutMultiplierFromMult,
  quantizeWinMult,
} from './paytable.mjs';
import { SCATTER_SYMBOL } from './symbols.mjs';
import {
  applyGravity,
  findPayingClusters,
  refillBoard,
  removeCells,
} from './cluster.mjs';
import { createRefillSymbolRng, createFreeSpinRefillSymbolRng, createBuyFreeSpinRefillSymbolRng } from './symbol-weights.mjs';

export const SCATTER_TRIGGER_COUNT = 3;
export const FREE_SPINS_AWARDED = 8;

/** @typedef {'enterBonus' | 'updateFreeSpin' | 'freeSpinEnd'} FeatureEventType */

/**
 * @param {string[][]} board — column-major
 */
export function countScattersOnBoard(board) {
  let total = 0;
  for (const column of board) {
    for (const cell of column) {
      if (cell === SCATTER_SYMBOL) total += 1;
    }
  }
  return total;
}

/**
 * @param {string[][]} board
 * @param {[number, number][]} cells — [col, row]
 */
export function withScattersOnBoard(board, cells) {
  const next = board.map((column) => [...column]);
  for (const [col, row] of cells) {
    if (next[col]?.[row] != null) next[col][row] = SCATTER_SYMBOL;
  }
  return next;
}

/**
 * One paid or free spin leg: gameReveal + cascade events (no round totals).
 *
 * @param {string[][]} initialBoard
 * @param {() => string} nextRefillSymbol
 * @param {{ startIndex?: number, freeSpin?: number }} [opts]
 */
export function simulateSpinLeg(initialBoard, nextRefillSymbol, { startIndex = 0, freeSpin = null } = {}) {
  let board = initialBoard.map((column) => [...column]);
  let cascade = 0;
  let totalMult = 0;
  /** @type {object[]} */
  const events = [];
  let index = startIndex;

  const reveal = {
    index: index++,
    type: 'gameReveal',
    board: board.map((column) => [...column]),
    multiplier: 0,
  };
  if (freeSpin != null) reveal.freeSpin = freeSpin;
  events.push(reveal);

  while (true) {
    const clusters = findPayingClusters(board);
    if (!clusters.length) break;

    cascade += 1;
    const ladder = cascadeMultiplier(cascade);
    /** @type {[number, number][]} */
    const removed = [];
    let stepMult = 0;

    const clusterPayload = clusters.map((cluster) => {
      const baseMultiplier = clusterBaseMultiplier(cluster.symbol, cluster.size);
      stepMult += baseMultiplier * ladder;
      removed.push(...cluster.cells);
      return {
        symbol: cluster.symbol,
        cells: cluster.cells,
        size: cluster.size,
        baseMultiplier,
      };
    });

    stepMult = quantizeWinMult(stepMult);
    totalMult += stepMult;

    events.push({
      index: index++,
      type: 'clusterWin',
      cascade,
      cascadeMultiplier: ladder,
      clusters: clusterPayload,
      stepMultiplier: stepMult,
      removed,
      ...(freeSpin != null ? { freeSpin } : {}),
    });

    const afterRemove = removeCells(board, removed);
    const afterGravity = applyGravity(afterRemove);
    const { board: refilled, fills } = refillBoard(afterGravity, nextRefillSymbol);
    board = refilled;

    events.push({
      index: index++,
      type: 'tumble',
      board: board.map((column) => [...column]),
      fills,
      ...(freeSpin != null ? { freeSpin } : {}),
    });
  }

  return {
    events,
    nextIndex: index,
    legMultiplier: quantizeWinMult(totalMult),
    finalBoard: board,
  };
}

/**
 * Build a full feature book: base reveal (3 SC) + 8 free spins.
 * Base board is crafted for no paying clusters; FS boards use independent seeds.
 *
 * @param {number} seed
 * @param {{ freeSpinSeeds?: number[], refill?: 'natural' | 'buy' }} [opts]
 */
export function simulateFeatureBook(seed, { freeSpinSeeds = [], refill = 'natural', bookId = null } = {}) {
  return simulateFeatureBookInternal(seed, {
    freeSpinSeeds,
    refillKind: refill,
    includeScatterTrigger: true,
    bonusSource: 'natural',
    bookId,
  });
}

/**
 * Buy Bonus — 3-scatter trigger presentation + 8 free spins (buy-tuned refill).
 *
 * @param {number} seed
 * @param {{ freeSpinSeeds?: number[] }} [opts]
 */
export function simulateBuyFeatureBook(seed, { freeSpinSeeds = [] } = {}) {
  return simulateFeatureBookInternal(seed, {
    freeSpinSeeds,
    refillKind: 'bb',
    includeScatterTrigger: true,
    bonusSource: 'bb',
    bookIdOffset: 10_000,
  });
}

/**
 * @param {number} seed
 * @param {{ freeSpinSeeds?: number[], refillKind?: 'natural' | 'bb', includeScatterTrigger?: boolean, bonusSource?: 'natural' | 'bb', bookIdOffset?: number, bookId?: number }} opts
 */
function simulateFeatureBookInternal(seed, {
  freeSpinSeeds = [],
  refillKind = 'natural',
  includeScatterTrigger = true,
  bonusSource = 'natural',
  bookIdOffset = 9000,
  bookId = null,
} = {}) {
  /** @type {object[]} */
  const events = [];
  let index = 0;
  let totalMult = 0;

  const baseBoard = withScattersOnBoard(
    [
      ['CH', 'LM', 'OR', 'GR', 'ST'],
      ['OR', 'GR', 'LM', 'CH', 'S7'],
      ['LM', 'OR', 'GR', 'DM', 'CH'],
      ['GR', 'CH', 'LM', 'OR', 'CR'],
      ['ST', 'OR', 'CH', 'LM', 'GR'],
    ],
    includeScatterTrigger
      ? [
          [0, 4],
          [2, 2],
          [4, 0],
        ]
      : [],
  );

  const baseRng = mulberry32(seed);
  const baseRefill = createRefillSymbolRng(baseRng);
  const baseLeg = simulateSpinLeg(baseBoard, baseRefill, { startIndex: index });
  events.push(...baseLeg.events);
  index = baseLeg.nextIndex;
  totalMult += baseLeg.legMultiplier;

  if (includeScatterTrigger && countScattersOnBoard(baseBoard) < SCATTER_TRIGGER_COUNT) {
    throw new Error('sample base board must include 3 scatters');
  }

  events.push({
    index: index++,
    type: 'enterBonus',
    reason: 'freeSpins',
    total: FREE_SPINS_AWARDED,
    scatters: includeScatterTrigger ? SCATTER_TRIGGER_COUNT : 0,
    ...(bonusSource === 'bb' ? { source: 'bb' } : {}),
  });

  let featureMult = 0;

  for (let spin = 1; spin <= FREE_SPINS_AWARDED; spin += 1) {
    events.push({
      index: index++,
      type: 'updateFreeSpin',
      current: spin,
      total: FREE_SPINS_AWARDED,
    });

    const spinSeed = freeSpinSeeds[spin - 1] ?? seed + spin * 9973;
    const spinRng = mulberry32(spinSeed);
    const fsRefill =
      refillKind === 'bb'
        ? createBuyFreeSpinRefillSymbolRng(spinRng)
        : createFreeSpinRefillSymbolRng(spinRng);
    const initial = randomFeatureBoard(spinRng);
    const leg = simulateSpinLeg(initial, fsRefill, { startIndex: index, freeSpin: spin });
    events.push(...leg.events);
    index = leg.nextIndex;
    featureMult += leg.legMultiplier;
    totalMult += leg.legMultiplier;
  }

  totalMult = quantizeWinMult(totalMult);
  featureMult = quantizeWinMult(featureMult);
  const featurePayoutInt = payoutMultiplierFromMult(featureMult);
  const payoutInt = payoutMultiplierFromMult(totalMult);

  events.push({
    index: index++,
    type: 'freeSpinEnd',
    amount: featurePayoutInt,
    totalMultiplier: featureMult,
  });
  events.push({ index: index++, type: 'setTotalWin', amount: payoutInt });
  events.push({ index: index++, type: 'finalWin', amount: payoutInt });

  return {
    id: bookId ?? bookIdOffset + (seed % 999),
    payoutMultiplier: payoutInt,
    events,
    totalMultiplier: payoutInt / 100,
    featureMultiplier: featureMult,
    scatterCount: includeScatterTrigger ? SCATTER_TRIGGER_COUNT : 0,
    source: bonusSource,
  };
}

/** @param {() => number} rng01 */
function randomFeatureBoard(rng01) {
  const symbols = ['CH', 'LM', 'OR', 'GR', 'ST', 'S7', 'DM', 'CR', 'WD'];
  return Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => {
      return symbols[Math.floor(rng01() * symbols.length)];
    }),
  );
}

/** @param {number} seed */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
