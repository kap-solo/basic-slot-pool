/**
 * Momentary win amount label — centred on the board or anchored per cluster.
 */

import { Container, Text } from 'pixi.js';
import { easeOutCubic } from './easing.js';

const POPUP_FADE_IN_RATIO = 0.12;
const POPUP_FADE_OUT_START_RATIO = 0.72;
const POPUP_SCALE_IN_RATIO = 0.18;
const POPUP_DRIFT_RATIO = 0.85;
const POPUP_COUNT_UP_RATIO = 0.45;

/**
 * @typedef {object} WinPopupContent
 * @property {string} amount — e.g. "+$0.20"
 * @property {number} [amountFrom] — display-currency start for cluster-size count-up
 * @property {number} [amountTo] — display-currency end (should match amount)
 * @property {(value: number) => string} [formatAmount] — balance-style ticks during count-up (e.g. 2 dp for USD)
 * @property {string | null} [cascadeLabel] — ladder line above amount, e.g. "×2"
 */

/**
 * @typedef {object} WinPopupPlacement
 * @property {WinPopupContent} content
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @param {WinPopupContent} content
 * @param {number} cellW
 * @param {number} cellH
 */
function createWinPopupStack(content, cellW, cellH) {
  const amountFontSize = Math.max(20, Math.round(cellW * 0.52));
  const cascadeFontSize = Math.max(14, Math.round(cellW * 0.36));
  const spacing = Math.max(4, Math.round(cellH * 0.08));

  const formatTick = content.formatAmount ?? ((value) => content.amount);

  const fromAmount = content.amountFrom;
  const toAmount = content.amountTo ?? fromAmount;
  const centsFrom = Number.isFinite(fromAmount) ? Math.round(fromAmount * 100) : 0;
  const centsTo = Number.isFinite(toAmount) ? Math.round(toAmount * 100) : centsFrom;
  const animateCount = centsTo > centsFrom;

  const stack = new Container();
  let cursorY = 0;

  if (content.cascadeLabel) {
    const cascadeText = new Text({
      text: content.cascadeLabel,
      style: {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: cascadeFontSize,
        fontWeight: '700',
        fill: 0xa7f3d0,
        stroke: { color: 0x14532d, width: Math.max(2, cascadeFontSize * 0.1) },
        align: 'center',
        dropShadow: {
          color: 0x000000,
          alpha: 0.4,
          blur: 3,
          distance: 2,
          angle: Math.PI / 2,
        },
      },
    });
    cascadeText.anchor.set(0.5, 0);
    cascadeText.x = 0;
    cascadeText.y = cursorY;
    stack.addChild(cascadeText);
    cursorY += cascadeText.height + spacing;
  }

  const amountText = new Text({
    text: animateCount ? formatTick(centsFrom / 100) : content.amount,
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: amountFontSize,
      fontWeight: '800',
      fill: 0xfff4a8,
      stroke: { color: 0x14532d, width: Math.max(3, amountFontSize * 0.1) },
      align: 'center',
      dropShadow: {
        color: 0x000000,
        alpha: 0.45,
        blur: 4,
        distance: 2,
        angle: Math.PI / 2,
      },
    },
  });
  amountText.anchor.set(0.5, 0);
  amountText.x = 0;
  amountText.y = cursorY;
  stack.addChild(amountText);

  const totalHeight = cursorY + amountText.height;
  stack.pivot.set(0, totalHeight / 2);

  return {
    stack,
    amountText,
    animateCount,
    centsFrom,
    centsTo,
    formatTick,
    content,
  };
}

/**
 * @param {Container} layer
 * @param {WinPopupContent} content
 * @param {{ cellW: number, cellH: number, durationMs: number, formatAmount?: (value: number) => string, x?: number, y?: number }} [opts]
 */
export async function playWinPopup(layer, content, { cellW, cellH, durationMs, formatAmount, x = 0, y = 0 }) {
  const popupContent = formatAmount ? { ...content, formatAmount } : content;
  await playWinPopups(layer, [{ content: popupContent, x, y }], { cellW, cellH, durationMs });
}

/**
 * Show one or more win popups on the same clock (same cascade step).
 * @param {Container} layer
 * @param {WinPopupPlacement[]} popups
 * @param {{ cellW: number, cellH: number, durationMs: number }} opts
 */
export async function playWinPopups(layer, popups, { cellW, cellH, durationMs }) {
  if (!popups.length) return;

  layer.removeChildren();

  const driftY = -cellH * 0.45;
  const entries = popups.map(({ content, x = 0, y = 0 }) => {
    const built = createWinPopupStack(content, cellW, cellH);
    built.stack.alpha = 0;
    built.stack.scale.set(0.8);
    built.baseX = x;
    built.baseY = y;
    layer.addChild(built.stack);
    return built;
  });

  const countMs = Math.round(durationMs * POPUP_COUNT_UP_RATIO);

  await new Promise((resolve) => {
    const start = performance.now();

    function frame(now) {
      const elapsedMs = now - start;
      const t = Math.min(1, elapsedMs / durationMs);
      let alpha = 1;
      if (t < POPUP_FADE_IN_RATIO) {
        alpha = easeOutCubic(t / POPUP_FADE_IN_RATIO);
      } else if (t > POPUP_FADE_OUT_START_RATIO) {
        alpha = easeOutCubic(Math.max(0, (1 - t) / (1 - POPUP_FADE_OUT_START_RATIO)));
      }

      const drift = driftY * easeOutCubic(Math.min(1, t / POPUP_DRIFT_RATIO));
      const scale = 0.8 + 0.2 * easeOutCubic(Math.min(1, t / POPUP_SCALE_IN_RATIO));

      for (const entry of entries) {
        if (entry.animateCount) {
          const countT = countMs > 0 ? easeOutCubic(Math.min(1, elapsedMs / countMs)) : 1;
          const cents = Math.round(entry.centsFrom + (entry.centsTo - entry.centsFrom) * countT);
          entry.amountText.text = entry.formatTick(cents / 100);
        }

        entry.stack.alpha = alpha;
        entry.stack.x = entry.baseX;
        entry.stack.y = entry.baseY + drift;
        entry.stack.scale.set(scale);
      }

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });

  for (const entry of entries) {
    if (entry.animateCount) {
      entry.amountText.text = entry.content.amount;
    }
  }

  layer.removeChildren();
  for (const entry of entries) {
    entry.stack.destroy({ children: true });
  }
}
