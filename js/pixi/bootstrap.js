/** Spine-pixi-v8 side effects expect PIXI on window in browser ESM builds. */
import * as PIXI from 'pixi.js';

if (typeof window !== 'undefined') {
  window.PIXI = PIXI;
}

export { PIXI };
