/**
 * Pixi slot stage — cabinet frame, reel columns, cluster highlight overlay.
 */

import { Application, Assets, Container, Graphics, Sprite } from 'pixi.js';
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
import { scaledDelay, animateAlphaTargets, animateCabinetPulse } from './easing.js';
import { TIMING } from './timing.js';
import { playWinPopups } from './winPopup.js';
import { SYMBOL_DIM_ALPHA } from './symbolView.js';
import { blobCascadeColumnState } from './performanceBlob.js';
import { isPopoutSViewport } from '../stakeScreenInfer.js';

const CABINET_BG_SRC = 'assets/ui/cabinet-bg.webp';
/** How much larger the visible cabinet art is vs the reel frame (mask only). */
const CABINET_BG_VISUAL_SCALE = 1.16;
/** Target ~×1.3 vs legacy 0.92 canvas margin (clamped to full host size). */
const BOARD_LAYOUT_SCALE = 1.3;
const LEGACY_BOARD_MARGIN = 0.92;
/** Visible reel grid area as a fraction of the logical board (mask inset). */
const SYMBOL_CONTAINER_SCALE = 0.9;

/**
 * Fired when the green cluster highlight box appears — one event per cascade step.
 * @typedef {{
 *   cascadeStep: number,
 *   cascadeMultiplier: number,
 *   firstCascade: boolean,
 *   clusterCount: number,
 * }} ClusterHighlightEvent
 */

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
  const cabinetRoot = new Container();
  app.stage.addChild(stage);

  const cabinetBgMask = new Graphics();
  const frame = new Graphics();
  const clusterOverlay = new Graphics();
  const winPopupLayer = new Container();
  const reelsRoot = new Container();
  const cascadeLadder = createCascadeLadder({ maxSteps: MAX_CASCADE_LADDER });

  /** @type {Sprite | null} */
  let cabinetBgSprite = null;
  /** Bumps when a new cabinet pulse starts so the prior rAF loop can exit. */
  let cabinetPulseGen = 0;

  stage.addChild(cabinetRoot);
  cabinetRoot.addChild(cabinetBgMask);
  cabinetRoot.addChild(frame);
  cabinetRoot.addChild(cascadeLadder.root);
  cabinetRoot.addChild(reelsRoot);
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

  function isPopoutS() {
    return isPopoutSViewport(hostEl.closest('.suki-stake-shell'));
  }

  function isPopoutL() {
    return hostEl.closest('.suki-stake-shell')?.dataset.sukiScreen === 'popout-l';
  }

  function isLaptop() {
    return hostEl.closest('.suki-stake-shell')?.dataset.sukiScreen === 'laptop';
  }

  function isMobileBetUi() {
    return hostEl.closest('.suki-stake-shell')?.dataset.betUiVariant === 'mobile';
  }

  function layoutMaxScale() {
    return Math.min(1, LEGACY_BOARD_MARGIN * BOARD_LAYOUT_SCALE);
  }

  function cabinetOuterWidthForBoard(boardW, boardH) {
    const pad = cabinetInnerPadForBoardH(boardH);
    return boardW + pad * 2 + layoutCabinetBgSlackPx(boardH / GAME.rows);
  }

  /** Small layout reserve on tighter desktop breakpoints so frame art is not canvas-clipped. */
  function layoutCabinetBgSlackPx(cellH) {
    if (isMobileBetUi()) return 0;
    if (!isLaptop() && !isPopoutL()) return 0;
    const pad = cabinetInnerPad(cellH);
    const outerW = cellH * GAME.reels + pad * 2;
    return Math.round(outerW * 0.05);
  }

  function layoutStackHeightForBoardH(boardH) {
    return stackHeightForBoardH(boardH) + layoutCabinetBgSlackPx(boardH / GAME.rows);
  }

  /** Preferred cabinet art scale — clamped to canvas slack in layoutCabinetBackground(). */
  function cabinetBgVisualScale() {
    if (isMobileBetUi()) return 1;
    if (isPopoutS()) return 1.08;
    if (isPopoutL() || isLaptop()) return 1.1;
    return CABINET_BG_VISUAL_SCALE;
  }

  /** Never draw cabinet art past the canvas — keeps board size unchanged. */
  function cabinetBgFitScale(canvasW, canvasH) {
    const { outerW, outerH, outerTop } = cabinetOuterMetrics();
    const preferred = cabinetBgVisualScale();
    if (outerW <= 0 || outerH <= 0) return preferred;

    const maxByWidth = canvasW / outerW;
    const topSlack = stage.y + outerTop;
    const bottomSlack = canvasH - (stage.y + outerTop + outerH);
    const verticalSlack = Math.min(Math.max(0, topSlack), Math.max(0, bottomSlack));
    const maxByHeight = 1 + (2 * verticalSlack) / outerH;

    return Math.max(1, Math.min(preferred, maxByWidth, maxByHeight));
  }

  function cabinetInnerPad(cellH) {
    if (isPopoutS()) return Math.max(4, Math.round(cellH * 0.1));
    return Math.max(12, Math.round(cellH * 0.17));
  }

  function cabinetInnerPadForBoardH(boardH) {
    return cabinetInnerPad(boardH / GAME.rows);
  }

  function ladderHeightFactor() {
    return isPopoutS() ? 0.28 : 0.42;
  }

  /** Gap between the ladder row and the cabinet top edge. */
  function ladderGapFor(ladderBand) {
    if (isPopoutS()) return Math.max(4, Math.round(ladderBand * 0.16));
    return Math.max(8, Math.round(ladderBand * 0.28));
  }

  /** Ladder row height scales with cell size — must be reserved before fitting the grid. */
  function ladderBandForBoardH(boardH) {
    return Math.max(24, Math.round((boardH / GAME.rows) * ladderHeightFactor()));
  }

  /** Total stack: ladder + gap + cabinet (padding + reel grid). */
  function stackHeightForBoardH(boardH) {
    const ladderBand = ladderBandForBoardH(boardH);
    const pad = cabinetInnerPadForBoardH(boardH);
    return boardH + pad * 2 + ladderBand + ladderGapFor(ladderBand);
  }

  function snapBoardDimensions(boardW, boardH) {
    const cellW = snapPx(boardW / GAME.reels);
    const cellH = snapPx(boardH / GAME.rows);
    const ladderFactor = ladderHeightFactor();
    return {
      cellW,
      cellH,
      boardW: snapPx(cellW * GAME.reels),
      boardH: snapPx(cellH * GAME.rows),
      ladderBand: Math.max(24, Math.round(cellH * ladderFactor)),
    };
  }

  function getBoard() {
    return reels.map((reel) => [...reel.currentColumn]);
  }

  function cabinetOuterMetrics() {
    const { boardW, boardH, cellH } = layout;
    const pad = cabinetInnerPad(cellH);
    const outerW = boardW + pad * 2;
    const outerH = boardH + pad * 2;
    const outerTop = -boardH / 2 - pad;
    return {
      outerW,
      outerH,
      outerTop,
      outerX: -outerW / 2,
      pad,
      boardW,
      boardH,
    };
  }

  function layoutStackPosition(canvasH) {
    const ladderGap = ladderGapFor(layout.ladderBand);
    const { outerTop, outerH } = cabinetOuterMetrics();
    const stackTop = outerTop - ladderGap - layout.ladderBand;
    const stackBottom = outerTop + outerH;
    const stackCenter = (stackTop + stackBottom) / 2;
    stage.y = canvasH / 2 - stackCenter;
  }

  /** Keep HTML cluster ledger aligned with the Pixi cabinet frame. */
  function syncLedgerCabinetAlignment() {
    const gameCore = hostEl.closest('.suki-game-core');
    if (!gameCore) return;
    const { outerTop, outerH } = cabinetOuterMetrics();
    const topPx = Math.max(0, Math.round(stage.y + outerTop));
    const heightPx = Math.max(0, Math.round(outerH));
    gameCore.style.setProperty('--cabinet-top-offset', `${topPx}px`);
    gameCore.style.setProperty('--cabinet-height', `${heightPx}px`);
  }

  function layoutCabinetBackground() {
    if (!cabinetBgSprite?.texture) return;

    const { outerW, outerH, outerTop, outerX } = cabinetOuterMetrics();
    const visualScale = cabinetBgFitScale(layoutW, layoutH);
    const bgW = outerW * visualScale;
    const bgH = outerH * visualScale;
    const bleedX = (bgW - outerW) / 2;
    const bleedY = (bgH - outerH) / 2;
    const bgX = outerX - bleedX;
    const bgTop = outerTop - bleedY;
    const centerX = outerX + outerW / 2;
    const centerY = outerTop + outerH / 2;
    const texW = cabinetBgSprite.texture.width;
    const texH = cabinetBgSprite.texture.height;
    if (!texW || !texH) return;

    const scale = Math.max(bgW / texW, bgH / texH);
    cabinetBgSprite.scale.set(scale);
    cabinetBgSprite.anchor.set(0.5);
    cabinetBgSprite.position.set(centerX, centerY);

    cabinetBgMask.clear();
    cabinetBgMask.rect(bgX, bgTop, bgW, bgH);
    cabinetBgMask.fill({ color: 0xffffff });
  }

  async function ensureCabinetBackground() {
    if (cabinetBgSprite) return;
    try {
      const texture = await Assets.load(CABINET_BG_SRC);
      cabinetBgSprite = new Sprite(texture);
      cabinetBgSprite.label = 'cabinet-bg';
      cabinetBgSprite.mask = cabinetBgMask;
      cabinetRoot.addChildAt(cabinetBgSprite, 0);
      console.info('[Basic Slot] Cabinet background loaded.');
    } catch (err) {
      console.warn('[Basic Slot] Cabinet background unavailable — using frame only.', err);
    }
  }

  function drawFrame() {
    frame.clear();
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
    const maxW = w * layoutMaxScale();
    const maxH = h * layoutMaxScale();
    const ladderFactor = ladderHeightFactor();

    let boardW = maxW;
    let boardH = boardW / boardAspect;

    if (layoutStackHeightForBoardH(boardH) > maxH) {
      const pad = cabinetInnerPadForBoardH(boardH);
      const bgSlack = layoutCabinetBgSlackPx(boardH / GAME.rows);
      boardH = (maxH - bgSlack - pad * 2 - 16) / (1 + ladderFactor / GAME.rows + ladderFactor / GAME.rows * 0.28);
      boardW = boardH * boardAspect;
    }

    if (boardW > maxW) {
      boardW = maxW;
      boardH = boardW / boardAspect;
    }

    let snapped = snapBoardDimensions(boardW, boardH);
    let totalH = layoutStackHeightForBoardH(snapped.boardH);
    let outerW = cabinetOuterWidthForBoard(snapped.boardW, snapped.boardH);

    if (totalH > maxH || outerW > maxW) {
      const scale = Math.min(maxW / outerW, maxH / totalH);
      snapped = snapBoardDimensions(snapped.boardW * scale, snapped.boardH * scale);
      totalH = layoutStackHeightForBoardH(snapped.boardH);
      outerW = cabinetOuterWidthForBoard(snapped.boardW, snapped.boardH);
      if (totalH > maxH) {
        const hScale = maxH / totalH;
        snapped = snapBoardDimensions(snapped.boardW * hScale, snapped.boardH * hScale);
      }
    }

    layout = snapped;

    stage.x = w / 2;
    layoutStackPosition(h);

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

    reelsRoot.scale.set(SYMBOL_CONTAINER_SCALE);

    const { outerTop } = cabinetOuterMetrics();
    const ladderGap = ladderGapFor(layout.ladderBand);
    cascadeLadder.layout({
      boardW: layout.boardW,
      boardH: layout.boardH,
      cellW: layout.cellW,
      ladderBand: layout.ladderBand,
      y: outerTop - ladderGap - layout.ladderBand / 2,
    });
    layoutCabinetBackground();
    drawFrame();
    if (clusterOverlayCells) drawClusterOverlay(clusterOverlayCells);
    syncLedgerCabinetAlignment();
  }

  await ensureCabinetBackground();

  let layoutRaf = 0;
  function scheduleLayout() {
    if (layoutRaf) return;
    layoutRaf = requestAnimationFrame(() => {
      layoutRaf = 0;
      applyLayout();
    });
  }

  const resizeObserver = new ResizeObserver(() => scheduleLayout());
  resizeObserver.observe(hostEl);
  applyLayout();

  function visualBoard(board) {
    return displayBoard(board);
  }

  /** @param {string[][]} board @param {Set<string> | null | undefined} winCells @param {{ spinning?: boolean, force?: boolean }} [opts] */
  function applyWinCells(board, winCells, { spinning = false, force = false } = {}) {
    const displayBoard = visualBoard(board);
    const hasWin = !spinning && winCells != null && winCells.size > 0;

    reels.forEach((reel, index) => {
      const column = displayBoard?.[index] ?? defaultBoardColumn();
      const boardMatches =
        column.length === reel.visibleRows &&
        column.every((symbol, row) => symbol === reel.currentColumn[row]);

      if (!spinning && !force && boardMatches && (reel.boardSealed || reel.hasLiveBoard())) {
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

  /** Immediate cabinet scale bump — synced with spin button click. */
  function pulseCabinet({ speed = 1 } = {}) {
    const gen = ++cabinetPulseGen;
    void animateCabinetPulse(cabinetRoot, {
      durationMs: TIMING.cabinetPulseMs / speed,
      peakScale: 1.01,
      shouldCancel: () => gen !== cabinetPulseGen,
    });
  }

  /** @type {(() => void) | null} */
  let postSpinMotionStart = null;

  function triggerPostSpinMotionStart() {
    postSpinMotionStart?.();
  }

  /** @type {((detail: ClusterHighlightEvent) => void) | null} */
  let clusterHighlightStart = null;

  /** @param {ClusterHighlightEvent} detail */
  function triggerClusterHighlightStart(detail) {
    clusterHighlightStart?.(detail);
  }

  return {
    getBoard,

    /** Post-spin tumble/refill bed — blob cascade, cluster gravity, strip fill. */
    setPostSpinMotionAudio(fn) {
      postSpinMotionStart = typeof fn === 'function' ? fn : null;
    },

    /** Green cluster highlight box — one callback per cascade step (×1, ×2, …). */
    setClusterHighlightAudio(fn) {
      clusterHighlightStart = typeof fn === 'function' ? fn : null;
    },

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
     * @param {{ spinning?: boolean, winCells?: Set<string> | null, force?: boolean }} [opts]
     */
    setBoard(board, { spinning = false, winCells = null, force = false } = {}) {
      applyWinCells(board, winCells, { spinning, force });
    },

    clearWinHighlight() {
      drawClusterOverlay(null);
      winPopupLayer.removeChildren();
      reels.forEach((reel) => reel.clearWinState());
    },

    pulseCabinet,

    /**
     * @param {Set<string>} cellKeys — "col,row"
     * @param {{ speed?: number }} [opts]
     */
    async popCells(cellKeys, { speed = 1, dissolveDurationMs } = {}) {
      /** @type {Map<number, number[]>} */
      const rowsByCol = new Map();
      for (const key of cellKeys) {
        const [colRaw, rowRaw] = key.split(',');
        const col = Number(colRaw);
        const row = Number(rowRaw);
        if (!Number.isFinite(col) || !Number.isFinite(row)) continue;
        if (!rowsByCol.has(col)) rowsByCol.set(col, []);
        rowsByCol.get(col).push(row);
      }

      await Promise.all(
        reels.map((reel, index) => {
          const rows = rowsByCol.get(index) ?? [];
          if (!rows.length) return Promise.resolve();
          return reel.popWinRows(rows, { speed, dissolveDurationMs });
        }),
      );
    },

    /**
     * Keep reel column data on the book board. Nodes may still show client-only visuals (BL).
     * @param {string[][]} board
     */
    syncBookColumnData(board) {
      const display = visualBoard(board);
      reels.forEach((reel, index) => {
        reel.currentColumn = [...(display[index] ?? defaultBoardColumn())];
        reel.boardSealed = reel.hasLiveBoard();
      });
    },

    /**
     * Align blob-column data with painted nodes before gravity tumble.
     * @param {string[][]} revealBoard
     * @param {Map<number, number>} blobDepthByCol
     */
    syncBlobCascadeColumnData(revealBoard, blobDepthByCol) {
      const display = visualBoard(revealBoard);
      reels.forEach((reel, index) => {
        const depth = blobDepthByCol.get(index);
        if (!depth) return;
        reel.currentColumn = blobCascadeColumnState(display[index] ?? defaultBoardColumn(), depth);
        reel.boardSealed = reel.hasLiveBoard();
      });
    },

    /**
     * Bottom blob pop — survivors fall, top strip fills (same physics as win tumble).
     * @param {string[][]} revealBoard
     * @param {Map<number, number[]>} removedByCol
     * @param {{ speed?: number, onMotionStart?: () => void }} [opts]
     */
    async animateBlobBottomCascade(revealBoard, removedByCol, { speed = 1, onMotionStart } = {}) {
      if (!removedByCol?.size) return;

      triggerPostSpinMotionStart();
      onMotionStart?.();
      const display = visualBoard(revealBoard);
      await Promise.all(
        [...removedByCol.entries()].map(([col, removedRows]) => {
          const reel = reels[col];
          if (!reel || !removedRows.length) return Promise.resolve();
          const revealColumn = display[col] ?? defaultBoardColumn();
          const depth = removedRows.length;
          const fills = Array.from({ length: depth }, (_, row) => ({
            row,
            symbol: revealColumn[row],
          }));
          return reel.tumbleTo(revealColumn, {
            removedRows,
            fills,
            speed,
            forceRowTumble: true,
            onRefillMotionStart: triggerPostSpinMotionStart,
          });
        }),
      );
      await Promise.all(reels.map((reel) => reel.waitUntilIdle()));
    },

    async waitUntilAllLandImpacts() {
      await Promise.all(reels.map((reel) => reel.waitUntilLandImpact()));
    },

    /**
     * @param {string[][]} finalBoard
     * @param {{ speed?: number, onMotionStart?: () => void, onAllLandsImpact?: () => void }} [opts]
     */
    async animateSpin(finalBoard, { speed = 1, onMotionStart, onAllLandsImpact } = {}) {
      this.clearWinHighlight();
      cascadeLadder.reset();

      reels.forEach((reel) => {
        reel.spinning = true;
        reel.boardSealed = false;
      });

      await scaledDelay(TIMING.preSpinMs, speed);
      onMotionStart?.();

      try {
        const board = visualBoard(finalBoard);

        await Promise.all(reels.map((reel) => reel.fallOffColumn({ speed })));

        reels.forEach((reel) => reel.holdRevealBlank());

        await scaledDelay(TIMING.revealBlankMs, speed);

        await Promise.all(
          reels.map((reel, index) =>
            (async () => {
              await scaledDelay(TIMING.reelStaggerMs * index, speed);
              await reel.refillColumn(board[index] ?? reel.currentColumn, { speed });
            })(),
          ),
        );

        await this.waitUntilAllLandImpacts();
        onAllLandsImpact?.();
      } finally {
        await Promise.all(reels.map((reel) => reel.waitUntilIdle()));
        reels.forEach((reel) => {
          reel.spinning = false;
        });
        if (reels.some((reel) => reel.layoutRescalePending)) {
          flushDeferredLayouts();
        }
      }
    },

    /**
     * @param {Set<string>} winCells — all cells removed after this cascade step
     * @param {{ speed?: number, winPopup?: import('./winPopup.js').WinPopupContent | null, clusterPresentations?: { winCells: Set<string>, winPopup: import('./winPopup.js').WinPopupContent | null }[], firstCascade?: boolean, cascadeStep?: number, cascadeMultiplier?: number }} [opts]
     */
    async animateClusterWin(
      winCells,
      {
        speed = 1,
        winPopup = null,
        clusterPresentations = null,
        firstCascade = false,
        cascadeStep = 1,
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
        triggerClusterHighlightStart({
          cascadeStep,
          cascadeMultiplier,
          firstCascade,
          clusterCount: presentations.length,
        });
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
     * @param {{ fills?: { col: number, row: number, symbol: string }[], removed?: [number, number][], speed?: number, onMotionStart?: () => void }} [opts]
     */
    async animateTumble(nextBoard, { fills = [], removed = [], speed = 1, onMotionStart } = {}) {
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

      onMotionStart?.();
      triggerPostSpinMotionStart();

      await Promise.all(
        reels.map((reel, index) =>
          reel.tumbleTo(visualBoard(nextBoard)[index] ?? reel.currentColumn, {
            removedRows: removedByCol.get(index) ?? [],
            fills: fillsByCol.get(index) ?? [],
            speed,
            onRefillMotionStart: triggerPostSpinMotionStart,
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
      if (layoutRaf) {
        cancelAnimationFrame(layoutRaf);
        layoutRaf = 0;
      }
      resizeObserver.disconnect();
      app.destroy(true, { children: true });
    },

    tallEnabled,
  };
}
