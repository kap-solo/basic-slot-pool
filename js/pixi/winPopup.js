/**
 * Momentary win amount label — centred on the board, floats up and fades out.
 */

import { Container, Text } from 'pixi.js';
import { sleep } from './easing.js';

/**
 * @param {Container} layer
 * @param {string} label
 * @param {{ cellW: number, cellH: number, durationMs: number }} opts
 */
export async function playWinPopup(layer, label, { cellW, cellH, durationMs }) {
  layer.removeChildren();

  const fontSize = Math.max(20, Math.round(cellW * 0.52));
  const text = new Text({
    text: label,
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize,
      fontWeight: '800',
      fill: 0xfff4a8,
      stroke: { color: 0x14532d, width: Math.max(3, fontSize * 0.1) },
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
  text.anchor.set(0.5);
  text.alpha = 0;
  text.scale.set(0.8);
  layer.addChild(text);

  const steps = 14;
  const stepMs = Math.max(16, Math.round(durationMs / steps));
  const driftY = -cellH * 0.45;

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    let alpha = 1;
    if (t < 0.12) alpha = t / 0.12;
    else if (t > 0.72) alpha = Math.max(0, (1 - t) / 0.28);

    text.alpha = alpha;
    text.y = driftY * Math.min(1, t / 0.85);
    text.scale.set(0.8 + 0.2 * Math.min(1, t / 0.18));
    if (i < steps) await sleep(stepMs);
  }

  layer.removeChildren();
  text.destroy();
}
