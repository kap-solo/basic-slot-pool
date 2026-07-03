/**
 * Symbol display nodes — tiered placeholder tiles (Spine when assets load).
 */

import { Container, Graphics, Text } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import {
  isPremiumSymbol,
  isWildSymbol,
  symbolGlyph,
  symbolPayBadge,
  symbolTier,
  symbolVisual,
} from './symbols.js';

/** @typedef {'static' | 'spin' | 'land' | 'win'} SymbolState */

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

/** Shared placeholder tile geometry — every tier uses the same cell footprint. */
const TILE_PAD = 0.1;
const TILE_RADIUS = 0.1;

/** @param {number} cellSize */
function tileMetrics(cellSize) {
  const pad = cellSize * TILE_PAD;
  const w = cellSize - pad * 2;
  const h = cellSize - pad * 2;
  const radius = cellSize * TILE_RADIUS;
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
 * @param {number} cellSize
 */
function createOrdinaryPlaceholder(id, cellSize) {
  const visual = symbolVisual(id);
  const root = new Container();
  const { w, h, radius } = tileMetrics(cellSize);

  const bg = new Graphics();
  drawRoundedTile(bg, w, h, radius);
  bg.fill({ color: visual.color, alpha: 0.88 });
  root.addChild(bg);

  const stripe = new Graphics();
  stripe.rect(-w / 2, -h / 2, w, h * 0.22);
  stripe.fill({ color: 0x000000, alpha: 0.18 });
  root.addChild(stripe);

  addBadge(root, 'LOW', 0, -h / 2 + h * 0.11, cellSize * 0.11, {
    fill: 0xd0d8e4,
    letterSpacing: 1,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI, sans-serif',
      fontSize: cellSize * 0.36,
      align: 'center',
    },
  });
  glyph.anchor.set(0.5);
  glyph.y = 0;
  root.addChild(glyph);

  addBadge(root, symbolPayBadge(id), 0, h / 2 - h * 0.14, cellSize * 0.13, {
    fill: 0xe8eef4,
  });

  root.eventMode = 'none';
  return root;
}

/**
 * @param {string} id
 * @param {number} cellSize
 */
function createPremiumPlaceholder(id, cellSize) {
  const visual = symbolVisual(id);
  const root = new Container();
  const { w, h, radius } = tileMetrics(cellSize);

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

  addBadge(root, '★ PREM', 0, -h / 2 + h * 0.12, cellSize * 0.1, {
    fill: 0xffe566,
    letterSpacing: 0.5,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI Emoji, Apple Color Emoji, Segoe UI, sans-serif',
      fontSize: cellSize * 0.44,
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

  addBadge(root, symbolPayBadge(id), 0, h / 2 - h * 0.15, cellSize * 0.15, {
    fill: 0x3a2800,
  });

  root.eventMode = 'none';
  return root;
}

/**
 * @param {string} id
 * @param {number} cellSize
 */
function createWildPlaceholder(id, cellSize) {
  const visual = symbolVisual(id);
  const root = new Container();
  const { w, h, radius } = tileMetrics(cellSize);

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

  addBadge(root, 'WILD', 0, 0, cellSize * 0.16, {
    fill: 0x1a4a28,
    letterSpacing: 2,
  });

  const glyph = new Text({
    text: symbolGlyph(id),
    style: {
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fontSize: cellSize * 0.28,
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
      fontSize: cellSize * 0.09,
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

/**
 * @param {string} id
 * @param {number} cellSize
 */
export function createPlaceholderSymbol(id, cellSize) {
  const tier = symbolTier(id);
  if (tier === 'wild') return createWildPlaceholder(id, cellSize);
  if (tier === 'premium') return createPremiumPlaceholder(id, cellSize);
  return createOrdinaryPlaceholder(id, cellSize);
}

/**
 * @param {import('@esotericsoftware/spine-core').SkeletonData} skeletonData
 * @param {number} cellSize
 * @param {{ idle?: string, land?: string, win?: string }} [animations]
 */
export function createSpineSymbol(skeletonData, cellSize, animations = {}) {
  const spine = new Spine(skeletonData);
  const bounds = skeletonData.width && skeletonData.height
    ? { w: skeletonData.width, h: skeletonData.height }
    : { w: cellSize, h: cellSize };
  const scale = (cellSize * 0.82) / Math.max(bounds.w, bounds.h);
  spine.scale.set(scale);
  spine.eventMode = 'none';

  const idle = animations.idle ?? 'idle';
  if (spine.skeleton.data.findAnimation(idle)) {
    spine.state.setAnimation(0, idle, true);
  }

  return spine;
}

/**
 * @param {object} opts
 * @param {string} opts.id
 * @param {number} opts.cellSize
 * @param {import('@esotericsoftware/spine-core').SkeletonData | null | undefined} opts.spineData
 * @param {SymbolState} [opts.state]
 */
export function createSymbolNode({ id, cellSize, spineData, state = 'static' }) {
  const visual = symbolVisual(id);
  const node = spineData
    ? createSpineSymbol(spineData, cellSize, visual.animations)
    : createPlaceholderSymbol(id, cellSize);

  return {
    root: node,
    setState(nextState) {
      if (!(node instanceof Spine)) return;
      const anim = visual.animations?.[nextState === 'static' ? 'idle' : nextState];
      if (!anim || !node.skeleton.data.findAnimation(anim)) return;
      const loop = nextState === 'win' || nextState === 'static';
      node.state.setAnimation(0, anim, loop);
    },
    setDimmed(dimmed) {
      node.alpha = dimmed ? 0.38 : 1;
    },
    setWinHighlight(on) {
      if (node instanceof Spine && on) {
        this.setState('win');
        return;
      }
      node.scale.set(on ? 1.08 : 1);
    },
  };
}
