/**
 * Dev-only top-left toolbar — sample feature, copy replay URL, social mode toggle.
 * Visible with ?dev=true on every bet UI layout.
 */

import { showDevTools } from '@kap-solo/suki-engine/client/suki/environment.js';
import { isDevMode } from '@kap-solo/suki-engine/client/suki/config.js';

const DEV_SOCIAL_KEY = 'suki.dev.socialCasino';

function readDevSocialEnabled(jurisdictionState) {
  if (!isDevMode()) return !!jurisdictionState?.socialCasino;
  const stored = sessionStorage.getItem(DEV_SOCIAL_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  if (new URLSearchParams(window.location.search).get('social') === 'true') return true;
  return !!jurisdictionState?.socialCasino;
}

function toggleDevSocialEnabled(jurisdictionState) {
  if (!isDevMode()) return false;
  const next = !readDevSocialEnabled(jurisdictionState);
  sessionStorage.setItem(DEV_SOCIAL_KEY, next ? 'true' : 'false');
  const url = new URL(window.location.href);
  if (next) url.searchParams.set('social', 'true');
  else url.searchParams.delete('social');
  history.replaceState(null, '', url);
  return next;
}

const STYLE_ID = 'pool-dev-toolbar-styles';

const TOOLBAR_CSS = `
.dev-toolbar {
  position: fixed;
  top: max(0.5rem, env(safe-area-inset-top, 0px));
  left: max(0.5rem, env(safe-area-inset-left, 0px));
  z-index: 11;
  display: flex;
  gap: 0.35rem;
  pointer-events: none;
}
.dev-toolbar-btn {
  border: 1px solid #3d5a80;
  border-radius: 8px;
  padding: 0.38rem 0.62rem;
  background: rgba(12, 20, 34, 0.92);
  color: #b8d4ff;
  font: 700 0.68rem/1.2 'Manrope', system-ui, sans-serif;
  letter-spacing: 0.02em;
  cursor: pointer;
  pointer-events: auto;
  backdrop-filter: blur(4px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.28);
}
.dev-toolbar-btn:hover:not(:disabled) {
  background: rgba(18, 30, 50, 0.96);
  border-color: #5a8fd4;
  color: #e8f2ff;
}
.dev-toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.dev-toolbar-btn--active {
  border-color: #6eb6ff;
  background: rgba(24, 44, 72, 0.96);
  color: #f0f8ff;
}
.dev-toolbar-replay {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  pointer-events: none;
}
.dev-toolbar-spin-id {
  max-width: min(12rem, 36vw);
  padding: 0.28rem 0.45rem;
  border: 1px solid #2a3a52;
  border-radius: 6px;
  background: rgba(8, 12, 18, 0.88);
  color: #9aa8bc;
  font: 600 0.62rem/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: auto;
}
.suki-stake-shell[data-suki-screen='popout-s'] .dev-toolbar-spin-id {
  max-width: min(7rem, 28vw);
  padding: 0.22rem 0.35rem;
  font-size: 0.54rem;
}
.suki-stake-shell[data-suki-screen='popout-s'] .dev-toolbar-btn {
  padding: 0.28rem 0.48rem;
  font-size: 0.58rem;
  border-radius: 6px;
}
`;

function ensureDevToolbarStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = TOOLBAR_CSS;
  document.head.appendChild(el);
}

/**
 * @param {object} options
 * @param {HTMLElement | null} options.shellEl
 * @param {() => void} options.onFeature
 * @param {() => void} options.onReplay
 * @param {() => boolean} [options.getSocialCasino]
 * @param {() => void} [options.onSocialCasinoChange]
 * @param {() => { socialCasino?: boolean } | null | undefined} [options.getJurisdictionState]
 */
export function createDevToolbar({
  shellEl,
  onFeature,
  onReplay,
  getSocialCasino,
  onSocialCasinoChange,
  getJurisdictionState,
}) {
  const noop = {
    sync() {},
    destroy() {},
    el: null,
  };
  if (!shellEl) return noop;

  ensureDevToolbarStyles();

  const toolbar = document.createElement('div');
  toolbar.className = 'dev-toolbar';
  toolbar.dataset.sukiDev = '';
  toolbar.hidden = true;
  shellEl.appendChild(toolbar);

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

  const socialBtn = document.createElement('button');
  socialBtn.type = 'button';
  socialBtn.className = 'dev-toolbar-btn dev-toolbar-btn--social';
  socialBtn.textContent = 'Social Mode';
  socialBtn.title = 'Toggle Stake.US-style copy (Earn, Get Bonus, etc.)';
  socialBtn.setAttribute('aria-label', 'Toggle social casino mode');
  socialBtn.setAttribute('aria-pressed', 'false');
  socialBtn.hidden = true;
  socialBtn.addEventListener('click', () => {
    toggleDevSocialEnabled(getJurisdictionState?.() ?? null);
    onSocialCasinoChange?.();
  });

  toolbar.append(featureBtn, replayCluster, socialBtn);

  return {
    el: toolbar,
    /**
     * @param {{ visible?: boolean, disabled?: boolean, replayReady?: boolean, spinId?: string, socialCasino?: boolean }} [state]
     */
    sync({
      visible = false,
      disabled = false,
      replayReady = false,
      spinId = '',
      socialCasino = getSocialCasino?.() ?? false,
    } = {}) {
      const show = visible && showDevTools();
      toolbar.hidden = !show;
      featureBtn.disabled = disabled;
      replayBtn.disabled = disabled || !replayReady;
      replayBtn.title = replayReady
        ? 'Copy replay URL for the last completed spin'
        : 'Spin first — then copy a replay URL';
      spinIdLabel.textContent = spinId || '—';
      spinIdLabel.hidden = !show;
      spinIdLabel.title = spinId ? `Last spin: ${spinId}` : 'No completed spin yet';
      socialBtn.hidden = !show;
      socialBtn.disabled = !show;
      socialBtn.setAttribute('aria-pressed', socialCasino ? 'true' : 'false');
      socialBtn.classList.toggle('dev-toolbar-btn--active', socialCasino);
      socialBtn.title = socialCasino
        ? 'Social mode on — Stake.US copy (click to switch to real-money labels)'
        : 'Social mode off — real-money copy (click to switch to Stake.US labels)';
    },
    destroy() {
      toolbar.remove();
    },
  };
}
