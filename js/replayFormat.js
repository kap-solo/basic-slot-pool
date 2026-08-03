/**
 * Replay helpers — local until @kap-solo/suki-engine pin exports these.
 */

import { apiToDisplay } from '@kap-solo/suki-engine/client/money.js';

/**
 * Stake RGS replay may return { round } or a flat { state, payoutMultiplier, costMultiplier }.
 * @param {object} data
 * @param {{ mode?: string, amountApi?: number, event?: string }} launchParams
 * @param {{ resolvePayout?: (amountApi: number, payoutMultiplier: number, mode: string) => number }} [options]
 */
export function normalizeReplayRound(data, launchParams, options = {}) {
  if (!data || typeof data !== 'object') {
    throw new Error('ERR_BNF');
  }

  const source = data.round && typeof data.round === 'object' ? data.round : data;
  const mode = String(source.mode ?? launchParams.mode ?? 'base').toUpperCase();
  const amountApi = Number(source.amount ?? launchParams.amountApi);
  if (!Number.isFinite(amountApi) || amountApi <= 0) {
    throw new Error('ERR_VAL');
  }

  const state = source.state ?? data.state ?? [];
  if (!Array.isArray(state) || state.length === 0) {
    throw new Error('ERR_BNF');
  }

  const payoutMultiplier = typeof source.payoutMultiplier === 'number'
    ? source.payoutMultiplier
    : typeof data.payoutMultiplier === 'number'
      ? data.payoutMultiplier
      : undefined;

  let payout = source.payout;
  if (payout == null && payoutMultiplier != null) {
    payout = options.resolvePayout
      ? options.resolvePayout(amountApi, payoutMultiplier, mode)
      : Math.round(amountApi * payoutMultiplier);
  }

  const round = {
    ...source,
    amount: amountApi,
    mode,
    state,
    payout: payout ?? 0,
    active: false,
    roundID: source.roundID ?? source.betID ?? launchParams.event,
  };

  if (payoutMultiplier != null) {
    round.payoutMultiplier = payoutMultiplier;
  }

  return round;
}

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
