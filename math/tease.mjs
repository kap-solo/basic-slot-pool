/**
 * Scatter tease books — 1 or 2 scatters on initial reveal, full cascade, no enterBonus.
 */

import {
  COLS,
  ROWS,
  mulberry32,
  randomBoard,
  simulateCascadeRound,
} from './cluster.mjs';
import { countScattersOnBoard, withScattersOnBoard } from './feature.mjs';
import { createInitialSymbolRng, createRefillSymbolRng } from './symbol-weights.mjs';

/** Crafted reveal — no paying clusters before scatters are placed. */
const TEASE_BASE_BOARD = [
  ['CH', 'LM', 'OR', 'GR', 'ST'],
  ['OR', 'GR', 'LM', 'CH', 'S7'],
  ['LM', 'OR', 'GR', 'DM', 'CH'],
  ['GR', 'CH', 'LM', 'OR', 'CR'],
  ['ST', 'OR', 'CH', 'LM', 'GR'],
];

/** Candidate scatter cells on the crafted board (all keep clusters clear at count ≤ 2). */
const TEASE_SCATTER_SLOTS = [
  [0, 4],
  [2, 2],
  [4, 0],
  [1, 0],
  [3, 4],
  [0, 2],
  [4, 3],
  [2, 4],
  [1, 3],
  [3, 1],
  [0, 0],
  [4, 4],
];

/**
 * @param {() => number} rng01
 * @param {number} count
 * @returns {[number, number][]}
 */
function pickScatterCells(rng01, count) {
  /** @type {[number, number][]} */
  const cells = [];
  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      cells.push([col, row]);
    }
  }

  for (let i = cells.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng01() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  return cells.slice(0, count);
}

/**
 * @param {number} seed
 * @param {number} count
 * @returns {[number, number][]}
 */
function pickLossScatterCells(seed, count) {
  const slots = [...TEASE_SCATTER_SLOTS];
  const rng = mulberry32(seed ^ 0x51ed2701);
  for (let i = slots.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  return slots.slice(0, count);
}

/**
 * @param {number} seed
 * @param {1 | 2} scatterCount
 * @param {{ variant?: 'loss' | 'win' }} [opts]
 */
export function simulateTeaseBook(seed, scatterCount, { variant = 'win' } = {}) {
  if (scatterCount !== 1 && scatterCount !== 2) {
    throw new Error(`tease scatter count must be 1 or 2, got ${scatterCount}`);
  }

  const rng = mulberry32(seed);
  const nextInitial = createInitialSymbolRng(rng);
  const refillRng = mulberry32(seed ^ 0x9e3779b9);
  const nextRefill = createRefillSymbolRng(refillRng);

  const scatterCells =
    variant === 'loss'
      ? pickLossScatterCells(seed, scatterCount)
      : pickScatterCells(mulberry32(seed ^ 0x7f4a7c15), scatterCount);

  const board = withScattersOnBoard(
    variant === 'loss' ? TEASE_BASE_BOARD.map((col) => [...col]) : randomBoard(nextInitial),
    scatterCells,
  );

  if (countScattersOnBoard(board) !== scatterCount) {
    throw new Error(`tease seed ${seed} placed ${countScattersOnBoard(board)} scatters`);
  }

  const result = simulateCascadeRound(board, nextInitial, nextRefill);
  const reveal = result.events.find((event) => event.type === 'gameReveal');
  if (!reveal || countScattersOnBoard(reveal.board) !== scatterCount) {
    throw new Error(`tease seed ${seed} reveal scatter mismatch`);
  }

  if (result.events.some((event) => event.type === 'enterBonus')) {
    throw new Error(`tease seed ${seed} must not enter bonus`);
  }

  return {
    payoutMultiplier: result.payoutMultiplier,
    events: result.events,
    totalMultiplier: result.totalMultiplier,
    scatterCount,
    variant,
  };
}
