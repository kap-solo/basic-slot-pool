/**
 * Dev-only session math overlay — RTP, hit rate, max win, payout-band histogram.
 * Shown only when `showDevTools()` is true (e.g. ?dev=true).
 */

/** @typedef {'loss' | 'micro' | 'small' | 'medium' | 'moderate' | 'good' | 'big' | 'huge'} PayoutBand */

const BANDS = /** @type {const} */ ([
  { id: 'loss', label: '0×', min: 0, max: 0 },
  { id: 'micro', label: '<0.35×', min: 0.0001, max: 0.35 },
  { id: 'small', label: '0.35–0.7×', min: 0.35, max: 0.7 },
  { id: 'medium', label: '0.7–1.5×', min: 0.7, max: 1.5 },
  { id: 'moderate', label: '1.5–5×', min: 1.5, max: 5 },
  { id: 'good', label: '5–25×', min: 5, max: 25 },
  { id: 'big', label: '25–120×', min: 25, max: 120 },
  { id: 'huge', label: '120×+', min: 120, max: Infinity },
]);

/**
 * @param {number} multiplier
 * @returns {PayoutBand}
 */
export function payoutBandForMultiplier(multiplier) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 'loss';
  for (const band of BANDS) {
    if (band.id === 'loss') continue;
    if (multiplier >= band.min && multiplier < band.max) return band.id;
    if (band.max === Infinity && multiplier >= band.min) return band.id;
  }
  return 'loss';
}

function emptyBandCounts() {
  return Object.fromEntries(BANDS.map((band) => [band.id, 0]));
}

/**
 * @param {object} options
 * @param {HTMLElement | null} options.hostEl — usually `#slot-stage`
 * @param {number} [options.targetRtpPercent=96]
 * @param {boolean} [options.enabled=true]
 */
export function createDevStatsOverlay({ hostEl, targetRtpPercent = 96, enabled = true }) {
  const noop = {
    recordRound() {},
    reset() {},
    sync() {},
    destroy() {},
    el: null,
  };
  if (!enabled || !hostEl) return noop;

  const root = document.createElement('aside');
  root.className = 'dev-stats-overlay';
  root.dataset.sukiDev = '';
  root.setAttribute('aria-label', 'Session math stats');

  root.innerHTML = `
    <div class="dev-stats-head">
      <strong class="dev-stats-title">Session math</strong>
      <button type="button" class="dev-stats-reset">Reset</button>
    </div>
    <dl class="dev-stats-metrics"></dl>
    <div class="dev-stats-histogram" aria-label="Payout band histogram"></div>
  `;

  const metricsEl = root.querySelector('.dev-stats-metrics');
  const histogramEl = root.querySelector('.dev-stats-histogram');
  const resetBtn = root.querySelector('.dev-stats-reset');

  /** @type {{ spins: number, wagered: number, returned: number, hits: number, maxMult: number, bands: Record<PayoutBand, number> }} */
  let state = {
    spins: 0,
    wagered: 0,
    returned: 0,
    hits: 0,
    maxMult: 0,
    bands: emptyBandCounts(),
  };

  function formatPct(value, digits = 2) {
    return `${value.toFixed(digits)}%`;
  }

  function formatMult(value) {
    if (value >= 100) return `${value.toFixed(0)}×`;
    if (value >= 10) return `${value.toFixed(1)}×`;
    return `${value.toFixed(2)}×`;
  }

  function sync() {
    const rtp = state.wagered > 0 ? (state.returned / state.wagered) * 100 : 0;
    const hitRate = state.spins > 0 ? (state.hits / state.spins) * 100 : 0;
    const net = state.returned - state.wagered;
    const rtpDelta = rtp - targetRtpPercent;

    metricsEl.innerHTML = `
      <div class="dev-stats-metric"><dt>Spins</dt><dd>${state.spins}</dd></div>
      <div class="dev-stats-metric"><dt>Session RTP</dt><dd class="${rtpDelta >= 0 ? 'dev-stats-pos' : 'dev-stats-neg'}">${formatPct(rtp)} <span class="dev-stats-sub">target ${targetRtpPercent}%</span></dd></div>
      <div class="dev-stats-metric"><dt>Hit rate</dt><dd>${formatPct(hitRate)}</dd></div>
      <div class="dev-stats-metric"><dt>Max win</dt><dd>${state.maxMult > 0 ? formatMult(state.maxMult) : '—'}</dd></div>
      <div class="dev-stats-metric"><dt>Net P/L</dt><dd class="${net >= 0 ? 'dev-stats-pos' : 'dev-stats-neg'}">${net >= 0 ? '+' : ''}${net.toFixed(2)}</dd></div>
    `;

    const maxBandCount = Math.max(1, ...Object.values(state.bands));
    histogramEl.innerHTML = BANDS.map((band) => {
      const count = state.bands[band.id] ?? 0;
      const share = state.spins > 0 ? (count / state.spins) * 100 : 0;
      const barWidth = (count / maxBandCount) * 100;
      return `
        <div class="dev-stats-bar-row">
          <span class="dev-stats-bar-label">${band.label}</span>
          <span class="dev-stats-bar-track" aria-hidden="true"><span class="dev-stats-bar-fill" style="width:${barWidth.toFixed(1)}%"></span></span>
          <span class="dev-stats-bar-value">${share.toFixed(1)}%</span>
        </div>
      `;
    }).join('');
  }

  function reset() {
    state = {
      spins: 0,
      wagered: 0,
      returned: 0,
      hits: 0,
      maxMult: 0,
      bands: emptyBandCounts(),
    };
    sync();
  }

  /**
   * @param {{ wager: number, payout: number, multiplier: number }} round
   */
  function recordRound({ wager, payout, multiplier }) {
    state.spins += 1;
    state.wagered += wager;
    state.returned += payout;
    if (multiplier > 0) state.hits += 1;
    if (multiplier > state.maxMult) state.maxMult = multiplier;
    const band = payoutBandForMultiplier(multiplier);
    state.bands[band] += 1;
    sync();
  }

  resetBtn.addEventListener('click', reset);
  hostEl.appendChild(root);
  sync();

  return {
    recordRound,
    reset,
    sync,
    destroy() {
      root.remove();
    },
    el: root,
  };
}
