/**
 * Multiplier panel — persistent desktop shell (landscape only).
 * The multiplier ledger inside holds per-spin entries that fade and clear.
 */

import { clusterBaseMultiplier } from './cluster.js';
import { symbolGlyph, symbolLabel } from './pixi/symbols.js';

/**
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panelEl — persistent multiplier panel shell
 * @param {HTMLElement} opts.ledgerEl — ledger tbody; entries fade/clear each spin
 */
export function createMultiplierPanel({ panelEl, ledgerEl }) {
  let fadeToken = 0;

  /**
   * Append one ledger entry — cluster (size × symbol) and win value.
   * @param {{ symbol: string, size?: number, cells?: [number, number][], baseMultiplier?: number }} cluster
   * @param {number} cascadeMultiplier
   * @param {string} winLabel formatted win amount (e.g. +$0.10)
   */
  function addLedgerEntry(cluster, cascadeMultiplier, winLabel) {
    const size = cluster.size ?? cluster.cells?.length ?? 0;
    if (size < 1) return;

    const baseMult = cluster.baseMultiplier ?? clusterBaseMultiplier(cluster.symbol, size);
    const combinedMult = baseMult * cascadeMultiplier;
    if (combinedMult <= 0 || !winLabel) return;

    const row = document.createElement('tr');
    row.className = 'ledger-entry';

    const clusterCell = document.createElement('td');
    clusterCell.className = 'ledger-entry-cluster';
    clusterCell.textContent = `${size} × ${symbolGlyph(cluster.symbol)}`;

    const winCell = document.createElement('td');
    winCell.className = 'ledger-entry-win';
    winCell.textContent = winLabel;

    row.setAttribute(
      'aria-label',
      `${size} ${symbolLabel(cluster.symbol)} ${winLabel}`,
    );
    row.append(clusterCell, winCell);
    ledgerEl.appendChild(row);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        row.classList.add('ledger-entry--visible');
      });
    });
  }

  /**
   * Fade ledger entries, then clear. Panel shell stays visible.
   * @param {{ durationMs?: number }} [opts]
   */
  async function fadeOutLedger({ durationMs = 320 } = {}) {
    if (!ledgerEl.childElementCount) return;

    const token = ++fadeToken;
    ledgerEl.classList.add('multiplier-ledger--fading');
    await sleep(durationMs);
    if (token !== fadeToken) return;

    ledgerEl.replaceChildren();
    ledgerEl.classList.remove('multiplier-ledger--fading');
  }

  /** Clear ledger immediately (no fade). */
  function clearLedger() {
    fadeToken += 1;
    ledgerEl.replaceChildren();
    ledgerEl.classList.remove('multiplier-ledger--fading');
  }

  return { addLedgerEntry, fadeOutLedger, clearLedger };
}
