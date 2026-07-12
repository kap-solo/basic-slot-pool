/**
 * Short-lived player-facing notices (affordability, errors).
 * The legacy #message overlay is hidden in Pool — use this for visible copy.
 */

/** @type {HTMLElement | null} */
let noticeEl = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let hideTimer = null;

/**
 * @param {HTMLElement} shell — `.suki-stake-shell`
 */
export function mountPlayerNotice(shell) {
  if (noticeEl) return noticeEl;

  noticeEl = document.createElement('div');
  noticeEl.className = 'player-notice';
  noticeEl.setAttribute('role', 'status');
  noticeEl.setAttribute('aria-live', 'polite');
  noticeEl.hidden = true;
  shell.appendChild(noticeEl);
  return noticeEl;
}

/**
 * @param {string} text
 * @param {{ durationMs?: number }} [options]
 */
export function showPlayerNotice(text, { durationMs = 2800 } = {}) {
  if (!noticeEl) return;

  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  noticeEl.textContent = text;
  noticeEl.hidden = false;
  noticeEl.classList.add('is-visible');

  hideTimer = setTimeout(() => {
    noticeEl?.classList.remove('is-visible');
    if (noticeEl) noticeEl.hidden = true;
    hideTimer = null;
  }, durationMs);
}
