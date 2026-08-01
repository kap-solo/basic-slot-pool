/** Spin button art — shared SVG graphic on the play hit-wrap. */

const SPIN_BUTTON_GRAPHIC_SRC = '/assets/ui/spin_button.svg';
const SPIN_BUTTON_ROTATION_MS = 750;

/** @type {Promise<string> | null} */
let graphicSrcPromise = null;

function resolveSpinButtonGraphicSrc() {
  if (!graphicSrcPromise) {
    graphicSrcPromise = fetch(SPIN_BUTTON_GRAPHIC_SRC)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        const typed = blob.type === 'image/svg+xml'
          ? blob
          : new Blob([blob], { type: 'image/svg+xml' });
        return URL.createObjectURL(typed);
      })
      .catch((err) => {
        graphicSrcPromise = null;
        console.warn('[Basic Slot] Spin button graphic unavailable.', err);
        return '';
      });
  }
  return graphicSrcPromise;
}

/**
 * Play control node moved between legacy row and chrome spin slot.
 * @param {HTMLButtonElement | null | undefined} playButton
 * @returns {HTMLElement | null}
 */
export function getPlayControlMount(playButton) {
  return playButton?.closest('.play-hit-wrap') ?? playButton ?? null;
}

/** Drop empty graphic shells left after moving the play button alone. */
export function removeOrphanPlayHitWraps() {
  for (const wrap of document.querySelectorAll('.play-hit-wrap')) {
    if (!wrap.querySelector('.suki-bet-play')) {
      wrap.remove();
    }
  }
}

/**
 * @param {HTMLElement | null | undefined} wrap
 */
export function mountSpinButtonGraphic(wrap) {
  if (!wrap?.classList.contains('play-hit-wrap')) return;

  void resolveSpinButtonGraphicSrc().then((src) => {
    if (!src || !wrap.isConnected) return;

    let img = wrap.querySelector('.bet-ui-spin-graphic');
    if (!img) {
      img = document.createElement('img');
      img.className = 'bet-ui-spin-graphic';
      img.alt = '';
      img.draggable = false;
      img.decoding = 'async';
      wrap.insertBefore(img, wrap.firstChild);
    }
    if (img.getAttribute('src') !== src) {
      img.setAttribute('src', src);
    }
  });
}

/**
 * One full rotation on play click — restarts if already spinning.
 * @param {HTMLElement | null | undefined} wrap
 */
export function playSpinButtonSpin(wrap) {
  const target = wrap?.classList.contains('play-hit-wrap')
    ? wrap
    : document.querySelector('.play-hit-wrap');
  const graphic = target?.querySelector('.bet-ui-spin-graphic');
  if (!graphic) return;

  graphic.classList.remove('bet-ui-spin-graphic--spinning');
  void graphic.offsetWidth;
  graphic.classList.add('bet-ui-spin-graphic--spinning');
  graphic.style.setProperty('--bet-ui-spin-duration', `${SPIN_BUTTON_ROTATION_MS}ms`);
}
