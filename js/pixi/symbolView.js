/**
 * Symbol display nodes — tiered placeholder tiles (Spine when assets load).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import {
  SPINE_SYMBOL_FIT_RATIO,
  symbolGlyph,
  symbolLabel,
  symbolPayBadge,
  symbolTier,
  symbolVisual,
} from './symbols.js';
import { PERFORMANCE_BLOB_SYMBOL } from './performanceBlob.js';
import { animateAlphaTargets } from './easing.js';
import { TIMING } from './timing.js';
import { MAX_TALL_SPAN } from '../tall-symbols.js';

/** @typedef {'static' | 'spin' | 'land' | 'cascade' | 'win' | 'dissolve'} SymbolState */

/**
 * @param {import('@esotericsoftware/spine-core').SkeletonData} data
 * @param {string | null | undefined} name
 */
function spineAnimHasKeyframes(data, name) {
  if (!name) return false;
  const anim = data.findAnimation(name);
  return !!anim && anim.timelines.length > 0;
}

/**
 * @param {{ animations?: import('./symbols.js').SymbolAnimations }} visual
 * @param {SymbolState} state
 */
function resolveSpineAnimName(visual, state) {
  if (state === 'static') return visual.animations?.idle ?? 'idle';
  return visual.animations?.[state] ?? state;
}

/**
 * @param {Spine} spine
 * @param {{ animations?: import('./symbols.js').SymbolAnimations }} visual
 */
function queueIdleAfterOneShot(spine, visual, entry) {
  const idle = visual.animations?.idle ?? 'idle';
  if (!spineAnimHasKeyframes(spine.skeleton.data, idle)) return;
  entry.listener = {
    complete: () => {
      spine.state.setAnimation(0, idle, true);
    },
  };
}

/**
 * @param {Spine} spine
 * @param {{ animations?: import('./symbols.js').SymbolAnimations }} visual
 * @param {SymbolState} state
 */
function playSpineSymbolState(spine, visual, state) {
  const data = spine.skeleton.data;

  if (state === 'dissolve') {
    const dissolve = visual.animations?.dissolve ?? 'dissolve';
    if (spineAnimHasKeyframes(data, dissolve)) {
      spine.state.setAnimation(0, dissolve, false);
    }
    return;
  }

  const primary = resolveSpineAnimName(visual, state);
  const loop = state === 'static' || state === 'win' || state === 'spin';

  if (spineAnimHasKeyframes(data, primary)) {
    const entry = spine.state.setAnimation(0, primary, loop);
    if (!loop) queueIdleAfterOneShot(spine, visual, entry);
    return;
  }

  if (state === 'cascade') {
    const land = visual.animations?.land ?? 'land';
    if (spineAnimHasKeyframes(data, land)) {
      const entry = spine.state.setAnimation(0, land, false);
      queueIdleAfterOneShot(spine, visual, entry);
    }
  }
}

/**
 * @param {Spine} spine
 * @param {string} animName
 */
function playSpineAnimationOnce(spine, animName) {
  return new Promise((resolve) => {
    if (!spineAnimHasKeyframes(spine.skeleton.data, animName)) {
      resolve();
      return;
    }
    const entry = spine.state.setAnimation(0, animName, false);
    entry.listener = {
      complete: () => resolve(),
    };
  });
}

/**
 * @param {import('pixi.js').Container} root
 * @param {number} durationMs
 */
function animateDissolveFallback(root, durationMs) {
  return new Promise((resolve) => {
    const startScale = root.scale.x;
    const startAlpha = root.alpha;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 2;
      root.alpha = startAlpha * (1 - eased);
      root.scale.set(startScale * (1 - eased * 0.35));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/** Blob pop — alpha fade only; melt Spine track handles the visual. */
function animateBlobDissolveFallback(root, durationMs) {
  return new Promise((resolve) => {
    const startAlpha = root.alpha;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 2;
      root.alpha = startAlpha * (1 - eased);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/**
 * Ledger icon — play win once when available, then loop idle.
 * @param {Spine} spine
 * @param {{ animations?: import('./symbols.js').SymbolAnimations }} visual
 */
export function playLedgerSpineAnimation(spine, visual) {
  const data = spine.skeleton.data;
  const win = visual.animations?.win ?? 'win';
  const idle = visual.animations?.idle ?? 'idle';

  if (spineAnimHasKeyframes(data, win)) {
    const entry = spine.state.setAnimation(0, win, false);
    if (spineAnimHasKeyframes(data, idle)) {
      entry.listener = {
        complete: () => {
          spine.state.setAnimation(0, idle, true);
        },
      };
    }
    return;
  }

  if (spineAnimHasKeyframes(data, idle)) {
    spine.state.setAnimation(0, idle, true);
  }
}

export const SYMBOL_DIM_ALPHA = 0.38;

/**
 * @param {Container} root
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {number} fontSize
 * @param {object} [style]
 */
function addBadge(root, text, x, y, fontSize, style = {}) {
  const label = new Text({
    text,
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize,
      fontWeight: '800',
      fill: 0xffffff,
      align: 'center',
      ...style,
    },
  });
  label.anchor.set(0.5);
  label.x = x;
  label.y = y;
  root.addChild(label);
  return label;
}

/** Shared placeholder tile geometry — width = one cell, height = span × cell. */
const TILE_PAD = 0.1;
const TILE_RADIUS = 0.1;

/**
 * @param {number} cellW
 * @param {number} blockHeight — total vertical span in px
 */
function tileMetrics(cellW, blockHeight) {
  const pad = Math.min(cellW, blockHeight) * TILE_PAD;
  const w = cellW - pad * 2;
  const h = blockHeight - pad * 2;
  const radius = Math.min(cellW, blockHeight) * TILE_RADIUS;
  return { pad, w, h, radius };
}

/**
 * @param {Graphics} g
 * @param {number} w
 * @param {number} h
 * @param {number} radius
 */
function drawRoundedTile(g, w, h, radius) {
  g.roundRect(-w / 2, -h / 2, w, h, radius);
}

/**
 * @param {string} id
 * @param {number} cellW
 * @param {number} blockHeight
 * @param {number} [span]
 */
function createOrdinaryPlaceholder(id, cellW, blockHeight, span = 1) {
  const visual = symbolVisual(id);
  const root = new Container();
  const { w, h, radius } = tileMetrics(cellW, blockHeight);

  const bg = new Graphics();
  drawRoundedTile(bg, w, h, radius);
  bg.fill({ color: visual.color, alpha: 0.88 });
  root.addChild(bg);

  const stripe = new Graphics();
  stripe.rect(-w / 2, -h / 2, w, h * 0.22);
  stripe.fill({ color: 0x000000, alpha: 0.18 });
  root.addChild(stripe);

  addBadge(root, 'LOW', 0, -h / 2 + h * 0.11, cellW * 0.11, {
    fill: 0xd0d8e4,
    letterSpacing: 1,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI, sans-serif',
      fontSize: cellW * 0.36,
      align: 'center',
    },
  });
  glyph.anchor.set(0.5);
  glyph.y = 0;
  root.addChild(glyph);

  addBadge(root, symbolPayBadge(id), 0, h / 2 - h * 0.14, cellW * 0.13, {
    fill: 0xe8eef4,
  });

  root.eventMode = 'none';
  return root;
}

function createBlobPlaceholder(cellW, cellH) {
  const root = new Container();
  const { w, h } = tileMetrics(cellW, cellH);
  const side = Math.min(w, h) * 0.88;

  const bg = new Graphics();
  bg.rect(-side / 2, -side / 2, side, side);
  bg.fill({ color: 0x16a34a, alpha: 1 });
  root.addChild(bg);

  const border = new Graphics();
  border.rect(-side / 2, -side / 2, side, side);
  border.stroke({ color: 0xbbf7d0, width: Math.max(2, cellW * 0.04), alpha: 1 });
  root.addChild(border);

  root.eventMode = 'none';
  return root;
}

/** Single-height premium tile only — never used for merged tall blocks. */
function createPremiumPlaceholder(id, cellW, cellH) {
  const visual = symbolVisual(id);
  const root = new Container();
  const { w, h, radius } = tileMetrics(cellW, cellH);

  const bg = new Graphics();
  drawRoundedTile(bg, w, h, radius);
  bg.fill({ color: visual.color, alpha: 0.95 });
  root.addChild(bg);

  const shine = new Graphics();
  drawRoundedTile(shine, w * 0.88, h * 0.42, radius * 0.7);
  shine.y = -h * 0.18;
  shine.fill({ color: visual.accent ?? 0xffffff, alpha: 0.35 });
  root.addChild(shine);

  const gem = new Graphics();
  gem.moveTo(0, -h * 0.38);
  gem.lineTo(w * 0.12, -h * 0.28);
  gem.lineTo(0, -h * 0.18);
  gem.lineTo(-w * 0.12, -h * 0.28);
  gem.closePath();
  gem.fill({ color: 0xffe566, alpha: 0.9 });
  root.addChild(gem);

  addBadge(root, '★ PREM', 0, -h / 2 + h * 0.12, cellW * 0.1, {
    fill: 0xffe566,
    letterSpacing: 0.5,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI, sans-serif',
      fontSize: cellW * 0.44,
      align: 'center',
      dropShadow: {
        color: 0x000000,
        alpha: 0.45,
        blur: 2,
        distance: 1,
      },
    },
  });
  glyph.anchor.set(0.5);
  glyph.y = 0;
  root.addChild(glyph);

  const payPill = new Graphics();
  payPill.roundRect(-w * 0.22, h / 2 - h * 0.24, w * 0.44, h * 0.18, h * 0.09);
  payPill.fill({ color: 0xffd700, alpha: 0.95 });
  root.addChild(payPill);

  addBadge(root, symbolPayBadge(id), 0, h / 2 - h * 0.15, cellW * 0.15, {
    fill: 0x3a2800,
  });

  root.eventMode = 'none';
  return root;
}

/**
 * Double-height-only premium tile — used exclusively when adjacent rows merge.
 * Distinct from the single-height premium placeholder (not a scaled copy).
 */
function createPremiumTallPlaceholder(id, cellW, cellH) {
  const visual = symbolVisual(id);
  const root = new Container();
  const blockHeight = cellH * MAX_TALL_SPAN;
  const { w, h, radius } = tileMetrics(cellW, blockHeight);

  const bg = new Graphics();
  drawRoundedTile(bg, w, h, radius);
  bg.fill({ color: 0x120c22, alpha: 0.96 });
  root.addChild(bg);

  const panel = new Graphics();
  drawRoundedTile(panel, w * 0.86, h * 0.9, radius * 0.85);
  panel.fill({ color: visual.color, alpha: 0.92 });
  root.addChild(panel);

  const railW = Math.max(4, w * 0.07);
  for (const xSign of [-1, 1]) {
    const rail = new Graphics();
    rail.roundRect(xSign * (w / 2 - railW * 0.6), -h * 0.42, railW, h * 0.84, railW * 0.4);
    rail.fill({ color: 0xffe566, alpha: 0.82 });
    root.addChild(rail);
  }

  const seam = new Graphics();
  seam.moveTo(-w / 2 + 10, 0);
  seam.lineTo(w / 2 - 10, 0);
  seam.stroke({ color: 0xffd700, width: 1.5, alpha: 0.35 });
  root.addChild(seam);

  addBadge(root, '◆ DOUBLE', 0, -h / 2 + h * 0.09, cellW * 0.11, {
    fill: 0xffe566,
    letterSpacing: 1.5,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI, sans-serif',
      fontSize: cellW * 0.58,
      align: 'center',
      dropShadow: {
        color: 0x000000,
        alpha: 0.5,
        blur: 3,
        distance: 2,
      },
    },
  });
  glyph.anchor.set(0.5);
  glyph.y = -h * 0.1;
  root.addChild(glyph);

  const name = new Text({
    text: symbolLabel(id).toUpperCase(),
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: cellW * 0.13,
      fontWeight: '800',
      fill: visual.accent ?? 0xffffff,
      letterSpacing: 1.2,
      align: 'center',
    },
  });
  name.anchor.set(0.5);
  name.y = h * 0.14;
  root.addChild(name);

  const payPill = new Graphics();
  payPill.roundRect(-w * 0.26, h / 2 - h * 0.16, w * 0.52, h * 0.11, h * 0.055);
  payPill.fill({ color: 0xffd700, alpha: 0.95 });
  root.addChild(payPill);

  addBadge(root, symbolPayBadge(id), 0, h / 2 - h * 0.105, cellW * 0.14, {
    fill: 0x3a2800,
  });

  root.eventMode = 'none';
  return root;
}

/**
 * @param {string} id
 * @param {number} cellW
 * @param {number} blockHeight
 */
function createWildPlaceholder(id, cellW, blockHeight) {
  const visual = symbolVisual(id);
  const root = new Container();
  const { w, h, radius } = tileMetrics(cellW, blockHeight);

  const bg = new Graphics();
  drawRoundedTile(bg, w, h, radius);
  bg.fill({ color: visual.color, alpha: 0.95 });
  root.addChild(bg);

  const inner = new Graphics();
  drawRoundedTile(inner, w * 0.82, h * 0.82, radius * 0.8);
  inner.fill({ color: visual.accent ?? 0x3ecf6e, alpha: 0.35 });
  root.addChild(inner);

  const sash = new Graphics();
  sash.rect(-w / 2, -h * 0.12, w, h * 0.24);
  sash.fill({ color: 0xffe566, alpha: 0.92 });
  root.addChild(sash);

  addBadge(root, 'WILD', 0, 0, cellW * 0.16, {
    fill: 0x1a4a28,
    letterSpacing: 2,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: cellW * 0.28,
      fontWeight: '900',
      fill: 0xffffff,
      align: 'center',
    },
  });
  glyph.anchor.set(0.5);
  glyph.y = -h * 0.14;
  root.addChild(glyph);

  const sub = new Text({
    text: 'substitutes',
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: cellW * 0.09,
      fill: 0xffffff,
      alpha: 0.75,
    },
  });
  sub.anchor.set(0.5);
  sub.y = h * 0.28;
  root.addChild(sub);

  root.eventMode = 'none';
  return root;
}

function createScatterPlaceholder(id, cellW, cellH) {
  const visual = symbolVisual(id);
  const root = new Container();
  const { w, h, radius } = tileMetrics(cellW, cellH);

  const bg = new Graphics();
  drawRoundedTile(bg, w, h, radius);
  bg.fill({ color: visual.color, alpha: 0.95 });
  root.addChild(bg);

  const ring = new Graphics();
  drawRoundedTile(ring, w * 0.9, h * 0.9, radius * 0.85);
  ring.stroke({ color: visual.accent ?? 0xc080ff, width: Math.max(2, cellW * 0.05), alpha: 0.9 });
  root.addChild(ring);

  addBadge(root, 'SCATTER', 0, -h / 2 + h * 0.12, cellW * 0.1, {
    fill: visual.accent ?? 0xc080ff,
    letterSpacing: 0.8,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI, sans-serif',
      fontSize: cellW * 0.42,
      align: 'center',
      fill: 0xfff4d6,
      dropShadow: {
        color: 0x000000,
        alpha: 0.4,
        blur: 2,
        distance: 1,
      },
    },
  });
  glyph.anchor.set(0.5);
  glyph.y = h * 0.04;
  root.addChild(glyph);

  root.eventMode = 'none';
  return root;
}

/**
 * @param {string} id
 * @param {number} cellW
 * @param {number} cellH
 * @param {number} [span]
 */
export function createPlaceholderSymbol(id, cellW, cellH, span = 1) {
  if (id === PERFORMANCE_BLOB_SYMBOL) return createBlobPlaceholder(cellW, cellH);
  const tier = symbolTier(id);
  if (tier === 'scatter') return createScatterPlaceholder(id, cellW, cellH);
  if (tier === 'wild') return createWildPlaceholder(id, cellW, cellH * span);
  if (tier === 'premium' && span > 1) return createPremiumTallPlaceholder(id, cellW, cellH);
  if (tier === 'premium') return createPremiumPlaceholder(id, cellW, cellH);
  return createOrdinaryPlaceholder(id, cellW, cellH * span, span);
}

/**
 * @param {import('@esotericsoftware/spine-core').SkeletonData} skeletonData
 * @param {number} cellW
 * @param {number} blockHeight
 * @param {{ idle?: string, land?: string, win?: string }} [animations]
 * @param {{ designSize?: { width: number, height: number } }} [spineMeta]
 * @returns {{ root: Container, spine: Spine }}
 */
export function createSpineSymbol(skeletonData, cellW, blockHeight, animations = {}, spineMeta = {}) {
  const spine = new Spine(skeletonData);
  spine.skeleton.setToSetupPose();
  spine.update(0);

  const bounds = spine.getLocalBounds();
  const fit = Math.min(cellW, blockHeight) * SPINE_SYMBOL_FIT_RATIO;
  const design = spineMeta.designSize;
  const contentW = design?.width > 0 ? design.width : bounds.width;
  const contentH = design?.height > 0 ? design.height : bounds.height;
  const scale =
    fit / Math.max(contentW > 0 ? contentW : cellW, contentH > 0 ? contentH : blockHeight, 1);
  spine.scale.set(scale);
  spine.x = -(bounds.x + bounds.width / 2) * scale;
  spine.y = -(bounds.y + bounds.height / 2) * scale;
  spine.eventMode = 'none';

  const idle = animations.idle ?? 'idle';
  if (spineAnimHasKeyframes(spine.skeleton.data, idle)) {
    spine.state.setAnimation(0, idle, true);
  }

  const root = new Container();
  root.eventMode = 'none';
  root.addChild(spine);
  return { root, spine };
}

/**
 * @param {object} opts
 * @param {string} opts.id
 * @param {number} opts.cellW
 * @param {number} opts.cellH
 * @param {number} [opts.span]
 * @param {import('@esotericsoftware/spine-core').SkeletonData | null | undefined} opts.spineData
 * @param {SymbolState} [opts.state]
 */
export function createSymbolNode({ id, cellW, cellH, span = 1, spineData, state = 'static' }) {
  const blockHeight = cellH * span;
  const visual = symbolVisual(id);
  const useTallPlaceholder = symbolTier(id) === 'premium' && span > 1;
  /** @type {Container} */
  let root;
  /** @type {Spine | null} */
  let spine = null;

  if (spineData && !useTallPlaceholder) {
    const built = createSpineSymbol(spineData, cellW, blockHeight, visual.animations, visual.spine ?? {});
    root = built.root;
    spine = built.spine;
    if (state !== 'static') {
      playSpineSymbolState(spine, visual, state);
    }
  } else {
    root = createPlaceholderSymbol(id, cellW, cellH, span);
  }

  return {
    root,
    spine,
    symbolId: id,
    span,
    anchorRow: 0,
    setState(nextState) {
      if (!spine) return;
      playSpineSymbolState(spine, visual, nextState);
    },
    setDimmed(dimmed) {
      root.alpha = dimmed ? SYMBOL_DIM_ALPHA : 1;
    },
    async animateDimmed(dimmed, { durationMs = 280 } = {}) {
      const target = dimmed ? SYMBOL_DIM_ALPHA : 1;
      const from = root.alpha;
      if (Math.abs(from - target) < 0.02) {
        root.alpha = target;
        return;
      }
      await animateAlphaTargets([{ object: root, from, to: target }], { durationMs });
    },
    resetScale() {
      root.scale.set(1);
    },
    setWinHighlight(on) {
      if (spine && on) {
        this.setState('win');
        return;
      }
      root.scale.set(on ? 1.08 : 1);
    },
    /**
     * Blob pop — Spine `melt` when available, else alpha-only fallback (no scale shrink).
     * @param {{ durationMs?: number, speed?: number }} [opts]
     */
    async playDissolve({ durationMs, speed = 1 } = {}) {
      const ms = durationMs ?? Math.max(80, TIMING.cascadePopMs / speed);
      if (spine) {
        const dissolve = visual.animations?.dissolve ?? 'dissolve';
        if (spineAnimHasKeyframes(spine.skeleton.data, dissolve)) {
          await playSpineAnimationOnce(spine, dissolve);
          return;
        }
      }
      const fallback =
        id === PERFORMANCE_BLOB_SYMBOL ? animateBlobDissolveFallback : animateDissolveFallback;
      await fallback(root, ms);
    },
  };
}

