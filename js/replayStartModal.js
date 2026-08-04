/**
 * Pre-replay summary overlay — round details and explicit Start Replay action.
 */

import { formatReplaySummaryMultiplier } from './replayFormat.js';

const STYLE_ID = 'replay-start-modal-styles';

const MODAL_CSS = `
.replay-start-overlay {
  position: fixed;
  inset: 0;
  z-index: 9100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: clamp(0.75rem, 3vw, 1.5rem);
  background: rgba(4, 8, 18, 0.72);
  backdrop-filter: blur(6px);
  pointer-events: auto;
}

.replay-start-scaler {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
}

.replay-start-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 22rem);
  transform-origin: center center;
}

.replay-start-overlay[hidden] {
  display: none !important;
}

.replay-start-badge {
  margin: 0 0 0.65rem;
  padding: 0.22rem 0.85rem;
  border-radius: 999px;
  background: #f5c518;
  color: #111;
  font-size: clamp(0.58rem, 2.4vw, 0.72rem);
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.replay-start-card {
  width: 100%;
  padding: clamp(0.85rem, 3vw, 1.1rem) clamp(0.95rem, 3.2vw, 1.25rem);
  border: 1px solid rgba(120, 170, 230, 0.45);
  border-radius: 14px;
  background: rgba(10, 18, 36, 0.94);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
}

.replay-start-mode {
  margin: 0 0 0.85rem;
}

.replay-start-mode-label {
  display: block;
  margin-bottom: 0.18rem;
  color: #8b98ab;
  font-size: clamp(0.58rem, 2.2vw, 0.68rem);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.replay-start-mode-value {
  display: block;
  color: #f5c518;
  font-size: clamp(0.72rem, 2.8vw, 0.88rem);
  font-weight: 800;
  letter-spacing: 0.03em;
  line-height: 1.25;
  text-transform: uppercase;
}

.replay-start-rows {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.replay-start-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}

.replay-start-row-label {
  color: #d8e0ec;
  font-size: clamp(0.62rem, 2.4vw, 0.74rem);
  font-weight: 600;
}

.replay-start-row-value {
  color: #eef3fa;
  font-size: clamp(0.68rem, 2.6vw, 0.82rem);
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
  min-width: 0;
}

.replay-start-row-value--highlight {
  color: #f5c518;
  font-size: clamp(0.82rem, 3vw, 1rem);
  font-weight: 800;
}

.replay-start-row-value--win {
  color: #45e08a;
  font-weight: 800;
}

.replay-start-row--total-cost {
  margin-top: 0.15rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid rgba(245, 197, 24, 0.55);
  border-radius: 10px;
  background: rgba(245, 197, 24, 0.06);
}

.replay-start-actions {
  width: 100%;
  margin-top: 0.75rem;
}

.replay-start-button {
  width: 100%;
  padding: clamp(0.7rem, 2.8vw, 0.9rem) 1rem;
  border: none;
  border-radius: 12px;
  background: linear-gradient(180deg, #33d9f5 0%, #12b8e8 100%);
  color: #081018;
  font-size: clamp(0.72rem, 2.8vw, 0.86rem);
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.replay-start-button:hover {
  filter: brightness(1.05);
}

.replay-start-button:focus-visible {
  outline: 2px solid #eef3fa;
  outline-offset: 2px;
}

.replay-start-footnote {
  width: 100%;
  margin: 0.65rem 0 0;
  color: rgba(232, 237, 244, 0.82);
  font-size: clamp(0.54rem, 2.1vw, 0.64rem);
  line-height: 1.35;
  text-align: center;
}

.replay-start-error {
  margin: 0 0 0.75rem;
  max-width: 20rem;
  padding: 0.65rem 0.85rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 120, 120, 0.45);
  background: rgba(24, 10, 12, 0.94);
  color: #ffb4b4;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
}

/* Popout S (400×225) — tighter baseline; JS scales panel if still too tall. */
.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-overlay {
  padding: 0.3rem 0.45rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-panel {
  width: min(100%, 17.5rem);
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-badge {
  margin-bottom: 0.35rem;
  padding: 0.14rem 0.55rem;
  font-size: 0.52rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-card {
  padding: 0.45rem 0.55rem;
  border-radius: 10px;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-mode {
  margin-bottom: 0.45rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-mode-label {
  margin-bottom: 0.1rem;
  font-size: 0.5rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-mode-value {
  font-size: 0.62rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-rows {
  gap: 0.28rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-row-label {
  font-size: 0.54rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-row-value {
  font-size: 0.58rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-row-value--highlight {
  font-size: 0.66rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-row--total-cost {
  margin-top: 0.05rem;
  padding: 0.32rem 0.42rem;
  border-radius: 8px;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-actions {
  margin-top: 0.4rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-button {
  padding: 0.42rem 0.65rem;
  border-radius: 9px;
  font-size: 0.58rem;
}

.suki-stake-shell:is([data-suki-screen='popout-s'], .suki-viewport-popout-s) .replay-start-footnote {
  display: none;
}

@media (orientation: landscape) and (max-height: 320px) and (max-width: 640px) {
  .replay-start-overlay {
    padding: 0.3rem 0.45rem;
  }

  .replay-start-panel {
    width: min(100%, 17.5rem);
  }

  .replay-start-badge {
    margin-bottom: 0.35rem;
    padding: 0.14rem 0.55rem;
    font-size: 0.52rem;
  }

  .replay-start-card {
    padding: 0.45rem 0.55rem;
    border-radius: 10px;
  }

  .replay-start-mode {
    margin-bottom: 0.45rem;
  }

  .replay-start-mode-label {
    margin-bottom: 0.1rem;
    font-size: 0.5rem;
  }

  .replay-start-mode-value {
    font-size: 0.62rem;
  }

  .replay-start-rows {
    gap: 0.28rem;
  }

  .replay-start-row-label {
    font-size: 0.54rem;
  }

  .replay-start-row-value {
    font-size: 0.58rem;
  }

  .replay-start-row-value--highlight {
    font-size: 0.66rem;
  }

  .replay-start-row--total-cost {
    margin-top: 0.05rem;
    padding: 0.32rem 0.42rem;
    border-radius: 8px;
  }

  .replay-start-actions {
    margin-top: 0.4rem;
  }

  .replay-start-button {
    padding: 0.42rem 0.65rem;
    border-radius: 9px;
    font-size: 0.58rem;
  }

  .replay-start-footnote {
    display: none;
  }
}
`;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = MODAL_CSS;
  document.head.appendChild(el);
}

/**
 * @param {number} mult
 */
function formatReplayMult(mult) {
  return formatReplaySummaryMultiplier(mult).replace('×', 'x');
}

/**
 * @param {HTMLElement} shell
 */
export function createReplayStartModal(shell) {
  ensureStyles();

  const overlay = document.createElement('div');
  overlay.className = 'replay-start-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'replay-start-badge');

  const badge = document.createElement('p');
  badge.id = 'replay-start-badge';
  badge.className = 'replay-start-badge';
  badge.textContent = 'Replay';

  const card = document.createElement('div');
  card.className = 'replay-start-card';

  const modeBlock = document.createElement('div');
  modeBlock.className = 'replay-start-mode';
  const modeLabel = document.createElement('span');
  modeLabel.className = 'replay-start-mode-label';
  modeLabel.textContent = 'Mode';
  const modeValue = document.createElement('strong');
  modeValue.className = 'replay-start-mode-value';
  modeBlock.append(modeLabel, modeValue);

  const rows = document.createElement('div');
  rows.className = 'replay-start-rows';

  const baseBetRow = createRow('');
  const costMultRow = createRow('');
  const totalCostRow = createRow('');
  totalCostRow.root.classList.add('replay-start-row--total-cost');
  const payoutMultRow = createRow('');
  payoutMultRow.valueEl.classList.add('replay-start-row-value--win');
  const totalWinRow = createRow('');
  totalWinRow.valueEl.classList.add('replay-start-row-value--win');

  rows.append(
    baseBetRow.root,
    costMultRow.root,
    totalCostRow.root,
    payoutMultRow.root,
    totalWinRow.root,
  );

  card.append(modeBlock, rows);

  const actions = document.createElement('div');
  actions.className = 'replay-start-actions';
  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'replay-start-button';
  startBtn.textContent = '▶ Start Replay';
  actions.append(startBtn);

  const footnote = document.createElement('p');
  footnote.className = 'replay-start-footnote';
  footnote.textContent = '';

  const panel = document.createElement('div');
  panel.className = 'replay-start-panel';
  panel.append(badge, card, actions, footnote);

  const scaler = document.createElement('div');
  scaler.className = 'replay-start-scaler';
  scaler.append(panel);

  const errorEl = document.createElement('p');
  errorEl.className = 'replay-start-error';
  errorEl.hidden = true;
  panel.insertBefore(errorEl, footnote);

  overlay.append(scaler);
  (document.body ?? shell).appendChild(overlay);

  /** @type {(() => void) | null} */
  let onStart = null;
  /** @type {(() => void) | null} */
  let onDismiss = null;
  let fitRaf = 0;

  function resetPanelLayout() {
    card.hidden = false;
    actions.hidden = false;
    errorEl.hidden = true;
    errorEl.textContent = '';
    startBtn.disabled = false;
  }

  function revealOverlay() {
    overlay.hidden = false;
    scheduleFitPanel();
    requestAnimationFrame(scheduleFitPanel);
  }

  function fitPanelToOverlay() {
    if (overlay.hidden) return;

    panel.style.transform = 'none';
    scaler.style.width = '';
    scaler.style.height = '';

    const overlayStyle = getComputedStyle(overlay);
    const padX = parseFloat(overlayStyle.paddingLeft) + parseFloat(overlayStyle.paddingRight);
    const padY = parseFloat(overlayStyle.paddingTop) + parseFloat(overlayStyle.paddingBottom);
    const maxW = overlay.clientWidth - padX;
    const maxH = overlay.clientHeight - padY;
    const panelW = panel.offsetWidth;
    const panelH = panel.offsetHeight;
    if (maxW <= 0 || maxH <= 0 || panelW <= 0 || panelH <= 0) return;

    const scale = Math.min(1, maxW / panelW, maxH / panelH);
    const applied = Math.max(0.52, scale);
    if (applied >= 0.999) return;

    panel.style.transform = `scale(${applied})`;
    scaler.style.width = `${panelW * applied}px`;
    scaler.style.height = `${panelH * applied}px`;
  }

  function scheduleFitPanel() {
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      fitPanelToOverlay();
    });
  }

  function onViewportChange() {
    scheduleFitPanel();
  }

  window.addEventListener('resize', onViewportChange);
  window.visualViewport?.addEventListener('resize', onViewportChange);

  startBtn.addEventListener('click', () => {
    if (startBtn.disabled) return;
    overlay.hidden = true;
    const dismiss = onDismiss;
    const start = onStart;
    onDismiss = null;
    onStart = null;
    if (errorEl.hidden === false) {
      dismiss?.();
      return;
    }
    start?.();
  });

  return {
    /**
     * @param {object} details
     * @param {string} details.badgeLabel
     * @param {string} details.modeLabel
     * @param {string} details.baseBet
     * @param {string} details.costMultiplier
     * @param {string} details.totalBetCost
     * @param {string} details.payoutMultiplier
     * @param {string} details.totalWin
     * @param {object} [details.rowLabels]
     * @param {string} [details.footnote]
     * @param {string} [details.startLabel]
     * @returns {Promise<void>}
     */
    openLoading({ badgeLabel = 'Replay', footnote: footnoteText = '' } = {}) {
      resetPanelLayout();
      badge.textContent = badgeLabel;
      modeLabel.textContent = 'Status';
      modeValue.textContent = 'Loading replay…';
      for (const row of [baseBetRow, costMultRow, totalCostRow, payoutMultRow, totalWinRow]) {
        row.valueEl.textContent = '—';
      }
      if (footnoteText) footnote.textContent = footnoteText;
      startBtn.textContent = 'Loading…';
      startBtn.disabled = true;
      onStart = null;
      onDismiss = null;
      revealOverlay();
    },
    /**
     * @param {object} details
     * @param {string} details.badgeLabel
     * @param {string} details.message
     * @param {string} [details.footnote]
     * @param {string} [details.dismissLabel]
     * @returns {Promise<void>}
     */
    openError(details) {
      resetPanelLayout();
      badge.textContent = details.badgeLabel ?? 'Replay';
      card.hidden = true;
      errorEl.hidden = false;
      errorEl.textContent = details.message ?? 'Replay unavailable.';
      if (details.footnote) footnote.textContent = details.footnote;
      startBtn.textContent = details.dismissLabel ?? 'Close';
      startBtn.disabled = false;
      onStart = null;
      revealOverlay();
      return new Promise((resolve) => {
        onDismiss = resolve;
      });
    },
    open(details) {
      resetPanelLayout();
      badge.textContent = details.badgeLabel ?? 'Replay';
      modeLabel.textContent = details.rowLabels?.mode ?? 'Mode';
      modeValue.textContent = details.modeLabel ?? '—';
      baseBetRow.labelEl.textContent = details.rowLabels?.baseBet ?? 'Base amount';
      costMultRow.labelEl.textContent = details.rowLabels?.costMultiplier ?? 'Cost multiplier';
      totalCostRow.labelEl.textContent = details.rowLabels?.totalPlayCost ?? 'Total cost';
      payoutMultRow.labelEl.textContent = details.rowLabels?.payoutMultiplier ?? 'Payout multiplier';
      totalWinRow.labelEl.textContent = details.rowLabels?.totalWin ?? 'Total win';
      baseBetRow.valueEl.textContent = details.baseBet ?? '—';
      costMultRow.valueEl.textContent = details.costMultiplier ?? '—';
      totalCostRow.valueEl.textContent = details.totalBetCost ?? '—';
      totalCostRow.valueEl.classList.add('replay-start-row-value--highlight');
      payoutMultRow.valueEl.textContent = details.payoutMultiplier ?? '—';
      totalWinRow.valueEl.textContent = details.totalWin ?? '—';
      if (details.footnote) footnote.textContent = details.footnote;
      if (details.startLabel) startBtn.textContent = details.startLabel;

      revealOverlay();
      requestAnimationFrame(() => startBtn.focus());

      return new Promise((resolve) => {
        onStart = resolve;
        onDismiss = null;
      });
    },
    close() {
      overlay.hidden = true;
      onStart = null;
      onDismiss = null;
      resetPanelLayout();
      panel.style.transform = 'none';
      scaler.style.width = '';
      scaler.style.height = '';
    },
    isOpen() {
      return !overlay.hidden;
    },
    formatCostMultiplier: formatReplayMult,
  };
}

/**
 * @param {string} label
 */
function createRow(label) {
  const root = document.createElement('div');
  root.className = 'replay-start-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'replay-start-row-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'replay-start-row-value';
  valueEl.textContent = '—';

  root.append(labelEl, valueEl);
  return { root, labelEl, valueEl };
}
