/**
 * Branded preloader with unified session load progress (static assets + Pixi/Spine + RGS).
 */

import { sleep } from '@kap-solo/suki-engine/client/suki/assetLoader.js';
import { isFatalRgsError } from '@kap-solo/suki-engine/client/suki/rgsGate.js';
import { mountPreloaderSpine, PRELOADER_ANIM_DURATION_MS } from './pixi/preloaderSpine.js';

const STYLE_ID = 'suki-game-preloader-styles';

const PRELOADER_CSS = `
.suki-game-preloader {
  position: absolute;
  inset: 0;
  z-index: 9200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: #201d1d;
  touch-action: manipulation;
}
.suki-game-preloader[hidden] {
  display: none !important;
}
.suki-game-preloader-panel {
  width: min(18rem, 88vw);
  text-align: center;
  pointer-events: none;
}
.suki-game-preloader-spine {
  width: 100%;
  height: clamp(4.5rem, 28vw, 7.5rem);
  margin: 0 0 1.25rem;
}
.suki-game-preloader-track {
  height: 0.45rem;
  border-radius: 999px;
  background: #2e2e2e;
  overflow: hidden;
}
.suki-game-preloader-fill {
  height: 100%;
  width: 0%;
  border-radius: inherit;
  background: #ff006d;
  transition: width 0.18s ease-out;
}
.suki-game-preloader--ready {
  cursor: pointer;
}
.suki-game-preloader--fatal {
  cursor: default;
}
.suki-game-preloader--fatal .suki-game-preloader-track {
  display: none;
}
.suki-game-preloader-error {
  margin: 0.85rem 0 0;
  color: #f87171;
  font-size: 0.82rem;
  line-height: 1.45;
  letter-spacing: 0.02em;
  text-wrap: balance;
}
.suki-stake-shell.suki-preloader-fatal > :not(.suki-game-preloader) {
  visibility: hidden;
  pointer-events: none;
}
`;

function ensureStyles() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = PRELOADER_CSS;
  document.head.appendChild(el);
}

const NOOP_PRELOADER = {
  isDismissed: () => true,
  isLoaded: () => true,
  isFatal: () => false,
  ready: Promise.resolve(),
  dismiss() {},
  show() {},
  destroy() {},
};

/**
 * @param {object} options
 * @param {HTMLElement} options.shell
 * @param {string} [options.loadingHint] — screen-reader label while loading
 * @param {number} [options.minDisplayMs]
 * @param {() => { ok: boolean, message?: string }} [options.gate]
 * @param {(setProgress: (percent: number) => void) => void | Promise<void>} [options.sessionLoad]
 * @param {() => void | Promise<void>} [options.onContinue]
 * @param {boolean} [options.autoContinue] — dismiss without user interaction when load completes
 * @param {boolean} [options.skip]
 */
export function createReflectingPoolPreloader(options) {
  const {
    shell,
    loadingHint = 'Loading…',
    minDisplayMs = PRELOADER_ANIM_DURATION_MS,
    gate,
    sessionLoad,
    onContinue,
    autoContinue = false,
    skip = false,
  } = options;

  if (typeof document === 'undefined' || !shell || skip) {
    return NOOP_PRELOADER;
  }

  ensureStyles();

  let dismissed = false;
  let loaded = false;
  let fatal = false;
  /** @type {{ destroy?: () => void, relayout?: () => void, animationDone?: Promise<void> } | null} */
  let spineMount = null;

  const overlay = document.createElement('div');
  overlay.className = 'suki-game-preloader';
  overlay.setAttribute('tabindex', '0');

  const panel = document.createElement('div');
  panel.className = 'suki-game-preloader-panel';

  const spineHost = document.createElement('div');
  spineHost.className = 'suki-game-preloader-spine';
  spineHost.setAttribute('aria-hidden', 'true');

  const spineAnimationDone = mountPreloaderSpine(spineHost)
    .then((mount) => {
      if (dismissed) {
        mount.destroy();
        return;
      }
      spineMount = mount;
      return mount.animationDone;
    })
    .catch((err) => {
      console.warn('[Basic Slot] Preloader Spine unavailable.', err);
    });

  const track = document.createElement('div');
  track.className = 'suki-game-preloader-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', '0');

  const fill = document.createElement('div');
  fill.className = 'suki-game-preloader-fill';
  track.appendChild(fill);

  const errorEl = document.createElement('p');
  errorEl.className = 'suki-game-preloader-error';
  errorEl.hidden = true;

  panel.append(spineHost, track, errorEl);
  overlay.appendChild(panel);
  shell.appendChild(overlay);
  shell.classList.add('suki-preloader-active');
  overlay.setAttribute('aria-label', loadingHint);

  function setProgress(percent) {
    const clamped = Math.max(0, Math.min(100, percent));
    fill.style.width = `${clamped}%`;
    track.setAttribute('aria-valuenow', String(clamped));
  }

  function markFatal(message) {
    fatal = true;
    loaded = false;
    setProgress(0);
    errorEl.hidden = false;
    errorEl.textContent = message;
    overlay.setAttribute('aria-label', message);
    overlay.classList.remove('suki-game-preloader--ready');
    overlay.classList.add('suki-game-preloader--fatal');
    shell.classList.add('suki-preloader-fatal');
  }

  function markReady() {
    loaded = true;
    setProgress(100);
    overlay.setAttribute('aria-label', autoContinue ? 'Loading complete' : 'Tap to play');
    if (!autoContinue) {
      overlay.classList.add('suki-game-preloader--ready');
    }
  }

  async function dismiss() {
    if (dismissed || !loaded || fatal) return;
    dismissed = true;
    try {
      const cont = onContinue?.();
      if (cont && typeof cont.then === 'function') {
        await cont;
      }
    } finally {
      overlay.hidden = true;
      shell.classList.remove('suki-preloader-active');
      shell.classList.remove('suki-preloader-fatal');
    }
  }

  function onPointerDown(event) {
    if (!loaded || fatal) return;
    event.preventDefault();
    dismiss();
  }

  function onKeyDown(event) {
    if (!loaded || fatal) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dismiss();
    }
  }

  overlay.addEventListener('pointerdown', onPointerDown);
  overlay.addEventListener('keydown', onKeyDown);

  const ready = (async () => {
    const started = Date.now();
    setProgress(0);

    if (gate) {
      const result = gate();
      if (!result?.ok) {
        markFatal(result.message ?? 'Unable to connect.');
        return;
      }
    }

    try {
      if (sessionLoad) {
        await sessionLoad(setProgress);
      }
      await spineAnimationDone;
    } catch (err) {
      console.error('[Suki] preloader bootstrap failed', err);
      const message =
        (isFatalRgsError(err) && err.playerMessage) ||
        err?.playerMessage ||
        (typeof err?.message === 'string' && !err.message.startsWith('ERR_')
          ? err.message
          : 'Unable to connect — game connection settings are invalid. Reopen the game from Stake.');
      markFatal(message);
      return;
    }

    const elapsed = Date.now() - started;
    if (elapsed < minDisplayMs) {
      await sleep(minDisplayMs - elapsed);
    }
    markReady();
    if (autoContinue && loaded && !fatal) {
      await dismiss();
    }
  })();

  ready.catch((err) => {
    console.error('[Suki] preloader failed', err);
    markFatal(
      err?.playerMessage ??
      'Unable to connect — game connection settings are invalid. Reopen the game from Stake.',
    );
  });

  return {
    isDismissed: () => dismissed,
    isLoaded: () => loaded,
    isFatal: () => fatal,
    ready,
    dismiss,
    show() {
      if (dismissed) return;
      overlay.hidden = false;
      shell.classList.add('suki-preloader-active');
    },
    destroy() {
      overlay.removeEventListener('pointerdown', onPointerDown);
      overlay.removeEventListener('keydown', onKeyDown);
      spineMount?.destroy?.();
      spineMount = null;
      overlay.remove();
      shell.classList.remove('suki-preloader-active');
      shell.classList.remove('suki-preloader-fatal');
    },
  };
}
