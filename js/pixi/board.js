/**
 * Pixi slot stage — cabinet frame, reel columns, cluster highlight overlay.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { GAME, defaultBoardColumn } from '../config.js';
import { ReelColumn } from './reel.js';
import { loadSpineSymbolRegistry } from './spineAssets.js';
import { scaledDelay } from './easing.js';
import { TIMING } from './timing.js';
import { playWinPopup } from './winPopup.js';

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

  stage.addChild(frame);
  stage.addChild(reelsRoot);
  stage.addChild(clusterOverlay);
  stage.addChild(winPopupLayer);

  /** @type {ReelColumn[]} */
  const reels = [];
  for (let i = 0; i < GAME.reels; i += 1) {
    const reel = new ReelColumn({
      reelIndex: i,
      cellW: 80,
      cellH: 80,
      visibleRows: GAME.rows,
      spineRegistry,
    });
    reels.push(reel);
    reelsRoot.addChild(reel.root);
  }

  let layout = { cellW: 80, cellH: 80, boardW: 240, boardH: 240 };
  let layoutW = 0;
  let layoutH = 0;

  function getBoard() {
    return reels.map((reel) => [...reel.currentColumn]);
  }

  function drawFrame() {
    const { boardW, boardH, cellW, cellH } = layout;
    const pad = 10;
    const outerW = boardW + pad * 2;
    const outerH = boardH + pad * 2;

    frame.clear();
    frame.roundRect(-outerW / 2, -outerH / 2, outerW, outerH, 16);
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

  function drawClusterOverlay(winCells) {
    clusterOverlayCells = winCells?.size ? winCells : null;
    clusterOverlay.clear();
    if (!winCells?.size) return;

    const { cellW, cellH } = layout;
    const pad = Math.max(3, cellW * 0.1);
    const radius = Math.max(4, cellW * 0.1);
    const strokeWidth = Math.max(2, cellW * 0.05);

    for (const key of winCells) {
      const [colRaw, rowRaw] = key.split(',');
      const col = Number(colRaw);
      const row = Number(rowRaw);
      if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

      const reel = reels[col];
      if (!reel) continue;

      const node = reel.symbolNodes[row];
      const scale = node?.root?.scale?.x ?? 1;
      const pos = reel.getSymbolStagePosition(row, stage);
      const cx = pos.x;
      const cy = pos.y;

      const w = (cellW - pad * 2) * scale;
      const h = (cellH - pad * 2) * scale;
      const x = cx - w / 2;
      const y = cy - h / 2;

      clusterOverlay.roundRect(x, y, w, h, radius);
      clusterOverlay.stroke({ color: 0x4ade80, width: strokeWidth, alpha: 0.95 });
      clusterOverlay.fill({ color: 0x4ade80, alpha: 0.12 });
    }
  }

  function applyLayout() {
    const w = Math.max(1, hostEl.clientWidth);
    const h = Math.max(1, hostEl.clientHeight);
    if (Math.abs(w - layoutW) < 2 && Math.abs(h - layoutH) < 2) return;
    layoutW = w;
    layoutH = h;
    app.renderer.resize(w, h);

    const boardAspect = GAME.reels / GAME.rows;
    let boardW = w * 0.92;
    let boardH = boardW / boardAspect;
    if (boardH > h * 0.92) {
      boardH = h * 0.92;
      boardW = boardH * boardAspect;
    }

    const cellW = snapPx(boardW / GAME.reels);
    const cellH = snapPx(boardH / GAME.rows);
    boardW = snapPx(cellW * GAME.reels);
    boardH = snapPx(cellH * GAME.rows);
    layout = { cellW, cellH, boardW, boardH };

    stage.x = w / 2;
    stage.y = h / 2;

    reels.forEach((reel, index) => {
      reel.root.x = Math.round((-boardW / 2 + index * cellW) * 100) / 100;
      reel.root.y = Math.round((-boardH / 2) * 100) / 100;
      if (reel.spinning) return;

      reel.syncLayout(cellW, cellH);
    });

    drawFrame();
    if (clusterOverlayCells) drawClusterOverlay(clusterOverlayCells);
  }

  const resizeObserver = new ResizeObserver(() => applyLayout());
  resizeObserver.observe(hostEl);
  applyLayout();

  /** @param {string[][]} board @param {Set<string> | null | undefined} winCells @param {{ spinning?: boolean }} [opts] */
  function applyWinCells(board, winCells, { spinning = false } = {}) {
    const hasWin = !spinning && winCells != null && winCells.size > 0;

    reels.forEach((reel, index) => {
      const column = board?.[index] ?? defaultBoardColumn();
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

      reels.forEach((reel) => {
        reel.spinning = true;
        reel.boardSealed = false;
      });

      await scaledDelay(TIMING.preSpinMs, speed);

      try {
        await Promise.all(
          reels.map((reel, index) =>
            reel.spinTo(finalBoard[index] ?? reel.currentColumn, {
              speed,
              winCells: null,
            }),
          ),
        );
      } finally {
        reels.forEach((reel) => {
          reel.spinning = false;
        });
      }
    },

    /**
     * @param {Set<string>} winCells
     * @param {{ speed?: number, winLabel?: string | null, firstCascade?: boolean }} [opts]
     */
    async animateClusterWin(winCells, { speed = 1, winLabel = null, firstCascade = false } = {}) {
      if (firstCascade) {
        await Promise.all(reels.map((reel) => reel.waitUntilLandImpact()));
        await scaledDelay(TIMING.firstCascadeLeadMs, speed);
      } else {
        await scaledDelay(TIMING.cascadeLeadMs, speed);
      }

      reels.forEach((reel) => reel.applyWinState(winCells, true));
      drawClusterOverlay(winCells);

      const highlightMs = Math.round(TIMING.cascadeHighlightMs / speed);
      const popupPromise = winLabel
        ? playWinPopup(winPopupLayer, winLabel, {
            cellW: layout.cellW,
            cellH: layout.cellH,
            durationMs: highlightMs,
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

      const pops = reels.map((reel) => {
        const rows = [];
        for (let row = 0; row < GAME.rows; row += 1) {
          if (winCells.has(`${reel.reelIndex},${row}`)) rows.push(row);
        }
        return reel.popWinRows(rows, { speed });
      });
      await Promise.all(pops);
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
          reel.tumbleTo(nextBoard[index] ?? reel.currentColumn, {
            removedRows: removedByCol.get(index) ?? [],
            fills: fillsByCol.get(index) ?? [],
            speed,
          }),
        ),
      );
    },

    resize: applyLayout,

    destroy() {
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    },
  };
}
