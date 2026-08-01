/** Buy bonus button art — shared SVG graphic on the buy hit-wrap. */

const BUY_BUTTON_GRAPHIC_SRC = 'assets/ui/buy_button.svg';

/** @type {Promise<string> | null} */
let graphicSrcPromise = null;

function resolveBuyButtonGraphicSrc() {
  if (!graphicSrcPromise) {
    graphicSrcPromise = fetch(BUY_BUTTON_GRAPHIC_SRC)
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
        console.warn('[Basic Slot] Buy button graphic unavailable.', err);
        return '';
      });
  }
  return graphicSrcPromise;
}

/**
 * @param {HTMLElement | null | undefined} wrap
 */
export function mountBuyButtonGraphic(wrap) {
  if (!wrap?.classList.contains('buy-hit-wrap')) return;

  void resolveBuyButtonGraphicSrc().then((src) => {
    if (!src || !wrap.isConnected) return;

    let img = wrap.querySelector('.bet-ui-buy-graphic');
    if (!img) {
      img = document.createElement('img');
      img.className = 'bet-ui-buy-graphic';
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
export function ensureBuyHitWrap(btn) {
  if (!btn?.parentNode) return null;
  if (btn.parentElement?.classList.contains('buy-hit-wrap')) {
    return btn.parentElement;
  }
  const wrap = document.createElement('div');
  wrap.className = 'buy-hit-wrap';
  btn.parentNode.insertBefore(wrap, btn);
  wrap.appendChild(btn);
  mountBuyButtonGraphic(wrap);
  return wrap;
}
