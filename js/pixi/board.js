/**
 * Pixi slot stage — cabinet frame, reel columns, cluster highlight overlay.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { GAME, defaultBoardColumn } from '../config.js';
import {
  blockForRow,
  displayBoard,
  isTallSymbolPreview,
} from '../tall-symbols.js';
import { ReelColumn } from './reel.js';
import { createCascadeLadder } from './cascadeLadder.js';
import { MAX_CASCADE_LADDER } from '../cluster.js';
import { loadSpineSymbolRegistry } from './spineAssets.js';
import { scaledDelay, animateAlphaTargets } from './easing.js';
import { TIMING } from './timing.js';
import { playWinPopups } from './winPopup.js';
import { SYMBOL_DIM_ALPHA } from './symbolView.js';

/** @param {number} value */
function snapPx(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {HTMLElement} hostEl
 */
export async function createPixiSlotBoard(hostEl) {
  const spineRegistry = await loadSpineSymbolRegistry();

  const app = new Application();
  await app.init({
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  hostEl.replaceChildren(app.canvas);
  app.canvas.style.display = 'block';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';

  const stage = new Container();
  app.stage.addChild(stage);

  const frame = new Graphics();
  const clusterOverlay = new Graphics();
  const winPopupLayer = new Container();
  const reelsRoot = new Container();
  const cascadeLadder = createCascadeLadder({ maxSteps: MAX_CASCADE_LADDER });

  stage.addChild(frame);
  stage.addChild(reelsRoot);
  stage.addChild(cascadeLadder.root);
  stage.addChild(clusterOverlay);
  stage.addChild(winPopupLayer);

  const tallEnabled = isTallSymbolPreview();

  /** @type {ReelColumn[]} */
  const reels = [];
  for (let i = 0; i < GAME.reels; i += 1) {
    const reel = new ReelColumn({
      reelIndex: i,
      cellW: 80,
      cellH: 80,
      visibleRows: GAME.rows,
      spineRegistry,
      tallEnabled,
    });
    reels.push(reel);
    reelsRoot.addChild(reel.root);
  }

  let layout = { cellW: 80, cellH: 80, boardW: 240, boardH: 240, ladderBand: 28 };
  let layoutW = 0;
  let layoutH = 0;

  const FRAME_PAD_TOP = 10;
  const FRAME_PAD_BOTTOM = 10;
  const VIEW_MARGIN = 0.92;

  /** Ladder row height scales with cell size — must be reserved before fitting the grid. */
  function ladderBandForBoardH(boardH) {
    return Math.max(24, Math.round((boardH / GAME.rows) * 0.42));
  }

  /** Total painted cabinet height: ladder band + frame padding + reel grid. */
  function totalVisualHeight(boardH) {
    return boardH + FRAME_PAD_TOP + FRAME_PAD_BOTTOM + ladderBandForBoardH(boardH);
  }

  function snapBoardDimensions(boardW, boardH) {
    const cellW = snapPx(boardW / GAME.reels);
    const cellH = snapPx(boardH / GAME.rows);
    return {
      cellW,
      cellH,
      boardW: snapPx(cellW * GAME.reels),
      boardH: snapPx(cellH * GAME.rows),
      ladderBand: Math.max(24, Math.round(cellH * 0.42)),
    };
  }

  function getBoard() {
    return reels.map((reel) => [...reel.currentColumn]);
  }

  function drawFrame() {
    const { boardW, boardH, cellW, cellH, ladderBand } = layout;
    const padX = FRAME_PAD_TOP;
    const padBottom = FRAME_PAD_BOTTOM;
    const outerW = boardW + padX * 2;
    const outerH = boardH + padBottom + padX + ladderBand;
    const outerTop = -boardH / 2 - padX - ladderBand;

    frame.clear();
    frame.roundRect(-outerW / 2, outerTop, outerW, outerH, 16);
    frame.fill({ color: 0x0a0e16, alpha: 0.95 });
    frame.stroke({ color: 0x3d4f6f, width: 3, alpha: 0.9 });

    frame.roundRect(-boardW / 2, -boardH / 2, boardW, boardH, 10);
    frame.stroke({ color: 0x1a2438, width: 2, alpha: 0.85 });

    for (let i = 1; i < GAME.reels; i += 1) {
      const x = -boardW / 2 + i * cellW;
      frame.moveTo(x, -boardH / 2 + 4);
      frame.lineTo(x, boardH / 2 - 4);
      frame.stroke({ color: 0x1f2a3d, width: 1, alpha: 0.65 });
    }

    for (let row = 1; row < GAME.rows; row += 1) {
      const y = -boardH / 2 + row * cellH;
      frame.moveTo(-boardW / 2 + 4, y);
      frame.lineTo(boardW / 2 - 4, y);
      frame.stroke({ color: 0x1f2a3d, width: 1, alpha: 0.45 });
    }
  }

  /** @param {Set<string> | null | undefined} winCells */
  let clusterOverlayCells = null;

  /**
   * @param {Set<string>} winCells
   * @returns {{ reel: ReelColumn, node: ReturnType<import('./symbolView.js').createSymbolNode>, anchorRow: number, span: number }[]}
   */
  function collectOverlayTargets(winCells) {
    /** @type {{ reel: ReelColumn, node: ReturnType<import('./symbolView.js').createSymbolNode>, anchorRow: number, span: number }[]} */
    const targets = [];
    const seen = new Set();

    for (const key of winCells) {
      const [colRaw, rowRaw] = key.split(',');
      const col = Number(colRaw);
      const row = Number(rowRaw);
      if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

      const reel = reels[col];
      if (!reel) continue;

      const blocks = reel.tallEnabled ? reel.activeColumnBlocks() : null;
      const block = blocks?.length ? blockForRow(blocks, row) : null;
      const anchorRow = block?.anchorRow ?? row;
      const span = block?.span ?? 1;
      const dedupeKey = `${col},${anchorRow},${span}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const node = reel.symbolNodes[anchorRow];
      if (!node?.root?.parent) continue;

      targets.push({ reel, node, anchorRow, span });
    }

    return targets;
  }

  function clusterPopupAnchor(winCells) {
    const targets = collectOverlayTargets(winCells);
    if (!targets.length) return { x: 0, y: 0 };

    let sumX = 0;
    let sumY = 0;
    for (const { reel, anchorRow } of targets) {
      const pos = reel.getSymbolStagePosition(anchorRow, stage);
      sumX += pos.x;
      sumY += pos.y;
    }

    return {
      x: sumX / targets.length,
      y: sumY / targets.length - layout.cellH * 0.42,
    };
  }

  /**
   * Spread popup anchors so simultaneous labels do not overlap.
   * @param {{ winCells: Set<string>, winPopup: import('./winPopup.js').WinPopupContent | null }[]} presentations
   */
  function layoutClusterPopupPlacements(presentations) {
    const withAnchors = presentations
      .filter((entry) => entry.winPopup)
      .map((entry) => ({
        content: entry.winPopup,
        anchor: clusterPopupAnchor(entry.winCells),
      }));

    if (withAnchors.length <= 1) {
      return withAnchors.map((entry) => ({
        content: entry.content,
        x: entry.anchor.x,
        y: entry.anchor.y,
      }));
    }

    const minGap = layout.cellW * 2.35;
    withAnchors.sort((a, b) => a.anchor.x - b.anchor.x);

    for (let index = 1; index < withAnchors.length; index += 1) {
      const prev = withAnchors[index - 1];
      const curr = withAnchors[index];
      const gap = curr.anchor.x - prev.anchor.x;
      if (gap < minGap) {
        const push = (minGap - gap) / 2;
        prev.anchor.x -= push;
        curr.anchor.x += push;
      }
    }

    const margin = layout.cellW * 1.15;
    const left = -layout.boardW / 2 + margin;
    const right = layout.boardW / 2 - margin;
    for (const entry of withAnchors) {
      entry.anchor.x = Math.max(left, Math.min(right, entry.anchor.x));
    }

    return withAnchors.map((entry) => ({
      content: entry.content,
      x: entry.anchor.x,
      y: entry.anchor.y,
    }));
  }

  function drawClusterOverlay(winCells) {
    clusterOverlayCells = winCells?.size ? winCells : null;
    clusterOverlay.clear();
    if (!winCells?.size) return;

    const pad = Math.max(3, layout.cellW * 0.1);
    const radius = Math.max(4, layout.cellW * 0.1);
    const strokeWidth = Math.max(2, layout.cellW * 0.05);

    for (const { reel, node, anchorRow, span } of collectOverlayTargets(winCells)) {
      const stagePos = reel.getSymbolStagePosition(anchorRow, stage);
      const cx = stagePos.x;
      const cy = stagePos.y;
      const boxSpan = node.span ?? span;

      const w = reel.cellW - pad * 2;
      const h = reel.cellH * boxSpan - pad * 2;
      const x = cx - w / 2;
      const y = cy - h / 2;

      clusterOverlay.roundRect(x, y, w, h, radius);
      clusterOverlay.stroke({ color: 0x4ade80, width: strokeWidth, alpha: 0.95 });
      clusterOverlay.fill({ color: 0x4ade80, alpha: 0.12 });
    }
  }

  /**
   * Fade non-winning symbols darker, or restore all dimmed symbols — one shared rAF clock.
   * @param {Set<string> | null} winCells
   * @param {'in' | 'out'} direction
   * @param {number} durationMs
   */
  async function fadeClusterSymbolDim(winCells, direction, durationMs) {
    /** @type {{ object: import('pixi.js').Container, from: number, to: number }[]} */
    const alphaTargets = [];

    for (const reel of reels) {
      const blocks = reel.tallEnabled ? reel.activeColumnBlocks() : null;

      if (reel.tallEnabled && blocks?.length) {
        for (const block of blocks) {
          const node = reel.symbolNodes[block.anchorRow];
          if (!node?.root) continue;

          let isWin = false;
          if (direction === 'in' && winCells) {
            for (let row = block.anchorRow; row < block.anchorRow + block.span; row += 1) {
              if (winCells.has(`${reel.reelIndex},${row}`)) isWin = true;
            }
          }

          if (direction === 'in') {
            if (isWin) {
              node.setDimmed(false);
              node.setWinHighlight(true);
              node.setState('win');
            } else {
              alphaTargets.push({
                object: node.root,
                from: node.root.alpha,
                to: SYMBOL_DIM_ALPHA,
              });
            }
          } else if (node.root.alpha < 0.99) {
            alphaTargets.push({
              object: node.root,
              from: node.root.alpha,
              to: 1,
            });
          }
        }
        continue;
      }

      reel.symbolNodes.forEach((node, row) => {
        if (!node?.root) return;
        const isWin = direction === 'in' && winCells?.has(`${reel.reelIndex},${row}`);

        if (direction === 'in') {
          if (isWin) {
            node.setDimmed(false);
            node.setWinHighlight(true);
            node.setState('win');
          } else {
            alphaTargets.push({
              object: node.root,
              from: node.root.alpha,
              to: SYMBOL_DIM_ALPHA,
            });
          }
        } else if (node.root.alpha < 0.99) {
          alphaTargets.push({
            object: node.root,
            from: node.root.alpha,
            to: 1,
          });
        }
      });
    }

    await animateAlphaTargets(alphaTargets, { durationMs });
  }

  function shouldDeferLayout(reel) {
    return reel.spinning || reel.isPresenting() || reel.clusterPresentationLock;
  }

  function flushDeferredLayouts() {
    if (reels.some((reel) => shouldDeferLayout(reel))) return;
    const dimNonWin = !!clusterOverlayCells?.size;
    reels.forEach((reel) => {
      reel.flushLayoutRescale({ winCells: clusterOverlayCells, dimNonWin });
    });
    if (clusterOverlayCells) drawClusterOverlay(clusterOverlayCells);
  }

  function applyLayout() {
    const w = Math.max(1, hostEl.clientWidth);
    const h = Math.max(1, hostEl.clientHeight);
    if (Math.abs(w - layoutW) < 2 && Math.abs(h - layoutH) < 2) return;
    layoutW = w;
    layoutH = h;
    app.renderer.resize(w, h);

    const boardAspect = GAME.reels / GAME.rows;
    const maxW = w * VIEW_MARGIN;
    const maxH = h * VIEW_MARGIN;
    const framePad = FRAME_PAD_TOP + FRAME_PAD_BOTTOM;

    let boardW = maxW;
    let boardH = boardW / boardAspect;

    if (totalVisualHeight(boardH) > maxH) {
      boardH = (maxH - framePad - 24) / (1 + 0.42 / GAME.rows);
      boardW = boardH * boardAspect;
    }

    if (boardW > maxW) {
      boardW = maxW;
      boardH = boardW / boardAspect;
    }

    let snapped = snapBoardDimensions(boardW, boardH);
    let totalH = snapped.boardH + framePad + snapped.ladderBand;

    if (totalH > maxH || snapped.boardW > maxW) {
      const scale = Math.min(maxW / snapped.boardW, maxH / totalH);
      snapped = snapBoardDimensions(snapped.boardW * scale, snapped.boardH * scale);
      totalH = snapped.boardH + framePad + snapped.ladderBand;
      if (totalH > maxH) {
        const hScale = maxH / totalH;
        snapped = snapBoardDimensions(snapped.boardW * hScale, snapped.boardH * hScale);
      }
    }

    layout = snapped;

    stage.x = w / 2;
    stage.y = h / 2 + (snapped.ladderBand + FRAME_PAD_TOP - FRAME_PAD_BOTTOM) / 2;

    reels.forEach((reel, index) => {
      reel.root.x = Math.round((-layout.boardW / 2 + index * layout.cellW) * 100) / 100;
      reel.root.y = Math.round((-layout.boardH / 2) * 100) / 100;
      const defer = shouldDeferLayout(reel);
      reel.syncLayout(layout.cellW, layout.cellH, {
        deferFullRescale: defer,
        winCells: clusterOverlayCells,
        dimNonWin: !!clusterOverlayCells?.size,
      });
    });

    if (!reels.some((reel) => shouldDeferLayout(reel))) {
      flushDeferredLayouts();
    }

    cascadeLadder.layout({
      boardW: layout.boardW,
      boardH: layout.boardH,
      cellW: layout.cellW,
      ladderBand: layout.ladderBand,
    });
    drawFrame();
    if (clusterOverlayCells) drawClusterOverlay(clusterOverlayCells);
  }

  const resizeObserver = new ResizeObserver(() => applyLayout());
  resizeObserver.observe(hostEl);
  applyLayout();

  function visualBoard(board) {
    return displayBoard(board);
  }

  /** @param {string[][]} board @param {Set<string> | null | undefined} winCells @param {{ spinning?: boolean }} [opts] */
  function applyWinCells(board, winCells, { spinning = false } = {}) {
    const displayBoard = visualBoard(board);
    const hasWin = !spinning && winCells != null && winCells.size > 0;

    reels.forEach((reel, index) => {
      const column = displayBoard?.[index] ?? defaultBoardColumn();
      const boardMatches =
        column.length === reel.visibleRows &&
        column.every((symbol, row) => symbol === reel.currentColumn[row]);

      if (!spinning && boardMatches && (reel.boardSealed || reel.hasLiveBoard())) {
        if (hasWin) reel.applyWinState(winCells, true);
        else reel.clearWinState();
        return;
      }

      reel.boardSealed = false;
      reel.setStaticColumn(column, {
        winCells: hasWin ? winCells : null,
        dimNonWin: hasWin,
      });
    });

    drawClusterOverlay(hasWin ? winCells : null);
  }

  return {
    getBoard,

    isPresenting() {
      return reels.some((reel) => reel.isPresenting());
    },

    cancelPresentation() {
      reels.forEach((reel) => {
        reel.cancelLandJelly();
        reel.spinning = false;
      });
      winPopupLayer.removeChildren();
    },

    async waitUntilIdle() {
      await Promise.all(reels.map((reel) => reel.waitUntilIdle()));
    },

    /**
     * @param {string[][]} board column-major [reel][row]
     * @param {{ spinning?: boolean, winCells?: Set<string> | null }} [opts]
     */
    setBoard(board, { spinning = false, winCells = null } = {}) {
      applyWinCells(board, winCells, { spinning });
    },

    clearWinHighlight() {
      drawClusterOverlay(null);
      winPopupLayer.removeChildren();
      reels.forEach((reel) => reel.clearWinState());
    },

    /**
     * @param {string[][]} finalBoard
     * @param {{ speed?: number }} [opts]
     */
    async animateSpin(finalBoard, { speed = 1 } = {}) {
      this.clearWinHighlight();
      cascadeLadder.reset();

      reels.forEach((reel) => {
        reel.spinning = true;
        reel.boardSealed = false;
      });

      await scaledDelay(TIMING.preSpinMs, speed);

      try {
        await Promise.all(
          reels.map((reel, index) =>
            reel.spinTo(visualBoard(finalBoard)[index] ?? reel.currentColumn, {
              speed,
              winCells: null,
            }),
          ),
        );
      } finally {
        reels.forEach((reel) => {
          reel.spinning = false;
        });
        await Promise.all(reels.map((reel) => reel.waitUntilIdle()));
        if (reels.some((reel) => reel.layoutRescalePending)) {
          flushDeferredLayouts();
        }
      }
    },

    /**
     * @param {Set<string>} winCells — all cells removed after this cascade step
     * @param {{ speed?: number, winPopup?: import('./winPopup.js').WinPopupContent | null, clusterPresentations?: { winCells: Set<string>, winPopup: import('./winPopup.js').WinPopupContent | null }[], firstCascade?: boolean, cascadeMultiplier?: number }} [opts]
     */
    async animateClusterWin(
      winCells,
      {
        speed = 1,
        winPopup = null,
        clusterPresentations = null,
        firstCascade = false,
        cascadeMultiplier = 1,
      } = {},
    ) {
      const presentations =
        clusterPresentations?.length > 0
          ? clusterPresentations
          : [{ winCells, winPopup }];

      reels.forEach((reel) => {
        reel.clusterPresentationLock = true;
      });

      try {
        if (firstCascade) {
          await Promise.all(reels.map((reel) => reel.waitUntilLandImpact()));
          await scaledDelay(TIMING.firstCascadeLeadMs, speed);
        } else {
          await scaledDelay(TIMING.cascadeLeadMs, speed);
        }

        reels.forEach((reel) => reel.cancelLandJelly());

        const dimInMs = Math.round(TIMING.cascadeDimInMs / speed);
        const dimOutMs = Math.round(TIMING.cascadeDimOutMs / speed);
        const highlightMs = Math.round(TIMING.cascadeHighlightMs / speed);
        const popupMs = Math.round(TIMING.cascadeWinPopupMs / speed);
        const simultaneous = presentations.length > 1;

        drawClusterOverlay(winCells);
        await fadeClusterSymbolDim(winCells, 'in', dimInMs);

        cascadeLadder.setActiveStep(cascadeMultiplier);

        const popupPlacements = layoutClusterPopupPlacements(
          simultaneous
            ? presentations.map((entry) => ({
                ...entry,
                winPopup: entry.winPopup
                  ? { ...entry.winPopup, cascadeLabel: null }
                  : null,
              }))
            : presentations,
        );

        const popupPromise = popupPlacements.length
          ? playWinPopups(winPopupLayer, popupPlacements, {
              cellW: layout.cellW,
              cellH: layout.cellH,
              durationMs: popupMs,
            })
          : Promise.resolve();

        const highlightWait = new Promise((resolve) => {
          const start = performance.now();
          const step = (now) => {
            drawClusterOverlay(winCells);
            if (now - start >= highlightMs) {
              resolve();
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        });

        await Promise.all([popupPromise, highlightWait]);

        drawClusterOverlay(null);
        await fadeClusterSymbolDim(null, 'out', dimOutMs);

        const pops = reels.map((reel) => {
          const rows = [];
          for (let row = 0; row < GAME.rows; row += 1) {
            if (winCells.has(`${reel.reelIndex},${row}`)) rows.push(row);
          }
          return reel.popWinRows(rows, { speed });
        });
        await Promise.all(pops);
      } finally {
        reels.forEach((reel) => {
          reel.clusterPresentationLock = false;
        });
      }
    },

    /**
     * @param {string[][]} nextBoard
     * @param {{ fills?: { col: number, row: number, symbol: string }[], removed?: [number, number][], speed?: number }} [opts]
     */
    async animateTumble(nextBoard, { fills = [], removed = [], speed = 1 } = {}) {
      drawClusterOverlay(null);
      reels.forEach((reel) => reel.clearWinState());

      /** @type {Map<number, number[]>} */
      const removedByCol = new Map();
      for (const [col, row] of removed) {
        if (!removedByCol.has(col)) removedByCol.set(col, []);
        removedByCol.get(col).push(row);
      }

      /** @type {Map<number, { row: number, symbol: string }[]>} */
      const fillsByCol = new Map();
      for (const fill of fills) {
        if (!fillsByCol.has(fill.col)) fillsByCol.set(fill.col, []);
        fillsByCol.get(fill.col).push({ row: fill.row, symbol: fill.symbol });
      }

      await Promise.all(
        reels.map((reel, index) =>
          reel.tumbleTo(visualBoard(nextBoard)[index] ?? reel.currentColumn, {
            removedRows: removedByCol.get(index) ?? [],
            fills: fillsByCol.get(index) ?? [],
            speed,
          }),
        ),
      );
      await Promise.all(reels.map((reel) => reel.waitUntilIdle()));
      if (reels.some((reel) => reel.layoutRescalePending)) {
        flushDeferredLayouts();
      }
    },

    resize: applyLayout,

    setCascadeLadderStep(step) {
      cascadeLadder.setActiveStep(step);
    },

    resetCascadeLadder() {
      cascadeLadder.reset();
    },

    async fadeOutCascadeLadder({ speed = 1 } = {}) {
      const durationMs = Math.round(TIMING.cascadeLadderFadeMs / speed);
      await cascadeLadder.fadeOut({ durationMs });
    },

    destroy() {
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    },

    tallEnabled,
  };
}
