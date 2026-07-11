/**
 * Single vertical reel column — spring jiggle swimlane spin.
 */

import { Container, Graphics } from 'pixi.js';
import { defaultBoardColumn, GAME } from '../config.js';
import { TIMING } from './timing.js';
import { animateCascadeJiggle, animateReelSpin, scaledDelay, animateAlphaTargets } from './easing.js';
import { createSymbolNode, SYMBOL_DIM_ALPHA } from './symbolView.js';
import { SYMBOL_IDS } from './symbols.js';
import {
  blockCenterY,
  blockForRow,
  parseColumnBlocks,
} from '../tall-symbols.js';

function randomSymbolId() {
  return SYMBOL_IDS[Math.floor(Math.random() * SYMBOL_IDS.length)];
}

/** @param {number} value */
function snapPx(value) {
  return Math.round(value * 100) / 100;
}

/** @param {ReturnType<typeof createSymbolNode> | null | undefined} node */
function isLiveSymbolNode(node) {
  const root = node?.root;
  return !!(root && !root.destroyed);
}

/** @param {number} row @param {number} cellH */
function rowCenterY(row, cellH) {
  return snapPx((row + 0.5) * cellH);
}

/** @param {number} cellW */
function colCenterX(cellW) {
  return snapPx(cellW / 2);
}

/**
 * @param {string[]} stripIds
 * @param {object} ctx
 */
function buildStripNodes(stripIds, ctx) {
  const { cellW, cellH, spineRegistry } = ctx;
  /** @type {ReturnType<typeof createSymbolNode>[]} */
  const nodes = [];
  const strip = new Container();

  stripIds.forEach((id, index) => {
    const spineData = spineRegistry.get(id) ?? null;
    const symbol = createSymbolNode({ id, cellW, cellH, span: 1, spineData, state: 'static' });
    symbol.root.x = colCenterX(cellW);
    symbol.root.y = rowCenterY(index, cellH);
    strip.addChild(symbol.root);
    nodes.push(symbol);
  });

  return { strip, nodes };
}

/**
 * @param {import('../tall-symbols.js').ColumnBlock[]} blocks
 * @param {object} ctx
 */
function buildStripFromBlocks(blocks, ctx) {
  const { cellW, cellH, visibleRows, spineRegistry } = ctx;
  const strip = new Container();
  /** @type {(ReturnType<typeof createSymbolNode> | null)[]} */
  const symbolNodesByRow = Array.from({ length: visibleRows }, () => null);

  for (const block of blocks) {
    const spineData = spineRegistry.get(block.id) ?? null;
    const symbol = createSymbolNode({
      id: block.id,
      cellW,
      cellH,
      span: block.span,
      spineData,
      state: 'static',
    });
    symbol.anchorRow = block.anchorRow;
    symbol.root.x = colCenterX(cellW);
    symbol.root.y = blockCenterY(block.anchorRow, block.span, cellH, visibleRows);
    strip.addChild(symbol.root);
    symbolNodesByRow[block.anchorRow] = symbol;
  }

  return { strip, symbolNodesByRow };
}

/**
 * Row-indexed spin strip — sparse nodes when tall blocks merge adjacent rows.
 * @param {string[]} stripIds
 * @param {object} ctx
 * @param {boolean} tallEnabled
 */
function buildSpinStripFromRowIds(stripIds, ctx, tallEnabled) {
  if (!tallEnabled) {
    return buildStripNodes(stripIds, ctx);
  }

  const strip = new Container();
  /** @type {(ReturnType<typeof createSymbolNode> | null)[]} */
  const nodes = Array.from({ length: stripIds.length }, () => null);
  const blocks = parseColumnBlocks(stripIds, {
    tallEnabled: true,
    mergeSegments: ctx.mergeSegments,
  });

  for (const block of blocks) {
    const spineData = ctx.spineRegistry.get(block.id) ?? null;
    const symbol = createSymbolNode({
      id: block.id,
      cellW: ctx.cellW,
      cellH: ctx.cellH,
      span: block.span,
      spineData,
      state: 'static',
    });
    symbol.anchorRow = block.anchorRow;
    symbol.root.x = colCenterX(ctx.cellW);
    symbol.root.y = blockCenterY(block.anchorRow, block.span, ctx.cellH);
    strip.addChild(symbol.root);
    nodes[block.anchorRow] = symbol;
  }

  return { strip, nodes };
}

export class ReelColumn {
  /**
   * @param {object} opts
   * @param {number} opts.reelIndex
   * @param {number} opts.cellW
   * @param {number} opts.cellH
   * @param {number} opts.visibleRows
   * @param {Map<string, import('@esotericsoftware/spine-core').SkeletonData>} opts.spineRegistry
   * @param {boolean} [opts.tallEnabled]
   */
  constructor({ reelIndex, cellW, cellH, visibleRows, spineRegistry, tallEnabled = false }) {
    this.reelIndex = reelIndex;
    this.cellW = cellW;
    this.cellH = cellH;
    this.visibleRows = visibleRows;
    this.spineRegistry = spineRegistry;
    this.tallEnabled = tallEnabled;
    /** @type {import('../tall-symbols.js').ColumnBlock[] | null} */
    this.columnBlocks = null;

    this.root = new Container();

    this.maskShape = new Graphics();
    this.maskShape.rect(0, 0, cellW, cellH * visibleRows).fill(0xffffff);
    this.root.addChild(this.maskShape);

    this.window = new Container();
    this.window.mask = this.maskShape;
    this.root.addChild(this.window);

    /** @type {ReturnType<typeof createSymbolNode>[]} */
    this.symbolNodes = [];
    /** @type {string[]} */
    this.currentColumn = defaultBoardColumn();
    this.spinning = false;
    /** @type {number | null} */
    this.landPadding = null;
    /** When true, landed spin nodes must not be rebuilt or grid-snapped. */
    this.boardSealed = false;
    /** @type {(() => void) | null} */
    this.cancelSpinAnim = null;
    /** @type {(() => void) | null} */
    this.landJellyCancel = null;
    /** @type {{ strip: import('pixi.js').Container, nodes: ReturnType<typeof createSymbolNode>[], padding: number } | null} */
    this.pendingSpinFinalize = null;
    /** @type {Promise<void> | null} */
    this.landJellySettledPromise = null;
    /** @type {Promise<void> | null} */
    this.landImpactPromise = null;
    /** @type {(() => void) | null} */
    this.cascadeJellyCancel = null;
    /** @type {Promise<void> | null} */
    this.cascadeJellySettledPromise = null;
    /** Blocks async land finalize while cluster highlight/dim is running. */
    this.clusterPresentationLock = false;
    /** Resize used window scale while spin/cascade presentation was active. */
    this.layoutRescalePending = false;
  }

  /** @param {number} cellW @param {number} cellH */
  syncMaskLayout(cellW, cellH) {
    this.cellW = cellW;
    this.cellH = cellH;
    this.maskShape.clear();
    this.maskShape.rect(0, 0, cellW, cellH * this.visibleRows).fill(0xffffff);
  }

  /**
   * @param {number} prevCellW
   * @param {number} prevCellH
   * @param {number} cellW
   * @param {number} cellH
   */
  cellSizeChanged(prevCellW, prevCellH, cellW, cellH) {
    return Math.abs(cellW - prevCellW) > 0.5 || Math.abs(cellH - prevCellH) > 0.5;
  }

  /**
   * Drop spin/cascade handles so isPresenting() cannot remain stuck after a rebuild.
   */
  clearPresentationState() {
    this.cancelSpinAnim?.();
    this.landJellyCancel?.();
    this.cascadeJellyCancel?.();
    this.cancelSpinAnim = null;
    this.landJellyCancel = null;
    this.cascadeJellyCancel = null;
    this.landJellySettledPromise = null;
    this.landImpactPromise = null;
    this.cascadeJellySettledPromise = null;
    this.pendingSpinFinalize = null;
    this.spinning = false;
  }

  /**
   * @param {Set<string> | null | undefined} winCells
   * @param {boolean} [dimNonWin]
   */
  rebuildBoardAtCellSize(winCells = null, dimNonWin = false) {
    this.clearPresentationState();
    this.window.scale.set(1, 1);
    this.rebuildStrip(this.currentColumn, { winCells, dimNonWin });
    this.boardSealed = true;
    this.window.y = 0;
    this.layoutRescalePending = false;
  }

  /**
   * @param {number} cellW
   * @param {number} cellH
   * @param {{ deferFullRescale?: boolean, winCells?: Set<string> | null, dimNonWin?: boolean }} [opts]
   */
  syncLayout(cellW, cellH, { deferFullRescale = false, winCells = null, dimNonWin = false } = {}) {
    const prevCellW = this.cellW;
    const prevCellH = this.cellH;
    const sizeChanged = this.cellSizeChanged(prevCellW, prevCellH, cellW, cellH);

    if (!sizeChanged) {
      this.syncMaskLayout(cellW, cellH);
      return;
    }

    this.syncMaskLayout(cellW, cellH);

    const incompleteBoard = !this.hasLiveBoard();
    if (deferFullRescale || incompleteBoard) {
      const sx = cellW / prevCellW;
      const sy = cellH / prevCellH;
      if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001) {
        this.window.scale.set(this.window.scale.x * sx, this.window.scale.y * sy);
        this.layoutRescalePending = true;
      }
      return;
    }

    if (this.currentColumn?.length) {
      this.rebuildBoardAtCellSize(winCells, dimNonWin);
      return;
    }

    const strip = this.window.children[0];
    if (strip instanceof Container && Math.abs(strip.y) > 0.5) {
      this.compactStripToGrid();
    } else {
      this.normalizeSymbolGrid();
    }
    this.window.y = 0;
    this.layoutRescalePending = false;
  }

  /**
   * Rebuild symbols at the current cell size after a deferred resize.
   * @param {{ winCells?: Set<string> | null, dimNonWin?: boolean }} [opts]
   */
  flushLayoutRescale({ winCells = null, dimNonWin = false } = {}) {
    if (!this.layoutRescalePending) return;
    if (!this.currentColumn?.length || !this.hasLiveBoard()) {
      this.window.scale.set(1, 1);
      this.layoutRescalePending = false;
      return;
    }
    this.rebuildBoardAtCellSize(winCells, dimNonWin);
  }

  isPresenting() {
    return !!(
      this.landJellyCancel ||
      this.cascadeJellyCancel ||
      this.pendingSpinFinalize ||
      this.spinning
    );
  }

  async waitUntilIdle() {
    if (this.landJellySettledPromise) {
      await this.landJellySettledPromise;
    }
    if (this.cascadeJellySettledPromise) {
      await this.cascadeJellySettledPromise;
    }
  }

  async waitUntilLandImpact() {
    if (this.landImpactPromise) {
      await this.landImpactPromise;
    }
  }

  cancelLandJelly() {
    if (!this.boardSealed) {
      this.finalizePendingSpinLand();
    } else {
      this.pendingSpinFinalize = null;
    }
    const spinCancel = this.landJellyCancel;
    if (spinCancel) {
      this.landJellyCancel = null;
      spinCancel();
    }
    const cascadeCancel = this.cascadeJellyCancel;
    if (cascadeCancel) {
      this.cascadeJellyCancel = null;
      cascadeCancel();
    }
    this.landJellySettledPromise = null;
    this.landImpactPromise = null;
    this.cascadeJellySettledPromise = null;
  }

  finalizePendingSpinLand() {
    if (!this.pendingSpinFinalize) return;
    if (this.pendingSpinFinalize.tallTarget) {
      const target = this.pendingSpinFinalize.tallTarget;
      const { strip, nodes, padding, stripIds, mergeSegments } = this.pendingSpinFinalize;
      this.pendingSpinFinalize = null;
      if (this.boardSealed && this.hasLiveBoard()) return;
      if (strip instanceof Container && nodes && Number.isFinite(padding)) {
        this.sealTallSpinLandFromStrip(target, strip, nodes, padding, stripIds, mergeSegments);
        return;
      }
      this.finalizeTallSpinLand(target);
      return;
    }
    const { strip, nodes, padding } = this.pendingSpinFinalize;
    this.pendingSpinFinalize = null;
    if (this.boardSealed && this.hasLiveBoard()) return;
    this.finalizeSpinLand(strip, nodes, padding, { skipGridNormalize: true });
  }

  hasLiveBoard() {
    if (this.tallEnabled && this.columnBlocks?.length) {
      return this.columnBlocks.every((block) => {
        const node = this.symbolNodes[block.anchorRow];
        return isLiveSymbolNode(node) && node.root.parent != null;
      });
    }
    return (
      this.symbolNodes.length === this.visibleRows &&
      this.symbolNodes.every((node) => isLiveSymbolNode(node) && node.root.parent != null)
    );
  }

  /**
   * Symbol centre in stage-local coordinates (handles strip-local nodes during spin land).
   * @param {number} row
   * @param {import('pixi.js').Container} stageLocal
   */
  blockLayoutForRow(row) {
    const blocks = this.activeColumnBlocks();
    const block = this.tallEnabled ? blockForRow(blocks, row) : null;
    const anchorRow = block?.anchorRow ?? row;
    const span = block?.span ?? 1;
    return {
      anchorRow,
      span,
      x: colCenterX(this.cellW),
      y: block ? this.blockY(anchorRow, span) : rowCenterY(row, this.cellH),
    };
  }

  getSymbolStagePosition(row, stageLocal) {
    const blocks = this.activeColumnBlocks();
    const block = this.tallEnabled ? blockForRow(blocks, row) : null;
    const anchorRow = block?.anchorRow ?? row;
    const span = block?.span ?? 1;
    const node = this.symbolNodes[anchorRow];

    if (node?.root?.parent) {
      const global = node.root.getGlobalPosition();
      const local = stageLocal.toLocal(global);
      return { x: snapPx(local.x), y: snapPx(local.y), span: node.span ?? span };
    }

    const { x, y } = this.blockLayoutForRow(row);
    const global = this.root.toGlobal({ x, y });
    const local = stageLocal.toLocal(global);
    return { x: snapPx(local.x), y: snapPx(local.y), span };
  }

  normalizeSymbolGrid() {
    if (this.tallEnabled) {
      const blocks = this.activeColumnBlocks();
      for (const block of blocks) {
        const node = this.symbolNodes[block.anchorRow];
        if (!isLiveSymbolNode(node)) continue;
        node.root.x = colCenterX(this.cellW);
        node.root.y = this.blockY(block.anchorRow, block.span);
      }
      return;
    }

    this.symbolNodes.forEach((node, row) => {
      if (!isLiveSymbolNode(node)) return;
      node.root.x = colCenterX(this.cellW);
      node.root.y = rowCenterY(row, this.cellH);
    });
  }

  /** Drop stale symbolNodes entries whose Pixi roots were destroyed. */
  purgeDestroyedSymbolRefs() {
    this.symbolNodes.forEach((node, row) => {
      if (node && !isLiveSymbolNode(node)) {
        this.symbolNodes[row] = null;
      }
    });
  }

  /** @param {ReturnType<typeof createSymbolNode>} node */
  clearSymbolNodeRef(node) {
    for (let row = 0; row < this.symbolNodes.length; row += 1) {
      if (this.symbolNodes[row] === node) {
        this.symbolNodes[row] = null;
      }
    }
  }

  /** Keep columnBlocks aligned with nodes still on the column after a pop. */
  refreshLiveColumnBlocks() {
    if (!this.tallEnabled) return;
    const blocks = this.activeColumnBlocks();
    this.columnBlocks = blocks.filter((block) =>
      isLiveSymbolNode(this.symbolNodes[block.anchorRow]),
    );
  }

  /** World-preserving re-anchor — skipped while board is sealed (already on grid). */
  compactStripToGrid() {
    if (this.boardSealed) return;

    const strip = this.window.children[0];
    if (!(strip instanceof Container)) return;

    if (Math.abs(strip.y) < 0.5) {
      this.normalizeSymbolGrid();
      this.landPadding = null;
      return;
    }

    this.reanchorStripY();
    this.normalizeSymbolGrid();
  }

  /** Fold strip.y into symbol locals — always runs (cascade must not skip when sealed). */
  reanchorStripY() {
    const strip = this.window.children[0];
    if (!(strip instanceof Container)) return;

    const stripYBefore = strip.y;
    if (Math.abs(stripYBefore) < 0.5) {
      this.landPadding = null;
      return;
    }

    for (let row = 0; row < this.visibleRows; row += 1) {
      const node = this.symbolNodes[row];
      if (!node?.root) continue;
      node.root.y = stripYBefore + node.root.y;
    }

    strip.y = 0;
    this.landPadding = null;
  }

  /**
   * One-time world-preserving re-anchor after land — no grid snap.
   * @param {import('pixi.js').Container} strip
   */
  anchorLandedStrip(strip) {
    if (!(strip instanceof Container)) return;

    const stripYBefore = strip.y;
    if (Math.abs(stripYBefore) < 0.5) {
      this.landPadding = null;
      return;
    }

    for (let row = 0; row < this.visibleRows; row += 1) {
      const node = this.symbolNodes[row];
      if (!node?.root) continue;
      node.root.y = stripYBefore + node.root.y;
    }

    strip.y = 0;
    this.landPadding = null;
  }

  /**
   * @param {import('pixi.js').Container} strip
   * @param {ReturnType<typeof createSymbolNode>[]} nodes
   * @param {number} padding
   */
  finalizeSpinLand(strip, nodes, padding, { skipGridNormalize = false } = {}) {
    /** @type {ReturnType<typeof createSymbolNode>[]} */
    const visibleNodes = Array.from({ length: this.visibleRows }, () => null);

    for (let row = 0; row < this.visibleRows; row += 1) {
      const node = nodes[padding + row];
      if (!node?.root) continue;
      node.root.x = colCenterX(this.cellW);
      node.setState('static');
      visibleNodes[row] = node;
    }

    for (let index = 0; index < nodes.length; index += 1) {
      if (index >= padding && index < padding + this.visibleRows) continue;
      const node = nodes[index];
      if (!node?.root) continue;
      if (node.root.parent === strip) strip.removeChild(node.root);
      node.root.destroy({ children: true });
    }

    this.symbolNodes = visibleNodes;
    this.landPadding = padding;
    this.boardSealed = true;
    this.anchorLandedStrip(strip);

    const gridAligned = this.symbolNodes.every((node, row) => {
      if (!node?.root) return true;
      return Math.abs(node.root.y - rowCenterY(row, this.cellH)) < 0.45;
    });
    if (!skipGridNormalize && !gridAligned) {
      this.normalizeSymbolGrid();
    }

    if (!this.hasLiveBoard()) {
      this.boardSealed = false;
      this.rebuildStrip(this.currentColumn);
      this.boardSealed = true;
    }
  }

  /** @param {Set<string> | null | undefined} winCells */
  setStaticColumn(columnIds, { winCells = null, dimNonWin = false } = {}) {
    this.cancelLandJelly();
    this.currentColumn = [...columnIds];
    this.spinning = false;
    this.boardSealed = false;
    this.window.scale.set(1, 1);
    this.layoutRescalePending = false;
    this.rebuildStrip(columnIds, { winCells, dimNonWin });
    this.boardSealed = true;
    this.window.y = 0;
  }

  /**
   * @param {string[]} columnIds
   * @param {{ winCells?: Set<string> | null, dimNonWin?: boolean }} [opts]
   */
  rebuildStrip(columnIds, { winCells = null, dimNonWin = false } = {}) {
    const ctx = {
      cellW: this.cellW,
      cellH: this.cellH,
      visibleRows: this.visibleRows,
      spineRegistry: this.spineRegistry,
    };

    if (this.tallEnabled) {
      const blocks = parseColumnBlocks(columnIds, { tallEnabled: true });
      this.columnBlocks = blocks;
      const { strip, symbolNodesByRow } = buildStripFromBlocks(blocks, ctx);

      blocks.forEach((block) => {
        const node = symbolNodesByRow[block.anchorRow];
        if (!node) return;
        let isWin = false;
        for (let row = block.anchorRow; row < block.anchorRow + block.span; row += 1) {
          if (winCells?.has(`${this.reelIndex},${row}`)) isWin = true;
        }
        node.setDimmed(dimNonWin && !isWin);
        node.setWinHighlight(isWin);
        if (isWin) node.setState('win');
      });

      const previous = [...this.window.children];
      this.window.addChild(strip);
      for (const child of previous) {
        this.window.removeChild(child);
      }
      this.symbolNodes = symbolNodesByRow;
      return;
    }

    this.columnBlocks = null;
    const { strip, nodes } = buildStripNodes(columnIds, ctx);

    nodes.forEach((node, row) => {
      const isWin = winCells?.has(`${this.reelIndex},${row}`) ?? false;
      node.setDimmed(dimNonWin && !isWin);
      node.setWinHighlight(isWin);
      if (isWin) node.setState('win');
    });

    const previous = [...this.window.children];
    this.window.addChild(strip);
    for (const child of previous) {
      this.window.removeChild(child);
    }

    this.symbolNodes = nodes;
  }

  /**
   * Capture live row Y positions before strip rebuild so spin handoff is seamless.
   * @returns {number[]}
   */
  captureVisibleRowYs() {
    const strip = this.window.children[0];
    if (strip instanceof Container) {
      this.anchorLandedStrip(strip);
    }
    return Array.from({ length: this.visibleRows }, (_, row) => {
      if (this.tallEnabled) {
        return this.blockLayoutForRow(row).y;
      }
      const node = this.symbolNodes[row];
      return node?.root?.parent ? node.root.y : rowCenterY(row, this.cellH);
    });
  }

  finalizeTallSpinLand(targetColumn) {
    this.pendingSpinFinalize = null;
    this.currentColumn = [...targetColumn];
    this.window.removeChildren();
    this.boardSealed = false;
    this.rebuildStrip(targetColumn);
    this.boardSealed = true;
    this.landPadding = null;
  }

  /**
   * Map landed spin-strip nodes to visible-row indices (tall blocks use absolute strip anchors).
   * @param {string[]} targetColumn
   * @param {(ReturnType<typeof createSymbolNode> | null)[]} stripNodes
   * @param {number} padding
   * @param {string[]} [stripIds]
   * @param {[number, number][]} [mergeSegments]
   */
  resolveVisibleLandNodes(targetColumn, stripNodes, padding, stripIds = null, mergeSegments = null) {
    const landBlocks = parseColumnBlocks(targetColumn, { tallEnabled: true });
    const stripBlocks =
      stripIds && mergeSegments
        ? parseColumnBlocks(stripIds, { tallEnabled: true, mergeSegments })
        : [];

    /** @type {(ReturnType<typeof createSymbolNode> | null)[]} */
    const visibleNodes = Array.from({ length: this.visibleRows }, () => null);
    /** @type {Set<import('pixi.js').Container>} */
    const keepRoots = new Set();

    const findStripNode = (landBlock) => {
      let node = stripNodes[padding + landBlock.anchorRow] ?? null;
      if (isLiveSymbolNode(node)) return node;

      const absRow = padding + landBlock.anchorRow;
      const stripBlock =
        stripBlocks.find(
          (block) =>
            block.id === landBlock.id &&
            block.span === landBlock.span &&
            block.anchorRow <= absRow &&
            block.anchorRow + block.span > absRow,
        ) ?? null;
      if (stripBlock) node = stripNodes[stripBlock.anchorRow] ?? null;
      return isLiveSymbolNode(node) ? node : null;
    };

    for (const block of landBlocks) {
      const node = findStripNode(block);
      if (!node) continue;
      node.anchorRow = block.anchorRow;
      node.root.x = colCenterX(this.cellW);
      node.setState('static');
      keepRoots.add(node.root);
      visibleNodes[block.anchorRow] = node;
    }

    for (const stripBlock of stripBlocks) {
      if (stripBlock.anchorRow < padding || stripBlock.anchorRow >= padding + this.visibleRows) {
        continue;
      }
      const node = stripNodes[stripBlock.anchorRow];
      if (!isLiveSymbolNode(node) || keepRoots.has(node.root)) continue;
      const visibleAnchor = stripBlock.anchorRow - padding;
      keepRoots.add(node.root);
      if (visibleNodes[visibleAnchor]) continue;
      node.anchorRow = visibleAnchor;
      node.root.x = colCenterX(this.cellW);
      node.setState('static');
      visibleNodes[visibleAnchor] = node;
    }

    return { landBlocks, visibleNodes, keepRoots };
  }

  /**
   * Keep landed tall-block nodes from the spin strip — prune padding symbols only.
   * @param {string[]} targetColumn
   * @param {import('pixi.js').Container} strip
   * @param {(ReturnType<typeof createSymbolNode> | null)[]} stripNodes
   * @param {number} padding
   * @param {string[]} [stripIds]
   * @param {[number, number][]} [mergeSegments]
   */
  sealTallSpinLandFromStrip(targetColumn, strip, stripNodes, padding, stripIds = null, mergeSegments = null) {
    this.pendingSpinFinalize = null;
    this.currentColumn = [...targetColumn];
    const { landBlocks, visibleNodes, keepRoots } = this.resolveVisibleLandNodes(
      targetColumn,
      stripNodes,
      padding,
      stripIds,
      mergeSegments,
    );
    this.columnBlocks = landBlocks;

    for (const child of [...strip.children]) {
      if (keepRoots.has(child)) continue;
      strip.removeChild(child);
      child.destroy({ children: true });
    }

    for (let index = 0; index < stripNodes.length; index += 1) {
      if (index >= padding && index < padding + this.visibleRows) continue;
      const node = stripNodes[index];
      if (!node?.root || keepRoots.has(node.root)) continue;
      if (node.root.parent === strip) strip.removeChild(node.root);
      if (!node.root.destroyed) node.root.destroy({ children: true });
    }

    this.symbolNodes = visibleNodes;
    this.landPadding = padding;
    this.boardSealed = true;
    // Fold strip scroll into node locals first (still in absolute strip coords), then snap to grid.
    this.anchorLandedStrip(strip);
    this.normalizeSymbolGrid();
    this.window.y = 0;

    if (!this.hasLiveBoard() && keepRoots.size === 0) {
      this.finalizeTallSpinLand(targetColumn);
    }
  }

  /**
   * Point symbolNodes/columnBlocks at the landed spin-strip nodes (visible-row indexed).
   * Keeps cluster overlay + win highlight aligned while land jelly is still running.
   * @param {string[]} targetColumn
   * @param {(ReturnType<typeof createSymbolNode> | null)[]} stripNodes
   * @param {number} padding
   */
  syncTallLandNodes(targetColumn, stripNodes, padding, stripIds = null, mergeSegments = null) {
    const { landBlocks, visibleNodes } = this.resolveVisibleLandNodes(
      targetColumn,
      stripNodes,
      padding,
      stripIds,
      mergeSegments,
    );
    this.columnBlocks = landBlocks;
    this.symbolNodes = visibleNodes;
  }

  /** @returns {import('../tall-symbols.js').ColumnBlock[]} */
  activeColumnBlocks() {
    if (!this.tallEnabled) return [];
    if (this.currentColumn?.length) {
      return parseColumnBlocks(this.currentColumn, { tallEnabled: true });
    }
    return this.columnBlocks ?? [];
  }

  /** @param {number} anchorRow @param {number} span */
  blockY(anchorRow, span) {
    return blockCenterY(anchorRow, span, this.cellH, this.visibleRows);
  }

  /**
   * @param {import('../tall-symbols.js').ColumnBlock} block
   * @param {import('pixi.js').Container} strip
   * @param {ReturnType<typeof createSymbolNode> | null | undefined} existing
   * @param {{ snapY?: boolean }} [opts]
   */
  ensureSymbolNodeForBlock(block, strip, existing = null, { snapY = true } = {}) {
    if (
      existing &&
      isLiveSymbolNode(existing) &&
      existing.span === block.span
    ) {
      existing.anchorRow = block.anchorRow;
      existing.root.x = colCenterX(this.cellW);
      if (snapY) {
        existing.root.y = this.blockY(block.anchorRow, block.span);
      }
      if (existing.root.parent !== strip) strip.addChild(existing.root);
      return existing;
    }

    if (existing?.root) {
      this.clearSymbolNodeRef(existing);
      if (existing.root.parent) existing.root.parent.removeChild(existing.root);
      if (!existing.root.destroyed) existing.root.destroy({ children: true });
    }

    const spineData = this.spineRegistry.get(block.id) ?? null;
    const node = createSymbolNode({
      id: block.id,
      cellW: this.cellW,
      cellH: this.cellH,
      span: block.span,
      spineData,
      state: 'static',
    });
    node.anchorRow = block.anchorRow;
    node.root.x = colCenterX(this.cellW);
    node.root.y = this.blockY(block.anchorRow, block.span);
    strip.addChild(node.root);
    return node;
  }

  /**
   * Spring jiggle spin — damped lane physics, soft settle wobble.
   * @param {string[]} targetColumn
   * @param {{ speed?: number, winCells?: Set<string> | null }} [opts]
   */
  async spinTo(targetColumn, { speed = 1, winCells = null } = {}) {
    this.cancelSpinAnim?.();
    this.cancelLandJelly();
    this.window.scale.set(1, 1);
    this.layoutRescalePending = false;
    const preservedYs = this.captureVisibleRowYs();
    this.boardSealed = false;
    const visualTarget = [...targetColumn];
    const visualCurrent = [...this.currentColumn];
    const padding =
      TIMING.paddingBase + this.reelIndex * TIMING.paddingPerReel + Math.floor(Math.random() * 2);

    const headIds = Array.from({ length: padding }, () => randomSymbolId());
    const bridgeIds = Array.from(
      { length: Math.max(0, padding - this.visibleRows) },
      () => randomSymbolId(),
    );
    const tailIds = Array.from({ length: padding + 2 }, () => randomSymbolId());
    const stripIds = [...headIds, ...visualTarget, ...bridgeIds, ...visualCurrent, ...tailIds];

    const bridgeLen = Math.max(0, padding - this.visibleRows);
    const currentStart = padding + this.visibleRows + bridgeLen;
    /** @type {[number, number][]} */
    const mergeSegments = [
      [padding, padding + this.visibleRows - 1],
      [currentStart, currentStart + this.visibleRows - 1],
    ];

    this.window.removeChildren();
    const stripCtx = {
      cellW: this.cellW,
      cellH: this.cellH,
      spineRegistry: this.spineRegistry,
      visibleRows: this.visibleRows,
      mergeSegments,
    };
    const { strip, nodes } = buildSpinStripFromRowIds(stripIds, stripCtx, this.tallEnabled);

    nodes.forEach((node) => node?.setState('spin'));

    const targetY = -(padding * this.cellH);
    const totalScroll = padding * this.cellH;
    const stripStartY = targetY - totalScroll;
    /** @type {number[]} */
    const initialRowOffsets = [];
    const stripBlocks = this.tallEnabled
      ? parseColumnBlocks(stripIds, { tallEnabled: true, mergeSegments })
      : null;

    for (let row = 0; row < this.visibleRows; row += 1) {
      const idx = currentStart + row;
      let node = nodes[idx];
      if (!node && stripBlocks) {
        const block = blockForRow(stripBlocks, idx);
        if (block) node = nodes[block.anchorRow];
      }
      if (!node?.root) {
        initialRowOffsets.push(0);
        continue;
      }
      const baseY = node.span > 1
        ? blockCenterY(node.anchorRow, node.span, this.cellH)
        : (idx + 0.5) * this.cellH;
      node.root.y = preservedYs[row] - stripStartY;
      initialRowOffsets.push(baseY - node.root.y);
    }

    strip.y = stripStartY;
    this.window.addChild(strip);

    await scaledDelay(TIMING.reelStaggerMs * this.reelIndex, speed);

    const maxStaggerMs = TIMING.reelStaggerMs * (GAME.reels - 1);
    const staggerDelay = TIMING.reelStaggerMs * this.reelIndex;
    const spinDuration = Math.max(280, (TIMING.spinMs + maxStaggerMs - staggerDelay) / speed);

    const maxSpinDuration = TIMING.spinMs + maxStaggerMs;
    const jellyLandImpactScale = Math.min(1, spinDuration / maxSpinDuration);

    const spinAnim = animateReelSpin({
      strip,
      nodes,
      stripStartY,
      totalScroll,
      duration: spinDuration,
      cellH: this.cellH,
      visibleRows: this.visibleRows,
      maxSettleMs: TIMING.spinJiggleSettleMs / speed,
      stripStiffness: TIMING.jiggleStripStiffness,
      stripDamping: TIMING.jiggleStripDamping,
      stripMass: TIMING.jiggleStripMass,
      rowStiffness: TIMING.jiggleRowStiffness,
      rowStiffnessStep: TIMING.jiggleRowStiffnessStep,
      rowDamping: TIMING.jiggleRowDamping,
      rowDampingStep: TIMING.jiggleRowDampingStep,
      velCoupling: TIMING.jiggleVelCoupling,
      rowChainCoupling: TIMING.jiggleRowChainCoupling,
      maxRowLagPx: this.cellH * TIMING.jiggleMaxRowLagRatio,
      landWindowStartIdx: padding,
      initialRowOffsets,
      jellyStiffness: TIMING.spinJellyStiffness,
      jellyDamping: TIMING.spinJellyDamping,
      jellyMinMs: TIMING.spinJellyMinMs / speed,
      jellyLandVelFactor: TIMING.spinJellyLandVelFactor,
      jellySquashRatio: TIMING.spinJellySquashRatio,
      jellyMaxBelowRatio: TIMING.spinJellyMaxBelowRatio,
      jellyMaxAboveRatio: TIMING.spinJellyMaxAboveRatio,
      jellyTailMs: TIMING.spinJellyTailMs / speed,
      jellyChainCoupling: TIMING.spinJellyChainCoupling,
      jellyLandDelayMs: (this.reelIndex * TIMING.spinJellyLandStaggerMs) / speed,
      jellyLandImpactScale,
      blockAware: this.tallEnabled,
    });
    this.pendingSpinFinalize = this.tallEnabled
      ? { tallTarget: visualTarget, strip, nodes, padding, stripIds, mergeSegments }
      : { strip, nodes, padding };
    this.cancelSpinAnim = spinAnim.cancel ?? null;
    await spinAnim;
    if (spinAnim.settled) {
      await spinAnim.settled;
    }
    this.cancelSpinAnim = null;

    this.currentColumn = [...visualTarget];
    if (this.tallEnabled) {
      if (strip instanceof Container) {
        this.sealTallSpinLandFromStrip(
          visualTarget,
          strip,
          nodes,
          padding,
          stripIds,
          mergeSegments,
        );
      } else {
        this.finalizeTallSpinLand(visualTarget);
      }
      this.landJellyCancel = null;
      this.landJellySettledPromise = spinAnim.settled ?? null;
      this.landImpactPromise = spinAnim.impactApplied ?? null;
    } else {
      this.symbolNodes = Array.from(
        { length: this.visibleRows },
        (_, row) => nodes[padding + row] ?? null,
      );
      this.landJellyCancel = null;
      this.landJellySettledPromise = spinAnim.settled ?? null;
      this.landImpactPromise = spinAnim.impactApplied ?? null;
      this.finalizePendingSpinLand();
    }
  }

  /**
   * @param {Set<string>} winCells
   * @param {boolean} [dimNonWin]
   */
  applyWinState(winCells, dimNonWin = false) {
    this.applyWinStateImmediate(winCells, dimNonWin);
  }

  /**
   * @param {Set<string>} winCells
   * @param {boolean} [dimNonWin]
   */
  applyWinStateImmediate(winCells, dimNonWin = false) {
    const blocks = this.tallEnabled ? this.activeColumnBlocks() : null;
    if (this.tallEnabled && blocks.length) {
      for (const block of blocks) {
        const node = this.symbolNodes[block.anchorRow];
        if (!node) continue;
        let isWin = false;
        for (let row = block.anchorRow; row < block.anchorRow + block.span; row += 1) {
          if (winCells.has(`${this.reelIndex},${row}`)) isWin = true;
        }
        node.setDimmed(dimNonWin && !isWin);
        node.setWinHighlight(isWin);
        if (isWin) node.setState('win');
        else node.setState('static');
      }
      return;
    }

    this.symbolNodes.forEach((node, row) => {
      if (!node) return;
      const isWin = winCells.has(`${this.reelIndex},${row}`);
      node.setDimmed(dimNonWin && !isWin);
      node.setWinHighlight(isWin);
      if (isWin) node.setState('win');
      else node.setState('static');
    });
  }

  /**
   * Fade non-winning symbols darker; winning cells highlight immediately.
   * @param {Set<string>} winCells
   * @param {{ durationMs?: number }} [opts]
   */
  async animateWinDim(winCells, { durationMs = 300 } = {}) {
    /** @type {{ object: import('pixi.js').Container, from: number, to: number }[]} */
    const alphaTargets = [];
    const blocks = this.tallEnabled ? this.activeColumnBlocks() : null;

    if (this.tallEnabled && blocks?.length) {
      for (const block of blocks) {
        const node = this.symbolNodes[block.anchorRow];
        if (!node) continue;
        let isWin = false;
        for (let row = block.anchorRow; row < block.anchorRow + block.span; row += 1) {
          if (winCells.has(`${this.reelIndex},${row}`)) isWin = true;
        }
        if (isWin) {
          node.setDimmed(false);
          node.setWinHighlight(true);
          node.setState('win');
        } else {
          alphaTargets.push({ object: node.root, from: node.root.alpha, to: SYMBOL_DIM_ALPHA });
        }
      }
      await animateAlphaTargets(alphaTargets, { durationMs });
      return;
    }

    this.symbolNodes.forEach((node, row) => {
      if (!node) return;
      const isWin = winCells.has(`${this.reelIndex},${row}`);
      if (isWin) {
        node.setDimmed(false);
        node.setWinHighlight(true);
        node.setState('win');
      } else {
        alphaTargets.push({ object: node.root, from: node.root.alpha, to: SYMBOL_DIM_ALPHA });
      }
    });
    await animateAlphaTargets(alphaTargets, { durationMs });
  }

  /**
   * Restore brightness on dimmed symbols before the win pop.
   * @param {{ durationMs?: number }} [opts]
   */
  async animateUndim({ durationMs = 240 } = {}) {
    /** @type {{ object: import('pixi.js').Container, from: number, to: number }[]} */
    const alphaTargets = [];
    this.symbolNodes.forEach((node) => {
      if (!node?.root || node.root.alpha >= 0.99) return;
      alphaTargets.push({ object: node.root, from: node.root.alpha, to: 1 });
    });
    await animateAlphaTargets(alphaTargets, { durationMs });
  }

  clearWinState() {
    this.symbolNodes.forEach((node) => {
      if (!node) return;
      node.setDimmed(false);
      node.setWinHighlight(false);
      node.setState('static');
      node.root.alpha = 1;
      node.root.scale.set(1);
    });
  }

  /**
   * @param {number[]} rows
   * @param {{ speed?: number }} [opts]
   */
  async popWinRows(rows, { speed = 1 } = {}) {
    this.cancelLandJelly();
    /** @type {Set<number>} */
    const anchorRows = new Set();

    for (const row of rows) {
      const blocks = this.tallEnabled ? this.activeColumnBlocks() : null;
      if (blocks?.length) {
        const block = blockForRow(blocks, row);
        if (block) {
          anchorRows.add(block.anchorRow);
          continue;
        }
      }
      anchorRows.add(row);
    }

    const targets = [...anchorRows]
      .map((row) => ({ row, node: this.symbolNodes[row] }))
      .filter((entry) => entry.node);

    if (!targets.length) return;

    await Promise.all(
      targets.map(
        ({ node }) =>
          new Promise((resolve) => {
            const root = node.root;
            const startScale = root.scale.x;
            const startAlpha = root.alpha;
            const duration = Math.max(80, TIMING.cascadePopMs / speed);
            const start = performance.now();
            const step = (now) => {
              const t = Math.min(1, (now - start) / duration);
              const eased = 1 - (1 - t) ** 2;
              root.alpha = startAlpha * (1 - eased);
              root.scale.set(startScale * (1 - eased * 0.35));
              if (t < 1) requestAnimationFrame(step);
              else resolve();
            };
            requestAnimationFrame(step);
          }),
      ),
    );

    for (const anchorRow of anchorRows) {
      const blocks = this.activeColumnBlocks();
      const block = blocks.length
        ? blockForRow(blocks, anchorRow) ?? { anchorRow, span: 1 }
        : { anchorRow, span: 1 };
      for (let row = block.anchorRow; row < block.anchorRow + block.span; row += 1) {
        const node = this.symbolNodes[row];
        if (node?.root?.parent) node.root.parent.removeChild(node.root);
        this.symbolNodes[row] = null;
      }
    }

    if (this.symbolNodes.some((node) => isLiveSymbolNode(node))) {
      this.boardSealed = this.hasLiveBoard();
    } else {
      this.boardSealed = false;
    }
    this.refreshLiveColumnBlocks();
  }

  /**
   * Live block nodes still on the column after a cluster pop.
   * @returns {{ block: import('../tall-symbols.js').ColumnBlock, node: ReturnType<typeof createSymbolNode>, oldAnchor: number }[]}
   */
  collectBlockSurvivors() {
    const blocks =
      this.columnBlocks ?? parseColumnBlocks(this.currentColumn, { tallEnabled: true });
    /** @type {{ block: import('../tall-symbols.js').ColumnBlock, node: ReturnType<typeof createSymbolNode>, oldAnchor: number }[]} */
    const survivors = [];
    for (const block of blocks) {
      const node = this.symbolNodes[block.anchorRow];
      if (!isLiveSymbolNode(node)) continue;
      survivors.push({ block, node, oldAnchor: block.anchorRow });
    }
    return survivors;
  }

  /**
   * Stack survivors bottom-up into the next block layout (matches row tumble gravity).
   * @param {import('../tall-symbols.js').ColumnBlock[]} nextBlocks
   * @param {{ block: import('../tall-symbols.js').ColumnBlock, node: ReturnType<typeof createSymbolNode>, oldAnchor: number }[]} survivors
   */
  matchBlockAssignments(nextBlocks, survivors) {
    const sorted = [...survivors].sort((a, b) => a.oldAnchor - b.oldAnchor);
    const gap = Math.max(0, nextBlocks.length - sorted.length);

    return nextBlocks.map((nextBlock, index) => {
      const survIndex = index - gap;
      if (survIndex < 0 || survIndex >= sorted.length) {
        return { nextBlock, node: null };
      }
      const surv = sorted[survIndex];
      if (surv.block.id !== nextBlock.id || surv.block.span !== nextBlock.span) {
        return { nextBlock, node: null };
      }
      return { nextBlock, node: surv.node };
    });
  }

  /**
   * Block-based tumble — survivors slide, only new blocks drop in.
   * @param {string[]} nextColumn
   * @param {{ removedRows?: number[], fills?: { row: number, symbol: string }[], speed?: number }} [opts]
   */
  async tumbleBlocksTo(nextColumn, { removedRows = [], fills = [], speed = 1 } = {}) {
    this.cancelLandJelly();
    this.spinning = true;
    const visualNext = [...nextColumn];

    try {
      this.purgeDestroyedSymbolRefs();
      this.reanchorStripY();
      this.normalizeSymbolGrid();

      const nextBlocks = parseColumnBlocks(visualNext, { tallEnabled: true });
      const survivors = this.collectBlockSurvivors();
      const assignments = this.matchBlockAssignments(nextBlocks, survivors);

      let strip = this.window.children[0];
      if (!(strip instanceof Container)) {
        strip = new Container();
        this.window.addChild(strip);
      }

      /** @type {{ node: ReturnType<typeof createSymbolNode>, startY: number, targetY: number, fallMs: number, delayMs?: number }[]} */
      const cascadeEntries = [];
      /** @type {ReturnType<typeof createSymbolNode>[]} */
      const assignedNodes = [];

      for (const { nextBlock, node: existing } of assignments) {
        const targetY = this.blockY(nextBlock.anchorRow, nextBlock.span);
        let node = existing;

        if (node && !isLiveSymbolNode(node)) {
          this.clearSymbolNodeRef(node);
          node = null;
        }

        if (node && node.span !== nextBlock.span) {
          this.clearSymbolNodeRef(node);
          if (node.root.parent) node.root.parent.removeChild(node.root);
          if (!node.root.destroyed) node.root.destroy({ children: true });
          node = null;
        }

        if (node) {
          const startY = node.root.y;
          node = this.ensureSymbolNodeForBlock(nextBlock, strip, node, { snapY: false });
          node.setDimmed(false);
          node.setWinHighlight(false);
          node.setState('static');
          node.root.alpha = 1;
          node.root.scale.set(1);

          if (Math.abs(startY - targetY) > 0.5) {
            cascadeEntries.push({
              node,
              startY,
              targetY,
              fallMs: TIMING.tumbleGravityMs,
              delayMs: 0,
            });
          } else {
            node.root.y = targetY;
          }
          assignedNodes.push(node);
          continue;
        }

        node = this.ensureSymbolNodeForBlock(nextBlock, strip, null);

        const fillIndex = fills.findIndex(
          (fill) =>
            fill.row >= nextBlock.anchorRow &&
            fill.row < nextBlock.anchorRow + nextBlock.span,
        );
        const stackHeight = Math.max(1, fills.length - Math.max(0, fillIndex));
        const startY = targetY - this.cellH * stackHeight;
        node.root.y = startY;

        cascadeEntries.push({
          node,
          startY,
          targetY,
          fallMs: TIMING.tumbleDropMs,
          delayMs: nextBlock.anchorRow * TIMING.tumbleFillStaggerMs,
        });
        assignedNodes.push(node);
      }

      for (const child of [...strip.children]) {
        if (!assignedNodes.some((node) => node.root === child)) {
          for (let row = 0; row < this.symbolNodes.length; row += 1) {
            if (this.symbolNodes[row]?.root === child) {
              this.symbolNodes[row] = null;
            }
          }
          strip.removeChild(child);
          child.destroy({ children: true });
        }
      }

      if (cascadeEntries.length) {
        const cascadeAnim = animateCascadeJiggle(cascadeEntries, {
          cellH: this.cellH,
          fallMs: TIMING.tumbleDropMs,
          maxSettleMs: TIMING.cascadeJiggleSettleMs,
          jellyStiffness: TIMING.spinJellyStiffness,
          jellyDamping: TIMING.spinJellyDamping,
          jellyMinMs: TIMING.spinJellyMinMs,
          jellyLandVelFactor: TIMING.spinJellyLandVelFactor,
          jellyMaxBelowRatio: TIMING.spinJellyMaxBelowRatio,
          jellyMaxAboveRatio: TIMING.spinJellyMaxAboveRatio,
          jellyTailMs: TIMING.spinJellyTailMs,
          jellyChainCoupling: TIMING.spinJellyChainCoupling,
          chainReleaseMs: TIMING.cascadeChainReleaseMs,
          speed,
        });
        this.cascadeJellyCancel = cascadeAnim.cancel ?? null;
        await cascadeAnim;
        this.cascadeJellyCancel = null;
        this.cascadeJellySettledPromise = cascadeAnim.settled ?? Promise.resolve();
        await this.cascadeJellySettledPromise;
        this.cascadeJellySettledPromise = null;
      }

      /** @type {(ReturnType<typeof createSymbolNode> | null)[]} */
      const nextNodes = Array.from({ length: this.visibleRows }, () => null);
      for (const node of assignedNodes) {
        if (!isLiveSymbolNode(node)) continue;
        nextNodes[node.anchorRow] = node;
      }

      this.symbolNodes = nextNodes;
      this.columnBlocks = nextBlocks;
      this.currentColumn = visualNext;
      this.normalizeSymbolGrid();
      this.boardSealed = true;

      if (!this.hasLiveBoard()) {
        this.boardSealed = false;
        this.rebuildStrip(visualNext);
        this.boardSealed = true;
      }
    } catch (err) {
      console.error('tumbleBlocksTo failed — rebuilding column', err);
      this.boardSealed = false;
      this.rebuildStrip(visualNext);
      this.boardSealed = true;
    } finally {
      this.spinning = false;
      this.cascadeJellyCancel = null;
      this.cascadeJellySettledPromise = null;
    }
  }

  /**
   * Gravity tumble — survivors fall, new symbols drop into empty top cells.
   * Reuses live symbol nodes; no full-column rebuild.
   * @param {string[]} nextColumn
   * @param {{ removedRows?: number[], fills?: { row: number, symbol: string }[], speed?: number, staggerMs?: number }} [opts]
   */
  async tumbleTo(nextColumn, { removedRows = [], fills = [], speed = 1 } = {}) {
    if (this.tallEnabled) {
      return this.tumbleBlocksTo(nextColumn, { removedRows, fills, speed });
    }

    this.cancelLandJelly();
    this.spinning = true;
    this.reanchorStripY();
    this.normalizeSymbolGrid();
    let strip = this.window.children[0];
    const removed = new Set(removedRows);
    const prev = [...this.currentColumn];
    const colFills = [...fills].sort((a, b) => a.row - b.row);

    /** @type {{ symbol: string, oldRow: number, newRow: number, node: ReturnType<typeof createSymbolNode> | null }[]} */
    const survivors = [];
    for (let row = 0; row < this.visibleRows; row += 1) {
      if (removed.has(row)) continue;
      survivors.push({
        symbol: prev[row],
        oldRow: row,
        newRow: row,
        node: this.symbolNodes[row],
      });
    }

    const gap = this.visibleRows - survivors.length;
    survivors.forEach((entry, index) => {
      entry.newRow = gap + index;
    });

    strip = this.window.children[0];
    if (!(strip instanceof Container)) {
      this.rebuildStrip(prev);
      strip = this.window.children[0];
    }

    const rowCenterYLocal = (row) => rowCenterY(row, this.cellH);
    /** @type {{ node: ReturnType<typeof createSymbolNode>, targetY: number, delayMs?: number }[]} */
    const cascadeEntries = [];

    for (const entry of survivors) {
      if (!entry.node) {
        const spineData = this.spineRegistry.get(entry.symbol) ?? null;
        entry.node = createSymbolNode({
          id: entry.symbol,
          cellW: this.cellW,
          cellH: this.cellH,
          span: 1,
          spineData,
          state: 'static',
        });
        entry.node.root.x = colCenterX(this.cellW);
        strip.addChild(entry.node.root);
      }

      entry.node.setDimmed(false);
      entry.node.setWinHighlight(false);
      entry.node.setState('static');
      entry.node.root.alpha = 1;
      entry.node.root.scale.set(1);
      entry.node.root.x = colCenterX(this.cellW);

      if (entry.oldRow === entry.newRow) continue;

      cascadeEntries.push({
        node: entry.node,
        startY: entry.node.root.y,
        targetY: rowCenterYLocal(entry.newRow),
        fallMs: TIMING.tumbleGravityMs,
        delayMs: 0,
      });
    }

    /** @type {(ReturnType<typeof createSymbolNode> | null)[]} */
    const nextNodes = Array.from({ length: this.visibleRows }, () => null);

    for (const entry of survivors) {
      nextNodes[entry.newRow] = entry.node;
    }

    colFills.forEach((fill, index) => {
      const spineData = this.spineRegistry.get(fill.symbol) ?? null;
      const node = createSymbolNode({
        id: fill.symbol,
        cellW: this.cellW,
        cellH: this.cellH,
        span: 1,
        spineData,
        state: 'static',
      });
      node.root.x = colCenterX(this.cellW);
      const endY = rowCenterYLocal(fill.row);
      const stackHeight = colFills.length - index;
      const startY = endY - this.cellH * stackHeight;
      node.root.y = startY;
      strip.addChild(node.root);
      nextNodes[fill.row] = node;

      cascadeEntries.push({
        node,
        startY,
        targetY: endY,
        fallMs: TIMING.tumbleDropMs,
        delayMs: fill.row * TIMING.tumbleFillStaggerMs,
      });
    });

    if (cascadeEntries.length) {
      const cascadeAnim = animateCascadeJiggle(cascadeEntries, {
        cellH: this.cellH,
        fallMs: TIMING.tumbleDropMs,
        maxSettleMs: TIMING.cascadeJiggleSettleMs,
        jellyStiffness: TIMING.spinJellyStiffness,
        jellyDamping: TIMING.spinJellyDamping,
        jellyMinMs: TIMING.spinJellyMinMs,
        jellyLandVelFactor: TIMING.spinJellyLandVelFactor,
        jellyMaxBelowRatio: TIMING.spinJellyMaxBelowRatio,
        jellyMaxAboveRatio: TIMING.spinJellyMaxAboveRatio,
        jellyTailMs: TIMING.spinJellyTailMs,
        jellyChainCoupling: TIMING.spinJellyChainCoupling,
        chainReleaseMs: TIMING.cascadeChainReleaseMs,
        speed,
      });
      this.cascadeJellyCancel = cascadeAnim.cancel ?? null;
      await cascadeAnim;
      this.cascadeJellyCancel = null;
      this.cascadeJellySettledPromise = cascadeAnim.settled ?? Promise.resolve();
      this.cascadeJellySettledPromise.finally(() => {
        this.cascadeJellySettledPromise = null;
        this.reanchorStripY();
        this.normalizeSymbolGrid();
      });
    }

    this.symbolNodes = nextNodes;
    if (!this.cascadeJellySettledPromise) {
      this.reanchorStripY();
      this.normalizeSymbolGrid();
    }
    this.currentColumn = [...nextColumn];
    this.boardSealed = true;
    this.spinning = false;
  }
}
