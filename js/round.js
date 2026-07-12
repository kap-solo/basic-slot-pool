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
