/**
 * Animated ledger icons — small Spine instances reusing board symbol assets.
 */

import './bootstrap.js';
import { Application } from 'pixi.js';
import { getSpineData } from './spineAssets.js';
import {
  symbolGlyph,
  symbolLabel,
  symbolLedgerIcon,
  symbolVisual,
} from './symbols.js';
import { createSpineSymbol, playLedgerSpineAnimation } from './symbolView.js';

/** @type {Map<string, import('@esotericsoftware/spine-core').SkeletonData> | null} */
let registry = null;

/** @type {Map<HTMLElement, { app: Application, onTick: (ticker: import('pixi.js').Ticker) => void }>} */
const activeIcons = new Map();

/**
 * @param {Map<string, import('@esotericsoftware/spine-core').SkeletonData>} spineRegistry
 */
export function setLedgerSpineRegistry(spineRegistry) {
  registry = spineRegistry;
}

/**
 * @param {HTMLElement} hostEl
 * @param {string} symbolId
 */
async function readHostIconSize(hostEl) {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const rect = hostEl.getBoundingClientRect();
  const width = rect.width || hostEl.clientWidth;
  const height = rect.height || hostEl.clientHeight;
  return Math.max(32, Math.round(Math.min(width, height) || 46));
}

/**
 * @param {HTMLElement} hostEl
 * @param {string} symbolId
 */
export async function mountLedgerSpineIcon(hostEl, symbolId) {
  if (!registry) return false;

  const data = getSpineData(symbolId, registry);
  if (!data) return false;

  const visual = symbolVisual(symbolId);
  const size = await readHostIconSize(hostEl);
  const app = new Application();

  await app.init({
    width: size,
    height: size,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });

  app.canvas.style.display = 'block';
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';

  // Smaller fit box leaves room for idle motion inside the square host.
  const fitBox = size * 0.72;
  const { root, spine } = createSpineSymbol(data, fitBox, fitBox, visual.animations);
  playLedgerSpineAnimation(spine, visual);
  root.x = app.screen.width / 2;
  root.y = app.screen.height / 2;
  app.stage.addChild(root);

  /** @param {import('pixi.js').Ticker} ticker */
  const onTick = (ticker) => {
    spine.update(ticker.deltaMS / 1000);
  };
  app.ticker.add(onTick);

  hostEl.replaceChildren(app.canvas);
  activeIcons.set(hostEl, { app, onTick });
  return true;
}

/** Tear down all ledger Spine canvases under an optional root. */
export function destroyLedgerSpineIcons(root = document) {
  const hosts = root.querySelectorAll('.ledger-symbol-spine');
  for (const host of hosts) {
    const mount = activeIcons.get(host);
    if (!mount) continue;
    mount.app.ticker.remove(mount.onTick);
    mount.app.destroy(true, { children: true, texture: false, textureSource: false });
    activeIcons.delete(host);
  }
}

/**
 * Append "size × symbol" into a ledger cluster cell (Spine when available, else image/glyph).
 * @param {HTMLElement} parent
 * @param {number} size
 * @param {string} symbolId
 */
export function appendLedgerClusterLabel(parent, size, symbolId) {
  const count = document.createElement('span');
  count.className = 'ledger-entry-count';
  count.textContent = `${size} ×`;
  parent.appendChild(count);

  if (registry?.has(symbolId)) {
    const host = document.createElement('span');
    host.className = 'ledger-symbol-spine';
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', symbolLabel(symbolId));
    parent.appendChild(host);
    void mountLedgerSpineIcon(host, symbolId).then((ok) => {
      if (ok) return;
      host.remove();
      const iconSrc = symbolLedgerIcon(symbolId);
      if (iconSrc) {
        const img = document.createElement('img');
        img.className = 'ledger-symbol-icon';
        img.src = iconSrc;
        img.alt = symbolLabel(symbolId);
        img.decoding = 'async';
        parent.appendChild(img);
        return;
      }
      const glyph = document.createElement('span');
      glyph.className = 'ledger-symbol-glyph';
      glyph.textContent = symbolGlyph(symbolId);
      parent.appendChild(glyph);
    });
    return;
  }

  const iconSrc = symbolLedgerIcon(symbolId);
  if (iconSrc) {
    const img = document.createElement('img');
    img.className = 'ledger-symbol-icon';
    img.src = iconSrc;
    img.alt = symbolLabel(symbolId);
    img.decoding = 'async';
    parent.appendChild(img);
    return;
  }

  const glyph = document.createElement('span');
  glyph.className = 'ledger-symbol-glyph';
  glyph.textContent = symbolGlyph(symbolId);
  parent.appendChild(glyph);
}
