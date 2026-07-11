/**
 * Tall-symbol preview — client-only, no math/book changes.
 * Enable with ?tall=true on the pool server (port 5176).
 *
 * Tall tiles render when adjacent rows in the same column share the same
 * eligible symbol ID (same data the cluster math uses).
 */

export const MAX_TALL_SPAN = 2;

/** One ordinary symbol allowed to pair tall — breaks up the grid without opening all lows. */
export const TALL_ORDINARY_SYMBOL = 'CH';

/**
 * Same-type pairs only (e.g. CR+CR, CH+CH). Mixed types never merge.
 * Revert: change these only.
 *   Crown only:           new Set(['CR'])
 *   Crown + Cherry:       new Set(['CR', TALL_ORDINARY_SYMBOL])
 *   Crown + Diamond:      new Set(['CR', 'DM'])
 *   All premiums:         new Set(['ST', 'S7', 'DM', 'CR'])
 */
export const TALL_ELIGIBLE_SYMBOLS = new Set(['CR', TALL_ORDINARY_SYMBOL]);

/**
 * @typedef {{ id: string, anchorRow: number, span: number }} ColumnBlock
 */

/** @returns {boolean} */
export function isTallSymbolPreview() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('tall') === 'true';
}

/** @param {string} id @returns {boolean} */
export function canRenderTall(id) {
  return TALL_ELIGIBLE_SYMBOLS.has(id);
}

/**
 * Parse a column into display blocks (occupied-cells model).
 * When tall preview is on, consecutive matching eligible IDs merge into one 2-high block.
 *
 * @param {string[]} columnIds
 * @param {{ tallEnabled?: boolean, mergeSegments?: [number, number][] }} [opts]
 * @returns {ColumnBlock[]}
 */
export function parseColumnBlocks(columnIds, { tallEnabled = false, mergeSegments = null } = {}) {
  /** @type {[number, number][]} */
  const segments = mergeSegments ?? [[0, columnIds.length - 1]];

  /** @param {number} row */
  const pairInSameSegment = (row) => {
    if (row + 1 >= columnIds.length) return false;
    return segments.some(([start, end]) => row >= start && row + 1 <= end);
  };

  /** @type {ColumnBlock[]} */
  const blocks = [];
  let row = 0;

  while (row < columnIds.length) {
    const id = columnIds[row];
    const nextId = columnIds[row + 1];
    if (
      tallEnabled &&
      canRenderTall(id) &&
      nextId === id &&
      pairInSameSegment(row)
    ) {
      blocks.push({ id, anchorRow: row, span: MAX_TALL_SPAN });
      row += MAX_TALL_SPAN;
      continue;
    }
    blocks.push({ id, anchorRow: row, span: 1 });
    row += 1;
  }

  return blocks;
}

/**
 * Find the block covering a row index.
 * @param {ColumnBlock[]} blocks
 * @param {number} row
 * @returns {ColumnBlock | null}
 */
export function blockForRow(blocks, row) {
  return blocks.find((block) => row >= block.anchorRow && row < block.anchorRow + block.span) ?? null;
}

/** @param {number} anchorRow @param {number} span @param {number} cellH @param {number | null} [visibleRows] */
export function blockCenterY(anchorRow, span, cellH, visibleRows = null) {
  const half = (span * cellH) / 2;
  let center = (anchorRow + span / 2) * cellH;

  if (visibleRows != null && visibleRows > 0) {
    const boardBottom = visibleRows * cellH;
    if (center + half > boardBottom) {
      center = boardBottom - half;
    }
    if (center - half < 0) {
      center = half;
    }
  }

  return Math.round(center * 100) / 100;
}

/**
 * Demo board — Crown and Cherry pairs in adjacent rows (same-type only).
 * Column-major: board[col][row], row 0 is top.
 * @type {string[][]}
 */
export const TALL_PREVIEW_BOARD = [
  ['CH', 'CH', 'OR', 'ST', 'GR'],
  ['LM', 'CR', 'CR', 'ST', 'CH'],
  ['OR', 'CR', 'CR', 'S7', 'LM'],
  ['GR', 'CH', 'DM', 'S7', 'OR'],
  ['ST', 'WD', 'DM', 'CH', 'GR'],
];

/** @param {string[]} column @returns {string[]} */
export function displayColumn(column) {
  return [...column];
}

/** @param {string[][]} board @returns {string[][]} */
export function displayBoard(board) {
  return board.map((col) => [...col]);
}

/** @returns {string[][]} */
export function tallPreviewBoard() {
  return TALL_PREVIEW_BOARD.map((col) => [...col]);
}

/** @param {string[][]} board @returns {number} */
export function countTallBlocks(board, { tallEnabled = true } = {}) {
  let count = 0;
  for (const column of board) {
    for (const block of parseColumnBlocks(column, { tallEnabled })) {
      if (block.span > 1) count += 1;
    }
  }
  return count;
}
