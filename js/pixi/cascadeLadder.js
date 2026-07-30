/**
 * Cascade multiplier ladder — stone-spine indicators above the reel grid.
 * All steps use stone-spine tracks ({n}x-default / {n}x-alert / {n}x-live).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { loadSpineAsset } from './spineAssets.js';
import { sleep } from './easing.js';

/** Live/active → default crossfade at cascade end (ms). */
export const CASCADE_LADDER_DEFAULT_CROSSFADE_MS = 1500;

/** Extra cover so flush neighbours don't show 1px gaps at fractional scale. */
const CASCADE_LADDER_SEAM_BLEED_PX = 1;

/** @param {number} value */
function snapLayoutPx(value) {
  return Math.round(value);
}

/**
 * @param {number} slotW
 * @param {number} slotH
 * @param {number} contentW
 * @param {number} contentH
 */
function ladderSpineCoverScale(slotW, slotH, contentW, contentH) {
  const scaleX = slotW / Math.max(contentW, 1);
  const scaleY = slotH / Math.max(contentH, 1);
  const cover = Math.max(scaleX, scaleY);
  const bleed = 1 + CASCADE_LADDER_SEAM_BLEED_PX / Math.max(1, Math.min(slotW, slotH));
  return Math.round(cover * bleed * 10000) / 10000;
}

/** @typedef {'idle' | 'live' | 'done' | 'active'} LadderSlotState */

/** Stone Spine export — one skeleton; per-step tracks like 1x-default / 1x-alert. */
export const CASCADE_LADDER_SPINE = {
  skeleton: 'assets/spine/stone-spine.json',
  atlas: 'assets/spine/stone-spine.atlas',
  scale: 1,
  designSize: { width: 120, height: 100 },
};

/**
 * Spine track names for one ladder step (1 … 8).
 * @param {number} step
 */
export function cascadeLadderStepTracks(step) {
  const prefix = `${step}x`;
  return {
    idle: `${prefix}-default`,
    active: `${prefix}-alert`,
    live: `${prefix}-live`,
    done: `${prefix}-default`,
  };
}

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
  void cellW;
  const maxTotalW = Math.max(1, boardW);
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
    console.info('[Basic Slot] Cascade ladder stone-spine loaded.');
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

/** Alert/live snaps use 0 mix; live → default uses a long blend at cascade end. */
/** @param {Spine} spine @param {number} step */
function configureLadderSpineMix(spine, step) {
  const tracks = cascadeLadderStepTracks(step);
  const data = spine.state.data;
  const skeletonData = spine.skeleton.data;
  const defaultMixSec = CASCADE_LADDER_DEFAULT_CROSSFADE_MS / 1000;
  for (const from of [tracks.live, tracks.active]) {
    if (!from || from === tracks.idle) continue;
    if (spineAnimHasKeyframes(skeletonData, from) && spineAnimHasKeyframes(skeletonData, tracks.idle)) {
      data.setMix(from, tracks.idle, defaultMixSec);
    }
  }
  if (
    tracks.active &&
    tracks.live &&
    tracks.active !== tracks.live &&
    spineAnimHasKeyframes(skeletonData, tracks.active) &&
    spineAnimHasKeyframes(skeletonData, tracks.live)
  ) {
    data.setMix(tracks.active, tracks.live, 0);
  }
}

/** @param {Spine} spine @param {string} anim @param {boolean} loop @param {boolean} [snap] */
function setSpineAnimation(spine, anim, loop, snap = false) {
  if (snap) {
    const current = spine.state.getCurrent(0);
    const fromAnim = current?.animation?.name;
    if (fromAnim && fromAnim !== anim) {
      spine.state.data.setMix(fromAnim, anim, 0);
    }
  }
  return spine.state.setAnimation(0, anim, loop);
}

/** @param {{ spine: Spine | null, step: number, spineState: LadderSlotState | null }} slot @param {number} mixSec */
function crossfadeSpineToDefault(slot, mixSec) {
  const { spine, step } = slot;
  const tracks = cascadeLadderStepTracks(step);
  if (!spine || !spineAnimHasKeyframes(spine.skeleton.data, tracks.idle)) return;

  const current = spine.state.getCurrent(0);
  const fromAnim = current?.animation?.name;
  if (fromAnim && fromAnim !== tracks.idle) {
    spine.state.data.setMix(fromAnim, tracks.idle, mixSec);
  }
  spine.state.setAnimation(0, tracks.idle, true);
  slot.spineState = 'idle';
}

/** @param {Spine} spine */
function applySpinePose(spine) {
  spine.update(0);
}

/**
 * @param {import('@esotericsoftware/spine-core').SkeletonData} skeletonData
 * @param {number} slotW
 * @param {number} slotH
 * @param {number} step
 */
function createSlotSpine(skeletonData, slotW, slotH, step) {
  const spine = new Spine(skeletonData);
  spine.autoUpdate = false;
  spine.skeleton.setToSetupPose();

  const tracks = cascadeLadderStepTracks(step);
  if (spineAnimHasKeyframes(spine.skeleton.data, tracks.idle)) {
    spine.state.setAnimation(0, tracks.idle, true);
  }
  spine.update(0);

  const bounds = spine.getLocalBounds();
  const design = CASCADE_LADDER_SPINE.designSize;
  const contentW = design?.width > 0 ? design.width : bounds.width;
  const contentH = design?.height > 0 ? design.height : bounds.height;
  const scale = ladderSpineCoverScale(
    slotW,
    slotH,
    contentW > 0 ? contentW : slotW,
    contentH > 0 ? contentH : slotH,
  );
  spine.scale.set(scale);
  spine.x = snapLayoutPx(-(bounds.x + bounds.width / 2) * scale);
  spine.y = snapLayoutPx(-(bounds.y + bounds.height / 2) * scale);
  spine.roundPixels = true;
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
  root.roundPixels = true;

  /** @type {{ slotRoot: Container, bg: Graphics, label: Text, spine: Spine | null, step: number, spineState: LadderSlotState | null }[]} */
  const slots = [];

  for (let step = 1; step <= maxSteps; step += 1) {
    const slotRoot = new Container();
    slotRoot.roundPixels = true;
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
    slots.push({ slotRoot, bg, label, spine: null, step, spineState: null });
  }

  let activeStep = 0;
  let slotW = 32;
  let slotH = 22;
  let fontSize = 12;

  /** @param {typeof slots[number]} slot @param {LadderSlotState} state */
  function applySpineState(slot, state) {
    const { spine, step } = slot;
    const tracks = cascadeLadderStepTracks(step);
    if (!spine || !tracks) return;
    if (slot.spineState === state) return;
    slot.spineState = state;
    const anim =
      state === 'active'
        ? tracks.active
        : state === 'live'
          ? tracks.live ?? tracks.done ?? tracks.idle
          : state === 'done'
            ? tracks.done ?? tracks.idle
            : tracks.idle;
    if (!spineAnimHasKeyframes(spine.skeleton.data, anim)) return;
    const snap = state === 'live' || state === 'done' || state === 'idle';
    setSpineAnimation(spine, anim, state !== 'active', snap);
    applySpinePose(spine);
  }

  /** @param {typeof slots[number]} slot */
  function destroySlotSpine(slot) {
    if (!slot.spine) return;
    slot.slotRoot.removeChild(slot.spine);
    slot.spine.destroy({ children: true });
    slot.spine = null;
    slot.spineState = null;
  }

  /** Create or refresh Spine instances for wired steps when layout dimensions change. */
  function syncSpineInstances() {
    if (!spineData) return;
    for (const slot of slots) {
      destroySlotSpine(slot);
      const spine = createSlotSpine(spineData, slotW, slotH, slot.step);
      configureLadderSpineMix(spine, slot.step);
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
    for (const slot of slots) {
      const { bg, label, spine, step } = slot;
      let state = /** @type {LadderSlotState} */ ('idle');
      if (activeStep > 0) {
        if (step === activeStep) state = 'active';
        else if (step < activeStep) state = 'live';
      }
      if (spine) {
        applySpineState(slot, state);
        bg.visible = false;
        label.visible = false;
      } else {
        bg.visible = true;
        label.visible = true;
        paintSlotGraphics(bg, label, state);
      }
    }
  }

  if (spineData) {
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
        slotRoot.x = snapLayoutPx(x);
        label.style.fontSize = fontSize;
        x += slotW;
      }

      if (spineData) syncSpineInstances();

      root.x = 0;
      root.y = snapLayoutPx(y ?? -boardH / 2 - ladderBand / 2 - 6);
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
      for (const { spine } of slots) {
        if (!spine) continue;
        spine.update(dt);
      }
    },

    /**
     * Crossfade live/active stones back to default when the cascade ends.
     * @param {{ durationMs?: number }} [opts]
     */
    async fadeOut({ durationMs = CASCADE_LADDER_DEFAULT_CROSSFADE_MS } = {}) {
      if (activeStep <= 0) return;

      const prevActive = activeStep;
      const mixSec = durationMs / 1000;
      activeStep = 0;
      root.alpha = 1;
      root.visible = true;

      let crossfaded = false;

      for (const slot of slots) {
        if (slot.spine && slot.step <= prevActive) {
          crossfadeSpineToDefault(slot, mixSec);
          crossfaded = true;
          continue;
        }
        if (!slot.spine) {
          const { bg, label, step } = slot;
          const state = /** @type {LadderSlotState} */ ('idle');
          bg.visible = true;
          label.visible = true;
          paintSlotGraphics(bg, label, state);
          if (step <= prevActive) slot.spineState = state;
        }
      }

      if (crossfaded) await sleep(durationMs);
    },
  };
}
