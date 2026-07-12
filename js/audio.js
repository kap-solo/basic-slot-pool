/**
 * Game audio — wire paths when files exist under assets/audio/.
 */

/** @type {{ music: string | null, sfx: Record<string, string> }} */
export const GAME_AUDIO_ASSETS = {
  music: null,
  sfx: {
    reels: 'assets/audio/reels3.wav',
  },
};

/** Paths to front-load during the Suki preloader. */
export function buildPreloadAssets() {
  const assets = [];
  if (GAME_AUDIO_ASSETS.music) {
    assets.push({ src: GAME_AUDIO_ASSETS.music, type: 'audio' });
  }
  for (const src of Object.values(GAME_AUDIO_ASSETS.sfx ?? {})) {
    if (src) assets.push({ src, type: 'audio' });
  }
  return assets;
}

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createGameAudio>} gameAudio
 */
export function wireTemplateAudio(gameAudio) {
  gameAudio.setAssets(GAME_AUDIO_ASSETS);
}

/**
 * Reel spin bed — plays once per spin; stops when reels land.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createReelSpinAudio(audioPrefs) {
  /** @type {HTMLAudioElement | null} */
  let reelEl = null;

  function ensureElement() {
    const url = GAME_AUDIO_ASSETS.sfx?.reels;
    if (!url) return null;
    const resolved = new URL(url, window.location.href).href;
    if (reelEl && reelEl.src !== resolved) {
      reelEl.pause();
      reelEl = null;
    }
    if (!reelEl) {
      reelEl = new Audio(url);
      reelEl.loop = false;
      reelEl.preload = 'auto';
    }
    return reelEl;
  }

  return {
    start(unlock) {
      if (!audioPrefs.sfx.enabled) return;
      const el = ensureElement();
      if (!el) return;
      unlock?.();
      el.currentTime = 0;
      el.play().catch(() => {});
    },
    stop() {
      if (!reelEl) return;
      reelEl.pause();
      reelEl.currentTime = 0;
    },
  };
}
