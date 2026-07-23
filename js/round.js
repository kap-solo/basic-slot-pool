import { roundPayoutMultiplier } from '@kap-solo/suki-engine/client/rgs.js';
import { apiToDisplay, displayToApi } from '@kap-solo/suki-engine/client/money.js';

/** Book payout ints use centi-multipliers — 100 = 1× bet (not Stake API units). */
export function bookCentiMultToMultiplier(amountCentiMult) {
  return amountCentiMult / 100;
}

/** @param {number} amountCentiMult @param {number} amountApi — play amount in API units */
export function bookCentiMultToPayoutApi(amountCentiMult, amountApi) {
  return Math.round(amountApi * bookCentiMultToMultiplier(amountCentiMult));
}

/** @param {number} amountCentiMult @param {number} betDisplay */
export function bookCentiMultToDisplayWin(amountCentiMult, betDisplay) {
  return apiToDisplay(bookCentiMultToPayoutApi(amountCentiMult, displayToApi(betDisplay)));
}

export function sortedBookEvents(round) {
  return [...(round.state ?? [])].sort((a, b) => a.index - b.index);
}

/**
 * @param {{ lastEvent?: string | null }} [meta]
 * @param {{ event?: string | null }} [round]
 * @param {string | number | null | undefined} [lastEvent]
 * @returns {number}
 */
export function resolveLastEventIndex(meta, round, lastEvent) {
  const raw = lastEvent ?? meta?.lastEvent ?? round?.event ?? null;
  if (raw === null || raw === undefined || raw === '') return -1;
  const index = Number(raw);
  return Number.isFinite(index) ? index : -1;
}

/**
 * @param {object} round
 * @param {number} lastEventIndex
 */
export function sliceEventsForResume(round, lastEventIndex) {
  const events = sortedBookEvents(round);
  const completed = events.filter((event) => event.index <= lastEventIndex);
  const remaining = events.filter((event) => event.index > lastEventIndex);
  return { events, completed, remaining };
}

/**
 * Board at the resume checkpoint — last tumble or last gameReveal in completed events.
 * @param {object[]} completed
 */
export function boardFromCompletedEvents(completed) {
  const events = [...completed].sort((a, b) => a.index - b.index);
  const tumbles = events.filter((event) => event.type === 'tumble');
  if (tumbles.length) return tumbles[tumbles.length - 1].board;
  const reveals = events.filter((event) => event.type === 'gameReveal');
  if (reveals.length) return reveals[reveals.length - 1].board;
  return null;
}

/** @param {object[]} completed */
export function isFeatureRoundOpen(completed) {
  const hasEnterBonus = completed.some((event) => event.type === 'enterBonus');
  const hasFreeSpinEnd = completed.some((event) => event.type === 'freeSpinEnd');
  return hasEnterBonus && !hasFreeSpinEnd;
}

/**
 * Active feature book — uses full round state, not just completed events.
 * @param {object | null | undefined} round
 * @param {object[]} [completed]
 */
export function isFeatureRoundActive(round, completed = []) {
  const events = sortedBookEvents(round);
  if (!events.some((event) => event.type === 'enterBonus')) return false;
  if (completed.some((event) => event.type === 'freeSpinEnd')) return false;
  return Boolean(round?.active);
}

/**
 * Board snapshot for resume — checkpoint first, else trigger reveal on fresh feature.
 * @param {object | null | undefined} round
 * @param {object[]} completed
 */
export function boardForResumeSnapshot(round, completed) {
  const checkpoint = boardFromCompletedEvents(completed);
  if (checkpoint) return checkpoint;
  if (isFeatureRoundActive(round, completed)) {
    try {
      return parseGameReveal(round).board;
    } catch {
      return null;
    }
  }
  return finalBoardFromRound(round);
}

/**
 * Events to play on resume — avoids replaying scatter trigger when cursor is missing.
 * @param {object} round
 * @param {number} lastEventIndex
 */
export function resumeEventsFromCheckpoint(round, lastEventIndex) {
  const { events, remaining } = sliceEventsForResume(round, lastEventIndex);
  if (remaining.length) return remaining;
  if (lastEventIndex >= 0) return [];

  const enterBonus = events.find((event) => event.type === 'enterBonus');
  if (enterBonus && round?.active) {
    return events.filter((event) => event.index >= enterBonus.index);
  }
  return events;
}

export function parseGameReveal(round) {
  const reveal = (round.state ?? []).find((e) => e.type === 'gameReveal');
  if (!reveal) throw new Error('Missing gameReveal in round.state');
  return reveal;
}

export function finalBoardFromRound(round) {
  const events = sortedBookEvents(round);
  const tumbles = events.filter((e) => e.type === 'tumble');
  if (tumbles.length) return tumbles[tumbles.length - 1].board;
  return parseGameReveal(round).board;
}

export function cascadeStepsFromRound(round) {
  return (round.state ?? []).filter((e) => e.type === 'clusterWin').length;
}

export function buildGameSettledResult(round) {
  const multiplier = roundPayoutMultiplier(round);
  return {
    board: finalBoardFromRound(round),
    multiplier,
    cascadeSteps: cascadeStepsFromRound(round),
    payoutApi: round.payout,
    profitApi: round.payout - round.amount,
  };
}
