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
 * Reel spin bed — starts when reveal motion begins, stops on last reel land impact.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createReelSpinAudio(audioPrefs) {
  /** @type {HTMLAudioElement | null} */
  let reelEl = null;
  let fadeToken = 0;

  function sfxLevel() {
    return audioPrefs.sfxVolume?.value ?? (audioPrefs.sfx?.enabled ? 1 : 0);
  }

  function applySfxVolume() {
    if (!reelEl) return;
    reelEl.volume = sfxLevel();
  }

  audioPrefs.sfxVolume?.onChange(applySfxVolume);

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
      reelEl.volume = 1;
    }
    return reelEl;
  }

  function halt({ fadeMs = 0 } = {}) {
    if (!reelEl) return;
    const el = reelEl;
    const token = ++fadeToken;

    if (fadeMs <= 0) {
      el.pause();
      el.currentTime = 0;
      applySfxVolume();
      return;
    }

    const startVol = el.volume;
    const start = performance.now();
    /** @param {number} now */
    const step = (now) => {
      if (token !== fadeToken) return;
      const t = Math.min(1, (now - start) / fadeMs);
      el.volume = startVol * (1 - t);
      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      el.pause();
      el.currentTime = 0;
      applySfxVolume();
    };
    requestAnimationFrame(step);
  }

  return {
    /** Warm the decoder — call after first user gesture to cut mobile start latency. */
    prime() {
      if (sfxLevel() <= 0) return;
      const el = ensureElement();
      if (!el) return;
      applySfxVolume();
      const playPromise = el.play();
      if (!playPromise) return;
      playPromise
        .then(() => {
          el.pause();
          el.currentTime = 0;
          applySfxVolume();
        })
        .catch(() => {});
    },
    start(unlock) {
      if (sfxLevel() <= 0) return;
      const el = ensureElement();
      if (!el) return;
      fadeToken += 1;
      unlock?.();
      applySfxVolume();
      el.currentTime = 0;
      el.play().catch(() => {});
    },
    stop({ fadeMs = 60 } = {}) {
      halt({ fadeMs });
    },
  };
}
