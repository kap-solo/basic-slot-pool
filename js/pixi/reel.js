/**
 * Single vertical reel column — spring jiggle swimlane spin.
 */

import { Container, Graphics } from 'pixi.js';
import { defaultBoardColumn, GAME } from '../config.js';
import { TIMING } from './timing.js';
import { animateCascadeJiggle, animateReelSpin, scaledDelay } from './easing.js';
import { createSymbolNode } from './symbolView.js';
import { SYMBOL_IDS } from './symbols.js';

function randomSymbolId() {
  return SYMBOL_IDS[Math.floor(Math.random() * SYMBOL_IDS.length)];
}

/** @param {number} value */
function snapPx(value) {
  return Math.round(value * 100) / 100;
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
    const symbol = createSymbolNode({ id, cellSize: cellH, spineData, state: 'static' });
    symbol.root.x = colCenterX(cellW);
    symbol.root.y = rowCenterY(index, cellH);
    strip.addChild(symbol.root);
    nodes.push(symbol);
  });

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
   */
  constructor({ reelIndex, cellW, cellH, visibleRows, spineRegistry }) {
    this.reelIndex = reelIndex;
    this.cellW = cellW;
    this.cellH = cellH;
    this.visibleRows = visibleRows;
    this.spineRegistry = spineRegistry;

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
    this.finalizePendingSpinLand();
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
    this.landImpactPromise = null;
    this.cascadeJellySettledPromise = null;
  }

  finalizePendingSpinLand() {
    if (!this.pendingSpinFinalize) return;
    const { strip, nodes, padding } = this.pendingSpinFinalize;
    this.pendingSpinFinalize = null;
    this.finalizeSpinLand(strip, nodes, padding, { skipGridNormalize: true });
  }

  hasLiveBoard() {
    return (
      this.symbolNodes.length === this.visibleRows &&
      this.symbolNodes.every((node) => node?.root?.parent != null)
    );
  }

  /**
   * Symbol centre in stage-local coordinates (handles strip-local nodes during spin land).
   * @param {number} row
   * @param {import('pixi.js').Container} stageLocal
   */
  getSymbolStagePosition(row, stageLocal) {
    const node = this.symbolNodes[row];
    if (!node?.root?.parent) {
      return {
        x: snapPx(this.root.x + colCenterX(this.cellW)),
        y: snapPx(this.root.y + rowCenterY(row, this.cellH)),
      };
    }
    const global = node.root.getGlobalPosition();
    const local = stageLocal.toLocal(global);
    return { x: snapPx(local.x), y: snapPx(local.y) };
  }

  scaleLiveBoard(prevCellW, prevCellH, cellW, cellH) {
    if (prevCellW <= 0 || prevCellH <= 0) return;
    const sx = cellW / prevCellW;
    const sy = cellH / prevCellH;
    if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return;

    this.symbolNodes.forEach((node) => {
      if (!node) return;
      node.root.x = (node.root.x - prevCellW / 2) * sx + colCenterX(cellW);
      node.root.y *= sy;
    });
  }

  normalizeSymbolGrid() {
    this.symbolNodes.forEach((node, row) => {
      if (!node) return;
      node.root.x = colCenterX(this.cellW);
      node.root.y = rowCenterY(row, this.cellH);
    });
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
    this.currentColumn = [...columnIds];
    this.spinning = false;
    this.boardSealed = false;
    this.rebuildStrip(columnIds, { winCells, dimNonWin });
    this.boardSealed = true;
    this.window.y = 0;
  }

  /**
   * @param {string[]} columnIds
   * @param {{ winCells?: Set<string> | null, dimNonWin?: boolean }} [opts]
   */
  rebuildStrip(columnIds, { winCells = null, dimNonWin = false } = {}) {
    const { strip, nodes } = buildStripNodes(columnIds, {
      cellW: this.cellW,
      cellH: this.cellH,
      spineRegistry: this.spineRegistry,
    });

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

  /** @param {number} cellW @param {number} cellH */
  syncLayout(cellW, cellH) {
    const prevCellW = this.cellW;
    const prevCellH = this.cellH;
    this.cellW = cellW;
    this.cellH = cellH;
    this.maskShape.clear();
    this.maskShape.rect(0, 0, cellW, cellH * this.visibleRows).fill(0xffffff);

    if (this.boardSealed && this.hasLiveBoard()) {
      this.scaleLiveBoard(prevCellW, prevCellH, cellW, cellH);
      this.window.y = 0;
      return;
    }

    if (!this.hasLiveBoard()) {
      this.rebuildStrip(this.currentColumn);
      this.boardSealed = true;
      return;
    }

    const strip = this.window.children[0];
    if (strip instanceof Container && Math.abs(strip.y) > 0.5) {
      this.compactStripToGrid();
    } else {
      this.normalizeSymbolGrid();
    }
    this.window.y = 0;
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
      const node = this.symbolNodes[row];
      return node?.root?.parent ? node.root.y : rowCenterY(row, this.cellH);
    });
  }

  /**
   * Spring jiggle spin — damped lane physics, soft settle wobble.
   * @param {string[]} targetColumn
   * @param {{ speed?: number, winCells?: Set<string> | null }} [opts]
   */
  async spinTo(targetColumn, { speed = 1, winCells = null } = {}) {
    this.cancelSpinAnim?.();
    this.cancelLandJelly();
    const preservedYs = this.captureVisibleRowYs();
    this.boardSealed = false;
    const currentColumn = [...this.currentColumn];
    const padding =
      TIMING.paddingBase + this.reelIndex * TIMING.paddingPerReel + Math.floor(Math.random() * 2);

    const headIds = Array.from({ length: padding }, () => randomSymbolId());
    const bridgeIds = Array.from(
      { length: Math.max(0, padding - this.visibleRows) },
      () => randomSymbolId(),
    );
    const tailIds = Array.from({ length: padding + 2 }, () => randomSymbolId());
    const stripIds = [...headIds, ...targetColumn, ...bridgeIds, ...currentColumn, ...tailIds];

    this.window.removeChildren();
    const { strip, nodes } = buildStripNodes(stripIds, {
      cellW: this.cellW,
      cellH: this.cellH,
      spineRegistry: this.spineRegistry,
    });

    nodes.forEach((node) => node.setState('spin'));

    const targetY = -(padding * this.cellH);
    const totalScroll = padding * this.cellH;
    const stripStartY = targetY - totalScroll;
    const bridgeLen = Math.max(0, padding - this.visibleRows);
    const currentStart = padding + this.visibleRows + bridgeLen;
    /** @type {number[]} */
    const initialRowOffsets = [];

    for (let row = 0; row < this.visibleRows; row += 1) {
      const idx = currentStart + row;
      const node = nodes[idx];
      const baseY = (idx + 0.5) * this.cellH;
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
    });
    this.pendingSpinFinalize = { strip, nodes, padding };
    this.cancelSpinAnim = spinAnim.cancel ?? null;
    await spinAnim;
    this.cancelSpinAnim = null;

    this.currentColumn = [...targetColumn];
    this.symbolNodes = Array.from(
      { length: this.visibleRows },
      (_, row) => nodes[padding + row] ?? null,
    );

    this.landJellyCancel = spinAnim.cancel ?? null;
    this.landJellySettledPromise = spinAnim.settled ?? Promise.resolve();
    this.landImpactPromise = spinAnim.impactApplied ?? Promise.resolve();
    this.landJellySettledPromise.finally(() => {
      if (this.landJellyCancel === spinAnim.cancel) {
        this.landJellyCancel = null;
      }
      this.landJellySettledPromise = null;
      this.landImpactPromise = null;
      this.finalizePendingSpinLand();
    });
  }

  /**
   * @param {Set<string>} winCells
   * @param {boolean} [dimNonWin]
   */
  applyWinState(winCells, dimNonWin = false) {
    this.symbolNodes.forEach((node, row) => {
      if (!node) return;
      const isWin = winCells.has(`${this.reelIndex},${row}`);
      node.setDimmed(dimNonWin && !isWin);
      node.setWinHighlight(isWin);
      if (isWin) node.setState('win');
      else node.setState('static');
    });
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
    const targets = rows
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

    for (const { row, node } of targets) {
      if (node.root.parent) node.root.parent.removeChild(node.root);
      this.symbolNodes[row] = null;
    }

    if (this.symbolNodes.some(Boolean)) {
      this.boardSealed = true;
    } else {
      this.boardSealed = false;
    }
  }

  /**
   * Gravity tumble — survivors fall, new symbols drop into empty top cells.
   * Reuses live symbol nodes; no full-column rebuild.
   * @param {string[]} nextColumn
   * @param {{ removedRows?: number[], fills?: { row: number, symbol: string }[], speed?: number, staggerMs?: number }} [opts]
   */
  async tumbleTo(nextColumn, { removedRows = [], fills = [], speed = 1 } = {}) {
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
          cellSize: this.cellH,
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
        cellSize: this.cellH,
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
