/** Buy bonus button art — shared SVG graphic on the buy hit-wrap. */

const BUY_BUTTON_GRAPHIC_SRC = 'assets/ui/bonus.svg';
const BUY_BUTTON_SOCIAL_GRAPHIC_SRC = 'assets/ui/bonus_social.svg';

/** @type {Map<boolean, Promise<string>>} */
const graphicSrcPromises = new Map();

function buyButtonGraphicPath(socialCasino) {
  return socialCasino ? BUY_BUTTON_SOCIAL_GRAPHIC_SRC : BUY_BUTTON_GRAPHIC_SRC;
}

function resolveBuyButtonGraphicSrc(socialCasino = false) {
  if (!graphicSrcPromises.has(socialCasino)) {
    const path = buyButtonGraphicPath(socialCasino);
    graphicSrcPromises.set(
      socialCasino,
      fetch(path)
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
          graphicSrcPromises.delete(socialCasino);
          console.warn('[Basic Slot] Buy button graphic unavailable.', err);
          return '';
        }),
    );
  }
  return graphicSrcPromises.get(socialCasino);
}

/**
 * @param {HTMLElement | null | undefined} wrap
 * @param {{ socialCasino?: boolean }} [opts]
 */
export function mountBuyButtonGraphic(wrap, { socialCasino = false } = {}) {
  if (!wrap?.classList.contains('buy-hit-wrap')) return;

  void resolveBuyButtonGraphicSrc(socialCasino).then((src) => {
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
 * @param {{ socialCasino?: boolean }} [opts]
 * @returns {HTMLElement | null}
 */
export function ensureBuyHitWrap(btn, opts = {}) {
  if (!btn?.parentNode) return null;
  if (btn.parentElement?.classList.contains('buy-hit-wrap')) {
    return btn.parentElement;
  }
  const wrap = document.createElement('div');
  wrap.className = 'buy-hit-wrap';
  btn.parentNode.insertBefore(wrap, btn);
  wrap.appendChild(btn);
  mountBuyButtonGraphic(wrap, opts);
  return wrap;
}
