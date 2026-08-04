/**
 * Shared modal close control — × in rounded square (all modalHost dialogs).
 */

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/client/suki/modalHost.js').createModalHost>} modalHost
 * @param {HTMLElement | null | undefined} shell
 */
export function applyModalCloseChrome(modalHost, shell) {
  function styleCloseButton() {
    const closeBtn = shell?.querySelector('.suki-modal-close');
    if (!closeBtn) return;
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close');
  }

  styleCloseButton();

  if (modalHost.__reflectingPoolModalCloseChrome) return;
  modalHost.__reflectingPoolModalCloseChrome = true;

  const baseOpen = modalHost.open.bind(modalHost);
  const baseClose = modalHost.close.bind(modalHost);

  modalHost.open = (id) => {
    styleCloseButton();
    baseOpen(id);
  };

  modalHost.close = () => {
    shell?.classList.remove('suki-autoplay-modal-open');
    shell?.classList.remove('suki-game-info-modal-open');
    shell?.classList.remove('suki-bet-picker-modal-open');
    shell?.classList.remove('suki-buy-bonus-modal-open');
    shell?.classList.remove('suki-buy-bonus-final-confirm-open');
    shell?.querySelector('.suki-buy-bonus-backdrop')?.remove();
    baseClose();
  };
}

/**
 * Route scrim / × / Escape through modalHost.close() — engine listeners call an
 * internal close() that skips patched wrappers (chrome cleanup + buy-btn sync).
 *
 * Call once after all modalHost.close patches are installed.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/suki/modalHost.js').createModalHost>} modalHost
 * @param {HTMLElement | null | undefined} shell
 */
export function bindModalDismissToHost(modalHost, shell) {
  if (modalHost.__reflectingPoolModalDismissBound) return;
  modalHost.__reflectingPoolModalDismissBound = true;

  const overlay = shell?.querySelector('.suki-modal-overlay');
  if (!overlay) return;

  const scrim = overlay.querySelector('.suki-modal-scrim');
  const stage = overlay.querySelector('.suki-modal-stage');
  const closeBtn = overlay.querySelector('.suki-modal-close');

  const dismiss = () => {
    if (shell?.classList.contains('suki-buy-bonus-final-confirm-open')) return;
    modalHost.close();
  };

  const intercept = (event) => {
    event.stopImmediatePropagation();
    dismiss();
  };

  scrim?.addEventListener('click', intercept, true);
  closeBtn?.addEventListener('click', intercept, true);
  stage?.addEventListener('click', (event) => {
    if (event.target !== stage) return;
    intercept(event);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !modalHost.getOpenId?.()) return;
    if (shell?.classList.contains('suki-buy-bonus-final-confirm-open')) return;
    event.stopImmediatePropagation();
    dismiss();
  }, true);
}
