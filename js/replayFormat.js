/**
 * Replay summary formatting — local until @kap-solo/suki-engine pin exports these.
 */

import { apiToDisplay } from '@kap-solo/suki-engine/client/money.js';

/** @param {object} round @param {{ baseBetApiFromPlayAmount: (amountApi: number, mode?: string) => number }} betModePolicy */
export function resolveReplayBaseBetDisplay(round, betModePolicy) {
  return apiToDisplay(betModePolicy.baseBetApiFromPlayAmount(round.amount, round.mode));
}

/** @param {number} mult — display multiplier (payout ÷ cost). */
export function formatReplaySummaryMultiplier(mult) {
  if (!Number.isFinite(mult)) return '—';
  return `${mult.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}×`;
}

/** @param {object} round */
function replaySettlementMultiplier(round) {
  const amountApi = Number(round?.amount);
  const payoutApi = Number(round?.payout ?? 0);
  if (!Number.isFinite(amountApi) || amountApi <= 0) return Number.NaN;
  return payoutApi / amountApi;
}

/** @param {object} round */
export function formatReplayPayoutMultiplier(round) {
  return formatReplaySummaryMultiplier(replaySettlementMultiplier(round));
}
