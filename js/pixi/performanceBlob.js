/**
 * Performance-only blob — a client strip symbol that falls in on reveal.
 * Never affects books, payout, or cascade ladder truth.
 */

import { GAME } from '../config.js';
import { blockForRow, isTallSymbolPreview, parseColumnBlocks } from '../tall-symbols.js';
import { scaledDelay } from './easing.js';
import { TIMING } from './timing.js';

/** Bottom visible row (row 5 in a 5-row grid). */
export const BLOB_ROW = GAME.rows - 1;

/** Row directly above the bottom — only stacked when bottom row in same column is a blob. */
export const BLOB_STACK_ROW = BLOB_ROW - 1;

/**
 * Try paired row-4 + row-5 blobs. Set false to revert to bottom-row-only behaviour.
 * URL override: ?blobs=no-stack forces bottom-row-only even when this is true.
 */
export const BLOB_STACK_ROW4_ENABLED = true;

/** Chance a bottom-row blob also gets a stacked partner on row 4 (same column). */
export const BLOB_STACK_ROW4_CHANCE = 0.5;

function blobStackRow4Enabled() {
  if (!BLOB_STACK_ROW4_ENABLED) return false;
  if (new URLSearchParams(window.location.search).get('blobs') === 'no-stack') return false;
  return BLOB_STACK_ROW >= 0;
}

/**
 * Row must be a single cell, not the tail of a taller merged block.
 * @param {number} col
 * @param {string[][]} board
 * @param {number} row
 */
function isRowBlobEligible(col, board, row) {
  if (!isTallSymbolPreview()) return true;
  const column = board[col];
  if (!column?.length || row < 0 || row >= column.length) return false;
  const blocks = parseColumnBlocks(column, { tallEnabled: true });
  const block = blockForRow(blocks, row);
  if (!block) return true;
  return block.anchorRow === row && block.span === 1;
}

/** Client-only strip symbol id — not in maths or books. */
export const PERFORMANCE_BLOB_SYMBOL = 'BL';

/** ~25% of spins. */
export const BLOB_SPIN_CHANCE = 0.25;

function blobsForcedFromUrl() {
  return new URLSearchParams(window.location.search).get('blobs') === 'always';
}

/**
 * @param {number} seed
 * @returns {() => number}
 */
export function createSeededRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * FNV-1a — Stake round IDs are often non-numeric strings; Number() would NaN → 0.
 * @param {string} value
 * @returns {number}
 */
export function hashStringToSeed(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Stable per-round seed for client-only blob placement (replay-safe).
 * Uses round id string + bet amount + gameReveal board so Stake UUID round IDs
 * and missing roundID both vary per spin.
 *
 * @param {object} round
 * @param {string[][] | null | undefined} [revealBoard]
 * @returns {number}
 */
export function blobSeedFromRound(round, revealBoard = null) {
  const roundKey = String(round?.roundID ?? round?.id ?? round?.bookId ?? '');
  const amount = Number(round?.amount ?? 0);
  const board =
    revealBoard ??
    (round?.state ?? []).find((event) => event?.type === 'gameReveal')?.board ??
    null;
  const boardKey = board?.length
    ? board.map((column) => column.join('')).join('|')
    : '';

  const idHash = hashStringToSeed(roundKey);
  const boardHash = hashStringToSeed(boardKey);
  return (
    Math.imul(idHash, 2654435761)
    ^ Math.imul(amount, 1597334677)
    ^ Math.imul(boardHash, 2246822519)
  ) >>> 0;
}

/**
 * @param {() => number} rng01
 * @returns {boolean}
 */
export function shouldShowBlobs(rng01) {
  if (blobsForcedFromUrl()) return true;
  return rng01() < BLOB_SPIN_CHANCE;
}

/**
 * @param {string[][]} board
 * @param {() => number} rng01
 * @returns {[number, number][]}
 */
export function pickBlobCells(board, rng01) {
  const cols = board.length || GAME.reels;
  const count = 1 + Math.floor(rng01() * 3);
  /** @type {[number, number][]} */
  const picked = [];
  const usedCols = new Set();

  for (let attempt = 0; attempt < 64 && picked.length < count; attempt += 1) {
    const col = Math.floor(rng01() * cols);
    if (usedCols.has(col)) continue;
    if (!isRowBlobEligible(col, board, BLOB_ROW)) continue;
    usedCols.add(col);
    picked.push([col, BLOB_ROW]);

    if (
      blobStackRow4Enabled() &&
      rng01() < BLOB_STACK_ROW4_CHANCE &&
      isRowBlobEligible(col, board, BLOB_STACK_ROW)
    ) {
      picked.push([col, BLOB_STACK_ROW]);
    }
  }

  return picked;
}

/**
 * Contiguous bottom blob depth per column (1 = bottom only, 2 = rows 4+5).
 * @param {[number, number][]} blobCells
 * @returns {Map<number, number>}
 */
export function blobDepthByColumn(blobCells) {
  const removedByCol = blobRemovedRowsByColumn(blobCells);
  /** @type {Map<number, number>} */
  const depthByCol = new Map();
  for (const [col, rows] of removedByCol) {
    depthByCol.set(col, rows.length);
  }
  return depthByCol;
}

/**
 * @param {string[][]} revealBoard
 * @param {[number, number][]} blobCells
 * @returns {string[][]}
 */
export function buildVisualRevealBoard(revealBoard, blobCells) {
  const board = revealBoard.map((column) => [...column]);
  const depthByCol = blobDepthByColumn(blobCells);

  for (const [col, depth] of depthByCol) {
    const column = revealBoard[col];
    if (!column?.length) continue;
    const keepRows = column.length - depth;
    for (let row = 0; row < keepRows; row += 1) {
      board[col][row] = column[row + depth] ?? column[row];
    }
    for (let row = keepRows; row < column.length; row += 1) {
      board[col][row] = PERFORMANCE_BLOB_SYMBOL;
    }
  }
  return board;
}

/**
 * Column data matching painted nodes after blob pop — strip k rows short at top.
 * @param {string[]} revealColumn
 * @param {number} [depth=1]
 * @returns {(string | null)[]}
 */
export function blobCascadeColumnState(revealColumn, depth = 1) {
  const shift = Math.max(1, depth);
  /** @type {(string | null)[]} */
  const column = [...revealColumn];
  const keepRows = Math.max(0, column.length - shift);
  for (let row = 0; row < keepRows; row += 1) {
    column[row] = revealColumn[row + shift] ?? revealColumn[row];
  }
  for (let row = keepRows; row < column.length; row += 1) {
    column[row] = null;
  }
  return column;
}

/**
 * @param {[number, number][]} blobCells
 * @returns {Map<number, number[]>}
 */
export function blobRemovedRowsByColumn(blobCells) {
  /** @type {Map<number, number[]>} */
  const byCol = new Map();
  for (const [col, row] of blobCells) {
    if (!byCol.has(col)) byCol.set(col, []);
    byCol.get(col).push(row);
  }
  for (const rows of byCol.values()) {
    rows.sort((a, b) => a - b);
  }
  return byCol;
}

/**
 * @param {[number, number][]} blobCells
 * @returns {Set<string>}
 */
export function blobCellsToKeys(blobCells) {
  return new Set(blobCells.map(([col, row]) => `${col},${row}`));
}

/**
 * @param {object | null | undefined} round
 */
export function roundHasFeatureBonus(round) {
  return (round?.state ?? []).some((event) => event.type === 'enterBonus');
}

/**
 * Green squares are base-mode polish only — skip during free spins / feature books.
 *
 * @param {object | null | undefined} event — gameReveal book event
 * @param {object | null | undefined} round
 */
export function shouldPlanBlobPresentation(event, round) {
  if (event?.freeSpin != null) return false;
  if (roundHasFeatureBonus(round)) return false;
  return true;
}

/**
 * @param {string[][]} revealBoard
 * @param {object} round
 * @param {object | null} [revealEvent] — gameReveal event (for feature / free-spin gating)
 * @returns {{
 *   blobCells: [number, number][],
 *   cellKeys: Set<string>,
 *   visualBoard: string[][],
 *   removedByCol: Map<number, number[]>,
 *   blobDepthByCol: Map<number, number>,
 * } | null}
 */
export function planRoundBlobPresentation(revealBoard, round, revealEvent = null) {
  if (!revealBoard?.length || !round) return null;
  if (revealEvent && !shouldPlanBlobPresentation(revealEvent, round)) return null;

  const rng = createSeededRng(blobSeedFromRound(round, revealBoard));
  if (!shouldShowBlobs(rng)) return null;

  const blobCells = pickBlobCells(revealBoard, rng);
  if (!blobCells.length) return null;

  return {
    blobCells,
    cellKeys: blobCellsToKeys(blobCells),
    visualBoard: buildVisualRevealBoard(revealBoard, blobCells),
    removedByCol: blobRemovedRowsByColumn(blobCells),
    blobDepthByCol: blobDepthByColumn(blobCells),
  };
}

/**
 * After reveal — hold, pop bottom blob(s), gravity tumble to gameReveal.
 * Reveal lands one row short (shifted strip); cascade lets survivors fall and top strip fills.
 * @param {Awaited<ReturnType<import('../slot.js').createSlotBoard>>} boardUi
 * @param {string[][]} revealBoard
 * @param {NonNullable<ReturnType<typeof planRoundBlobPresentation>>} plan
 * @param {{ speed?: number, blobDissolve?: { play?: (unlock?: () => void) => void, durationMs?: () => number } }} [opts]
 */
export async function presentBlobAfterReveal(boardUi, revealBoard, plan, {
  speed = 1,
  blobDissolve,
} = {}) {
  if (!boardUi || !plan) return;

  boardUi.syncBookColumnData(revealBoard);
  await scaledDelay(TIMING.blobHoldMs, speed);
  const dissolveDurationMs = blobDissolve?.durationMs?.() ?? TIMING.blobDissolveMs;
  blobDissolve?.play?.();
  await boardUi.popCells(plan.cellKeys, { speed, dissolveDurationMs });
  boardUi.syncBlobCascadeColumnData(revealBoard, plan.blobDepthByCol);
  await boardUi.animateBlobBottomCascade(revealBoard, plan.removedByCol, { speed });
}
