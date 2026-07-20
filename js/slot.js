/**
 * Slot presentation facade — Pixi + Spine stage behind a stable API for game.js.
 */

import './pixi/bootstrap.js';
import { MIN_CLUSTER_SIZE, winCellsFromClusters } from './cluster.js';
import { createPixiSlotBoard } from './pixi/board.js';
import { symbolLabel } from './pixi/symbols.js';
import { cascadeStepsFromRound, sortedBookEvents } from './round.js';
import { roundPayoutMultiplier } from '@kap-solo/suki-engine/client/rgs.js';

export { symbolLabel };

/**
 * Green cluster highlight — one event per cascade step when the overlay appears.
 * @typedef {{
 *   cascadeStep: number,
 *   cascadeMultiplier: number,
 *   firstCascade: boolean,
 *   clusterCount: number,
 * }} ClusterHighlightEvent
 */

/**
 * @param {HTMLElement} hostEl
 */
export async function createSlotBoard(hostEl) {
  return createPixiSlotBoard(hostEl);
}

/**
 * @param {Awaited<ReturnType<typeof createSlotBoard>>} boardUi
 * @param {string[][]} finalBoard
 * @param {{ speed?: number, onMotionStart?: () => void, onAllLandsImpact?: () => void }} [options]
 */
export async function animateSlotSpin(boardUi, finalBoard, options = {}) {
  await boardUi.animateSpin(finalBoard, options);
}

export function formatMult(mult) {
  if (mult >= 100) return `${mult.toFixed(0)}×`;
  if (mult >= 10) return `${mult.toFixed(1)}×`;
  return `${mult.toFixed(2)}×`;
}

/** @param {object} round */
export function describeRoundResult(round) {
  const mult = roundPayoutMultiplier(round);
  if (mult <= 0) return 'No win';

  const wins = sortedBookEvents(round).filter((e) => e.type === 'clusterWin');
  const cascades = cascadeStepsFromRound(round);

  if (wins.length === 1) {
    const clusters = wins[0].clusters ?? [];
    const parts = clusters.map((cluster) => {
      const name = symbolLabel(cluster.symbol);
      const size = cluster.size ?? cluster.cells?.length ?? MIN_CLUSTER_SIZE;
      return `${name} ×${size}`;
    });
    const ladder = wins[0].cascadeMultiplier ?? 1;
    const prefix = ladder > 1 ? `Cascade ×${ladder} · ` : '';
    return `${prefix}${parts.join(' + ')} · ${formatMult(mult)}`;
  }

  if (cascades > 1) {
    return `${cascades} cascades · ${formatMult(mult)}`;
  }

  return `Cluster win · ${formatMult(mult)}`;
}

/** @deprecated Phase 1 — use describeRoundResult(round) */
export function describeBoardResult(reveal) {
  const mult = reveal.multiplier ?? 0;
  if (mult <= 0) return 'No win';
  const clusters = reveal.clusters ?? [];
  if (!clusters.length) return `Win · ${formatMult(mult)}`;
  const parts = clusters.map((cluster) => {
    const name = symbolLabel(cluster.symbol);
    const size = cluster.size ?? cluster.cells?.length ?? MIN_CLUSTER_SIZE;
    return `${name} ×${size}`;
  });
  return `${parts.join(' + ')} · ${formatMult(mult)}`;
}

/** @param {import('./cluster.js').ClusterWin[]} clusters */
export function winCellsForClusters(clusters) {
  return winCellsFromClusters(clusters);
}
