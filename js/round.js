import { roundPayoutMultiplier } from '@kap-solo/suki-engine/client/rgs.js';

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
