/**
 * Cluster + cascade math — used offline when generating books (not in browser).
 */

import {
  MAX_CASCADE_LADDER,
  MIN_CLUSTER_SIZE,
  basePayForSymbol,
  cascadeMultiplier,
  clusterBaseMultiplier,
  isPayingSymbol,
  quantizeWinMult,
  payoutMultiplierFromMult,
} from './paytable.mjs';
import { PAY_SYMBOL_PRIORITY, WILD_SYMBOL } from './symbols.mjs';
import {
  createInitialSymbolRng,
  createRefillSymbolRng,
  createHuntRefillSymbolRng,
  createExtremeHuntRefillSymbolRng,
} from './symbol-weights.mjs';

export {
  MAX_CASCADE_LADDER,
  MIN_CLUSTER_SIZE,
  basePayForSymbol,
  cascadeMultiplier,
  clusterBaseMultiplier,
  clusterSizeMultiplier,
  isPayingSymbol,
  CLUSTER_SIZE_MULTIPLIERS,
  ORDINARY_BASE_PAY,
  PREMIUM_BASE_PAY,
  quantizeWinMult,
  payoutMultiplierFromMult,
} from './paytable.mjs';

export const COLS = 5;
export const ROWS = 5;

const DIRS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

/**
 * @param {string | null | undefined} cellSymbol
 * @param {string} paySymbol
 */
function cellMatchesPaySymbol(cellSymbol, paySymbol) {
  if (!cellSymbol) return false;
  if (cellSymbol === WILD_SYMBOL) return true;
  return cellSymbol === paySymbol;
}

/**
 * Flood-fill a cluster for one pay symbol; wild substitutes but cannot seed alone.
 * @param {string[][]} board
 * @param {number} startCol
 * @param {number} startRow
 * @param {string} paySymbol
 * @param {Set<string>} visited
 * @param {Set<string>} claimed
 */
function floodPayCluster(board, startCol, startRow, paySymbol, visited, claimed) {
  /** @type {[number, number][]} */
  const cells = [];
  /** @type {[number, number][]} */
  const queue = [[startCol, startRow]];
  visited.add(`${startCol},${startRow}`);

  while (queue.length) {
    const [col, row] = queue.pop();
    const key = `${col},${row}`;
    if (claimed.has(key)) continue;
    cells.push([col, row]);

    for (const [dc, dr] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      const nKey = `${nc},${nr}`;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || visited.has(nKey) || claimed.has(nKey)) continue;
      if (!cellMatchesPaySymbol(board[nc][nr], paySymbol)) continue;
      visited.add(nKey);
      queue.push([nc, nr]);
    }
  }

  return cells;
}

/**
 * Exact-symbol flood (no wild) — diagnostics only.
 */
function floodExactCluster(board, startCol, startRow, symbol, visited) {
  /** @type {[number, number][]} */
  const cells = [];
  /** @type {[number, number][]} */
  const queue = [[startCol, startRow]];
  visited.add(`${startCol},${startRow}`);

  while (queue.length) {
    const [col, row] = queue.pop();
    cells.push([col, row]);
    for (const [dc, dr] of DIRS) {
      const nc = col + dc;
      const nr = row + dr;
      const key = `${nc},${nr}`;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || visited.has(key)) continue;
      if (board[nc][nr] !== symbol) continue;
      visited.add(key);
      queue.push([nc, nr]);
    }
  }
  return cells;
}

/** @param {string[][]} board */
export function findAllClusters(board) {
  /** @type {{ symbol: string, cells: [number, number][], size: number }[]} */
  const clusters = [];
  const visited = new Set();

  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      const key = `${col},${row}`;
      if (visited.has(key)) continue;
      const symbol = board[col][row];
      if (!symbol) continue;
      const cells = floodExactCluster(board, col, row, symbol, visited);
      if (cells.length >= MIN_CLUSTER_SIZE) {
        clusters.push({ symbol, cells, size: cells.length });
      }
    }
  }
  return clusters;
}

/** @param {string[][]} board */
export function findPayingClusters(board) {
  /** @type {{ symbol: string, cells: [number, number][], size: number }[]} */
  const clusters = [];
  const claimed = new Set();

  for (const paySymbol of PAY_SYMBOL_PRIORITY) {
    const visited = new Set();
    for (let col = 0; col < COLS; col += 1) {
      for (let row = 0; row < ROWS; row += 1) {
        const key = `${col},${row}`;
        if (visited.has(key) || claimed.has(key)) continue;
        if (board[col][row] !== paySymbol) continue;

        const cells = floodPayCluster(board, col, row, paySymbol, visited, claimed);
        if (cells.length < MIN_CLUSTER_SIZE) continue;

        for (const [c, r] of cells) claimed.add(`${c},${r}`);
        clusters.push({ symbol: paySymbol, cells, size: cells.length });
      }
    }
  }

  return clusters;
}

/** @param {string[][]} board @param {[number, number][]} cells */
export function removeCells(board, cells) {
  const next = board.map((col) => [...col]);
  for (const [col, row] of cells) {
    next[col][row] = null;
  }
  return next;
}

/** @param {string[][]} board — row 0 is top */
export function applyGravity(board) {
  const next = board.map(() => Array(ROWS).fill(null));
  for (let col = 0; col < COLS; col += 1) {
    const stack = board[col].filter((symbol) => symbol != null);
    const gap = ROWS - stack.length;
    for (let i = 0; i < stack.length; i += 1) {
      next[col][gap + i] = stack[i];
    }
  }
  return next;
}

/**
 * @param {string[][]} board
 * @param {() => string} nextSymbol
 */
export function refillBoard(board, nextSymbol) {
  const next = board.map((col) => [...col]);
  /** @type {{ col: number, row: number, symbol: string }[]} */
  const fills = [];

  for (let col = 0; col < COLS; col += 1) {
    for (let row = 0; row < ROWS; row += 1) {
      if (next[col][row] != null) continue;
      const symbol = nextSymbol();
      next[col][row] = symbol;
      fills.push({ col, row, symbol });
    }
  }

  return { board: next, fills };
}

/** @param {number} seed */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** @param {() => string} nextSymbol */
export function randomBoard(nextSymbol) {
  return Array.from({ length: COLS }, () =>
    Array.from({ length: ROWS }, () => nextSymbol()),
  );
}

/**
 * Simulate a full cascade round into book events.
 * @param {string[][]} initialBoard
 * @param {() => string} nextInitialSymbol
 * @param {() => string} nextRefillSymbol
 */
export function simulateCascadeRound(initialBoard, nextInitialSymbol, nextRefillSymbol = nextInitialSymbol) {
  let board = initialBoard.map((col) => [...col]);
  let cascade = 0;
  let totalMult = 0;
  /** @type {object[]} */
  const events = [];
  let index = 0;

  events.push({
    index: index++,
    type: 'gameReveal',
    board: board.map((col) => [...col]),
    multiplier: 0,
  });

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
    });

    const afterRemove = removeCells(board, removed);
    const afterGravity = applyGravity(afterRemove);
    const { board: refilled, fills } = refillBoard(afterGravity, nextRefillSymbol);
    board = refilled;

    events.push({
      index: index++,
      type: 'tumble',
      board: board.map((col) => [...col]),
      fills,
    });
  }

  const payoutInt = payoutMultiplierFromMult(totalMult);
  events.push({ index: index++, type: 'setTotalWin', amount: payoutInt });
  events.push({ index: index++, type: 'finalWin', amount: payoutInt });

  return {
    events,
    payoutMultiplier: payoutInt,
    totalMultiplier: payoutInt / 100,
    cascadeSteps: cascade,
  };
}

/** @param {number} seed @param {{ refillMode?: 'normal' | 'hunt' | 'extreme' }} [options] */
export function simulateFromSeed(seed, options = {}) {
  const rng = mulberry32(seed);
  const nextInitial = createInitialSymbolRng(rng);
  const refillRng = mulberry32(seed ^ 0x9e3779b9);
  const mode = options.refillMode ?? (options.huntRefill ? 'hunt' : 'normal');
  const nextRefill =
    mode === 'extreme'
      ? createExtremeHuntRefillSymbolRng(refillRng)
      : mode === 'hunt'
        ? createHuntRefillSymbolRng(refillRng)
        : createRefillSymbolRng(refillRng);
  return simulateCascadeRound(randomBoard(nextInitial), nextInitial, nextRefill);
}

export {
  createInitialSymbolRng,
  createRefillSymbolRng,
  createHuntRefillSymbolRng,
  createExtremeHuntRefillSymbolRng,
} from './symbol-weights.mjs';
