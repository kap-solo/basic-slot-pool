/**
 * Pre-replay summary overlay — round details and explicit Start Replay action.
 */

const STYLE_ID = 'replay-start-modal-styles';

const MODAL_CSS = `
.replay-start-overlay {
  position: absolute;
  inset: 0;
  z-index: 9100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: clamp(0.75rem, 3vw, 1.5rem);
  background: rgba(4, 8, 18, 0.72);
  backdrop-filter: blur(6px);
  pointer-events: auto;
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
  width: min(100%, 22rem);
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
  width: min(100%, 22rem);
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
  width: min(100%, 22rem);
  margin: 0.65rem 0 0;
  color: rgba(232, 237, 244, 0.82);
  font-size: clamp(0.54rem, 2.1vw, 0.64rem);
  line-height: 1.35;
  text-align: center;
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
  if (!Number.isFinite(mult)) return '—';
  const abs = Math.abs(mult);
  const digits = abs >= 100 ? 2 : abs >= 10 ? 2 : 2;
  return `${mult.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}x`;
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

  overlay.append(badge, card, actions, footnote);
  shell.appendChild(overlay);

  /** @type {(() => void) | null} */
  let onStart = null;

  startBtn.addEventListener('click', () => {
    overlay.hidden = true;
    onStart?.();
    onStart = null;
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
    open(details) {
      badge.textContent = details.badgeLabel ?? 'Replay';
      modeLabel.textContent = details.rowLabels?.mode ?? 'Mode';
      modeValue.textContent = details.modeLabel ?? '—';
      baseBetRow.labelEl.textContent = details.rowLabels?.baseBet ?? 'Base bet';
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

      overlay.hidden = false;
      startBtn.focus();

      return new Promise((resolve) => {
        onStart = resolve;
      });
    },
    close() {
      overlay.hidden = true;
      onStart = null;
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
