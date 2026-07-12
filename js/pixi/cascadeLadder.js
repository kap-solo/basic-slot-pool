/**
 * Cascade multiplier ladder — text row above the reel grid (graphics later).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { sleep } from './easing.js';

/** @typedef {'idle' | 'done' | 'active'} LadderSlotState */

/**
 * @param {object} opts
 * @param {number} [opts.maxSteps=8]
 */
export function createCascadeLadder({ maxSteps = 8 } = {}) {
  const root = new Container();

  /** @type {{ bg: Graphics, label: Text, step: number }[]} */
  const slots = [];

  for (let step = 1; step <= maxSteps; step += 1) {
    const slotRoot = new Container();
    const bg = new Graphics();
    const label = new Text({
      text: `${step}×`,
      style: {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: 14,
        fontWeight: '800',
        fill: 0x6b7a90,
        align: 'center',
      },
    });
    label.anchor.set(0.5);
    bg.addChild(label);
    slotRoot.addChild(bg);
    root.addChild(slotRoot);
    slots.push({ bg, label, step });
  }

  let activeStep = 0;
  let slotW = 32;
  let slotH = 22;
  let fontSize = 12;

  /**
   * @param {LadderSlotState} state
   */
  function paintSlot(bg, label, state) {
    bg.clear();
    const radius = Math.max(4, slotH * 0.28);
    bg.roundRect(-slotW / 2, -slotH / 2, slotW, slotH, radius);

    if (state === 'active') {
      bg.fill({ color: 0x1d4ed8, alpha: 0.92 });
      bg.stroke({ color: 0x93c5fd, width: Math.max(1.5, slotH * 0.07), alpha: 0.95 });
      label.style.fill = 0xfff4a8;
      label.alpha = 1;
      label.scale.set(1.08);
      return;
    }

    if (state === 'done') {
      bg.fill({ color: 0x1a2a3d, alpha: 0.88 });
      bg.stroke({ color: 0x4ade80, width: Math.max(1, slotH * 0.05), alpha: 0.55 });
      label.style.fill = 0xa7f3d0;
      label.alpha = 0.88;
      label.scale.set(1);
      return;
    }

    bg.fill({ color: 0x12161e, alpha: 0.72 });
    bg.stroke({ color: 0x2a3548, width: 1, alpha: 0.65 });
    label.style.fill = 0x5c6b82;
    label.alpha = 0.72;
    label.scale.set(1);
  }

  function syncSlotStyles() {
    for (const { bg, label, step } of slots) {
      let state = /** @type {LadderSlotState} */ ('idle');
      if (activeStep > 0) {
        if (step === activeStep) state = 'active';
        else if (step < activeStep) state = 'done';
      }
      paintSlot(bg, label, state);
    }
  }

  return {
    root,

    /**
     * @param {{ boardW: number, boardH: number, cellW: number, ladderBand?: number }} layout
     */
    layout({ boardW, boardH, cellW, ladderBand = 28 }) {
      const inset = Math.max(2, Math.round(cellW * 0.06));
      const maxTotalW = Math.max(1, boardW - inset * 2);

      let gap = Math.max(1, Math.round(cellW * 0.05));
      slotW = (maxTotalW - (maxSteps - 1) * gap) / maxSteps;

      if (slotW < 8) {
        gap = 1;
        slotW = (maxTotalW - (maxSteps - 1) * gap) / maxSteps;
      }

      slotW = Math.max(4, Math.floor(slotW));

      let totalW = maxSteps * slotW + (maxSteps - 1) * gap;
      if (totalW > maxTotalW) {
        const scale = maxTotalW / totalW;
        slotW = Math.max(4, Math.floor(slotW * scale));
        gap = Math.max(1, Math.floor(gap * scale));
        totalW = maxSteps * slotW + (maxSteps - 1) * gap;
      }

      while (totalW > maxTotalW && slotW > 4) {
        slotW -= 1;
        totalW = maxSteps * slotW + (maxSteps - 1) * gap;
      }

      slotH = Math.max(12, Math.min(Math.round(cellW * 0.34), Math.round(slotW * 0.72)));
      fontSize = Math.max(6, Math.min(Math.round(cellW * 0.22), Math.round(slotW * 0.4)));

      let x = -totalW / 2 + slotW / 2;

      for (const { bg, label } of slots) {
        bg.parent.x = x;
        label.style.fontSize = fontSize;
        x += slotW + gap;
      }

      root.y = -boardH / 2 - ladderBand / 2 - 6;
      syncSlotStyles();
    },

    /**
     * Highlight the active cascade step (1 … maxSteps). 0 resets all slots.
     * @param {number} step
     */
    setActiveStep(step) {
      const next = Number.isFinite(step) ? Math.trunc(step) : 0;
      activeStep = Math.max(0, Math.min(maxSteps, next));
      syncSlotStyles();
    },

    reset() {
      activeStep = 0;
      root.alpha = 1;
      root.visible = true;
      syncSlotStyles();
    },

    /**
     * Ease highlights back to the default idle row (still visible for the next spin).
     * @param {{ durationMs?: number }} [opts]
     */
    async fadeOut({ durationMs = 420 } = {}) {
      if (activeStep <= 0) return;

      const steps = 12;
      const stepMs = Math.max(16, Math.round(durationMs / steps));
      const half = Math.floor(steps / 2);

      for (let i = 0; i <= half; i += 1) {
        const t = i / Math.max(1, half);
        root.alpha = 1 - t * 0.55;
        if (i < half) await sleep(stepMs);
      }

      activeStep = 0;
      syncSlotStyles();

      for (let i = 0; i <= half; i += 1) {
        const t = i / Math.max(1, half);
        root.alpha = 0.45 + t * 0.55;
        if (i < half) await sleep(stepMs);
      }

      root.alpha = 1;
      root.visible = true;
    },
  };
}
