/**
 * Shared modal close control — × in rounded square (all modalHost dialogs).
 */

/**
 * @param {HTMLElement | null | undefined} shell
 */
function ensureModalCloseButton(shell) {
  const overlay = shell?.querySelector('.suki-modal-overlay');
  const dialog = overlay?.querySelector('.suki-modal-dialog');
  const header = dialog?.querySelector('.suki-modal-header');
  if (!header) return;

  let closeBtn = overlay?.querySelector('.suki-modal-close');
  if (closeBtn) {
    closeBtn.classList.remove('suki-game-info-close');
    if (closeBtn.parentElement !== header) {
      header.appendChild(closeBtn);
    }
  } else {
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'suki-modal-close';
    closeBtn.setAttribute('aria-label', 'Close');
    header.appendChild(closeBtn);
  }

  closeBtn.textContent = '×';
}

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/client/suki/modalHost.js').createModalHost>} modalHost
 * @param {HTMLElement | null | undefined} shell
 */
export function applyModalCloseChrome(modalHost, shell) {
  function styleCloseButton() {
    ensureModalCloseButton(shell);
  }

  styleCloseButton();

  if (modalHost.__reflectingPoolModalCloseChrome) return;
  modalHost.__reflectingPoolModalCloseChrome = true;

  const baseOpen = modalHost.open.bind(modalHost);
  const baseClose = modalHost.close.bind(modalHost);

  modalHost.open = (id) => {
    ensureModalCloseButton(shell);
    baseOpen(id);
  };

  modalHost.close = () => {
    ensureModalCloseButton(shell);
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

  const dismiss = () => {
    if (shell?.classList.contains('suki-buy-bonus-final-confirm-open')) return;
    modalHost.close();
  };

  const intercept = (event) => {
    event.stopImmediatePropagation();
    dismiss();
  };

  scrim?.addEventListener('click', intercept, true);
  overlay.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.suki-modal-close')) return;
    intercept(event);
  }, true);
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
