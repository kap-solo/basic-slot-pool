/**
 * Cascade multiplier ladder — graphics + Spine row above the reel grid.
 * Indicators are flush (no gap) with square corners until Spine art ships.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { loadSpineAsset } from './spineAssets.js';
import { sleep } from './easing.js';

/** @typedef {'idle' | 'done' | 'active'} LadderSlotState */

/** Future Spine export — drop files under assets/spine/cascade-ladder/. */
export const CASCADE_LADDER_SPINE = {
  skeleton: 'assets/spine/cascade-ladder/cascade-ladder.json',
  atlas: 'assets/spine/cascade-ladder/cascade-ladder.atlas',
  scale: 1,
  designSize: { width: 120, height: 100 },
};

/** Per-slot state tracks — one shared skeleton, instanced per step. */
export const CASCADE_LADDER_ANIMATIONS = {
  idle: 'idle',
  done: 'done',
  active: 'active',
};

/** Authoring aspect — height / width (100 / 120). */
export const CASCADE_LADDER_ASPECT =
  CASCADE_LADDER_SPINE.designSize.height / CASCADE_LADDER_SPINE.designSize.width;

/**
 * Slot size for flush indicators at the design aspect ratio.
 * @param {number} boardW
 * @param {number} cellW
 * @param {number} [maxSteps=8]
 */
export function cascadeLadderSlotSize(boardW, cellW, maxSteps = 8) {
  const inset = Math.max(2, Math.round(cellW * 0.06));
  const maxTotalW = Math.max(1, boardW - inset * 2);
  const slotW = Math.max(4, Math.floor(maxTotalW / maxSteps));
  const slotH = Math.max(4, Math.round(slotW * CASCADE_LADDER_ASPECT));
  return { slotW, slotH, totalW: maxSteps * slotW };
}

/**
 * Reserved ladder band height — matches on-screen indicator height.
 * @param {number} boardW
 * @param {number} cellW
 * @param {number} [maxSteps=8]
 */
export function cascadeLadderBandFor(boardW, cellW, maxSteps = 8) {
  return cascadeLadderSlotSize(boardW, cellW, maxSteps).slotH;
}

/**
 * @returns {Promise<import('@esotericsoftware/spine-core').SkeletonData | null>}
 */
export async function loadCascadeLadderSpine() {
  try {
    const data = await loadSpineAsset(CASCADE_LADDER_SPINE);
    console.info('[Basic Slot] Cascade ladder Spine loaded.');
    return data;
  } catch (err) {
    console.warn('[Basic Slot] Cascade ladder Spine unavailable — using graphics placeholder.', err);
    return null;
  }
}

/** @param {import('@esotericsoftware/spine-core').SkeletonData} data @param {string} name */
function spineAnimHasKeyframes(data, name) {
  return Boolean(data.findAnimation(name));
}

/** @param {Spine} spine */
function applySpinePose(spine) {
  spine.update(0);
}

/**
 * @param {import('@esotericsoftware/spine-core').SkeletonData} skeletonData
 * @param {number} slotW
 * @param {number} slotH
 */
function createSlotSpine(skeletonData, slotW, slotH) {
  const spine = new Spine(skeletonData);
  spine.autoUpdate = false;
  spine.skeleton.setToSetupPose();
  spine.update(0);

  const bounds = spine.getLocalBounds();
  const design = CASCADE_LADDER_SPINE.designSize;
  const contentW = design?.width > 0 ? design.width : bounds.width;
  const contentH = design?.height > 0 ? design.height : bounds.height;
  const scaleX = slotW / Math.max(contentW > 0 ? contentW : slotW, 1);
  const scaleY = slotH / Math.max(contentH > 0 ? contentH : slotH, 1);
  const scale = Math.max(scaleX, scaleY);
  spine.scale.set(scale);
  spine.x = -(bounds.x + bounds.width / 2) * scale;
  spine.y = -(bounds.y + bounds.height / 2) * scale;
  spine.eventMode = 'none';
  return spine;
}

/**
 * @param {object} opts
 * @param {number} [opts.maxSteps=8]
 * @param {import('@esotericsoftware/spine-core').SkeletonData | null} [opts.spineData]
 */
export function createCascadeLadder({ maxSteps = 8, spineData = null } = {}) {
  const root = new Container();
  const useSpine = Boolean(spineData);

  /** @type {{ slotRoot: Container, bg: Graphics, label: Text, spine: Spine | null, step: number }[]} */
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
    slots.push({ slotRoot, bg, label, spine: null, step });
  }

  let activeStep = 0;
  let slotW = 32;
  let slotH = 22;
  let fontSize = 12;

  /** @param {Spine} spine @param {LadderSlotState} state */
  function applySpineState(spine, state) {
    const anim = CASCADE_LADDER_ANIMATIONS[state] ?? CASCADE_LADDER_ANIMATIONS.idle;
    if (!spineAnimHasKeyframes(spine.skeleton.data, anim)) return;
    spine.state.setAnimation(0, anim, state === 'active');
    applySpinePose(spine);
  }

  /** Rebuild Spine instances when layout dimensions change. */
  function syncSpineInstances() {
    if (!spineData) return;
    for (const slot of slots) {
      if (slot.spine) {
        slot.slotRoot.removeChild(slot.spine);
        slot.spine.destroy({ children: true });
        slot.spine = null;
      }
      const spine = createSlotSpine(spineData, slotW, slotH);
      slot.slotRoot.addChild(spine);
      slot.spine = spine;
      slot.bg.visible = false;
      slot.label.visible = false;
    }
  }

  /**
   * @param {Graphics} bg
   * @param {Text} label
   * @param {LadderSlotState} state
   */
  function paintSlotGraphics(bg, label, state) {
    bg.clear();
    bg.rect(-slotW / 2, -slotH / 2, slotW, slotH);

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
    for (const { bg, label, spine, step } of slots) {
      let state = /** @type {LadderSlotState} */ ('idle');
      if (activeStep > 0) {
        if (step === activeStep) state = 'active';
        else if (step < activeStep) state = 'done';
      }
      if (useSpine && spine) {
        applySpineState(spine, state);
      } else {
        bg.visible = true;
        label.visible = true;
        paintSlotGraphics(bg, label, state);
      }
    }
  }

  if (useSpine) {
    syncSpineInstances();
    syncSlotStyles();
  }

  return {
    root,

    /**
     * @param {{ boardW: number, boardH: number, cellW: number, ladderBand?: number, y?: number }} layout
     */
    layout({ boardW, boardH, cellW, ladderBand = 28, y }) {
      const { slotW: nextW, slotH: nextH, totalW } = cascadeLadderSlotSize(boardW, cellW, maxSteps);
      slotW = nextW;
      slotH = nextH;

      fontSize = Math.max(6, Math.min(Math.round(cellW * 0.22), Math.round(slotW * 0.4)));

      let x = -totalW / 2 + slotW / 2;

      for (const { slotRoot, label } of slots) {
        slotRoot.x = x;
        label.style.fontSize = fontSize;
        x += slotW;
      }

      if (useSpine) syncSpineInstances();

      root.y = y ?? (-boardH / 2 - ladderBand / 2 - 6);
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

    /** @param {number} dt */
    tickSpines(dt) {
      if (!useSpine) return;
      for (const { spine } of slots) {
        if (!spine) continue;
        spine.update(dt);
      }
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
