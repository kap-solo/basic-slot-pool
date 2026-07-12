/**
 * Dev-only floating control — plays the sample free-spins book.
 * Visible with ?dev=true on every bet UI layout (mobile, desktop, fallback).
 */

/**
 * @param {object} options
 * @param {HTMLElement | null} options.shellEl
 * @param {() => void} options.onClick
 */
export function createDevFeatureButton({ shellEl, onClick }) {
  const noop = {
    sync() {},
    destroy() {},
    el: null,
  };
  if (!shellEl) return noop;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dev-feature-btn';
  button.dataset.sukiDev = '';
  button.textContent = 'Feature';
  button.title = 'Play sample free-spins book (~16×)';
  button.setAttribute('aria-label', 'Play sample free-spins feature');
  button.hidden = true;
  button.addEventListener('click', onClick);
  shellEl.appendChild(button);

  return {
    el: button,
    /**
     * @param {{ visible?: boolean, disabled?: boolean }} [state]
     */
    sync({ visible = false, disabled = false } = {}) {
      button.hidden = !visible;
      button.disabled = disabled;
    },
    destroy() {
      button.remove();
    },
  };
}
