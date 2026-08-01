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
    baseClose();
  };
}
