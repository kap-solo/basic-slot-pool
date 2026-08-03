/** Autoplay button art — shared SVG graphic on the auto hit-wrap. */

const AUTO_BUTTON_GRAPHIC_SRC = 'assets/ui/auto_button.svg';

/** @type {Promise<string> | null} */
let graphicSrcPromise = null;

function resolveAutoButtonGraphicSrc() {
  if (!graphicSrcPromise) {
    graphicSrcPromise = fetch(AUTO_BUTTON_GRAPHIC_SRC)
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
        console.warn('[Basic Slot] Autoplay button graphic unavailable.', err);
        return '';
      });
  }
  return graphicSrcPromise;
}

/** Front-load autoplay button SVG during the session preloader. */
export function primeAutoButtonGraphic() {
  return resolveAutoButtonGraphicSrc();
}

/**
 * @param {HTMLElement | null | undefined} wrap
 */
export function mountAutoButtonGraphic(wrap) {
  if (!wrap?.classList.contains('auto-hit-wrap')) return;

  void resolveAutoButtonGraphicSrc().then((src) => {
    if (!src || !wrap.isConnected) return;

    let img = wrap.querySelector('.bet-ui-auto-graphic');
    if (!img) {
      img = document.createElement('img');
      img.className = 'bet-ui-auto-graphic';
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
 * @param {HTMLButtonElement | null | undefined} btn
 * @returns {HTMLElement | null}
 */
export function ensureAutoHitWrap(btn) {
  if (!btn?.parentNode) return null;
  if (btn.parentElement?.classList.contains('auto-hit-wrap')) {
    return btn.parentElement;
  }
  const wrap = document.createElement('div');
  wrap.className = 'auto-hit-wrap';
  btn.parentNode.insertBefore(wrap, btn);
  wrap.appendChild(btn);
  mountAutoButtonGraphic(wrap);
  return wrap;
}
