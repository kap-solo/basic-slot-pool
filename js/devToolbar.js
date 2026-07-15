/**
 * Dev-only top-left toolbar — sample feature + copy last replay URL.
 * Visible with ?dev=true on every bet UI layout.
 */

/**
 * @param {object} options
 * @param {HTMLElement | null} options.shellEl
 * @param {() => void} options.onFeature
 * @param {() => void} options.onReplay
 */
export function createDevToolbar({ shellEl, onFeature, onReplay }) {
  const noop = {
    sync() {},
    destroy() {},
    el: null,
  };
  if (!shellEl) return noop;

  const toolbar = document.createElement('div');
  toolbar.className = 'dev-toolbar';
  toolbar.dataset.sukiDev = '';
  toolbar.hidden = true;

  const featureBtn = document.createElement('button');
  featureBtn.type = 'button';
  featureBtn.className = 'dev-toolbar-btn';
  featureBtn.textContent = 'Feature';
  featureBtn.title = 'Play sample free-spins book (~16×)';
  featureBtn.setAttribute('aria-label', 'Play sample free-spins feature');
  featureBtn.addEventListener('click', onFeature);

  const replayCluster = document.createElement('div');
  replayCluster.className = 'dev-toolbar-replay';

  const replayBtn = document.createElement('button');
  replayBtn.type = 'button';
  replayBtn.className = 'dev-toolbar-btn';
  replayBtn.textContent = 'Replay';
  replayBtn.title = 'Copy replay URL for the last completed spin';
  replayBtn.setAttribute('aria-label', 'Copy replay URL for the last completed spin');
  replayBtn.addEventListener('click', onReplay);

  const spinIdLabel = document.createElement('span');
  spinIdLabel.className = 'dev-toolbar-spin-id';
  spinIdLabel.setAttribute('aria-live', 'polite');
  spinIdLabel.textContent = '—';

  replayCluster.append(replayBtn, spinIdLabel);
  toolbar.append(featureBtn, replayCluster);
  shellEl.appendChild(toolbar);

  return {
    el: toolbar,
    /**
     * @param {{ visible?: boolean, disabled?: boolean, replayReady?: boolean, spinId?: string }} [state]
     */
    sync({ visible = false, disabled = false, replayReady = false, spinId = '' } = {}) {
      toolbar.hidden = !visible;
      featureBtn.disabled = disabled;
      replayBtn.disabled = disabled || !replayReady;
      replayBtn.title = replayReady
        ? 'Copy replay URL for the last completed spin'
        : 'Spin first — then copy a replay URL';
      spinIdLabel.textContent = spinId || '—';
      spinIdLabel.hidden = !visible;
      spinIdLabel.title = spinId ? `Last spin: ${spinId}` : 'No completed spin yet';
    },
    destroy() {
      toolbar.remove();
    },
  };
}
