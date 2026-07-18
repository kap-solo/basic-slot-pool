/**
 * Game audio — wire paths when files exist under assets/audio/.
 */

/** @type {{ music: string | null, sfx: Record<string, string> }} */
export const GAME_AUDIO_ASSETS = {
  music: null,
  sfx: {
    pulse: 'assets/audio/pulse.wav',
    reels: 'assets/audio/reels3.wav',
    greenSquare: 'assets/audio/green_square.wav',
    cascade: 'assets/audio/cascade.wav',
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
 * Cabinet pulse — starts with the visual bump; plays the full wav (not truncated to pulse ms).
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createSpinClickAudio(audioPrefs) {
  /** @type {HTMLAudioElement | null} */
  let clickEl = null;

  function sfxLevel() {
    return audioPrefs.sfxVolume?.value ?? (audioPrefs.sfx?.enabled ? 1 : 0);
  }

  function applySfxVolume() {
    if (!clickEl) return;
    clickEl.volume = sfxLevel();
  }

  audioPrefs.sfxVolume?.onChange(applySfxVolume);

  function ensureElement() {
    const url = GAME_AUDIO_ASSETS.sfx?.pulse;
    if (!url) return null;
    const resolved = new URL(url, window.location.href).href;
    if (clickEl && clickEl.src !== resolved) {
      clickEl.pause();
      clickEl = null;
    }
    if (!clickEl) {
      clickEl = new Audio(url);
      clickEl.loop = false;
      clickEl.preload = 'auto';
      clickEl.volume = 1;
      clickEl.playbackRate = 1;
    }
    return clickEl;
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
    play(unlock) {
      if (sfxLevel() <= 0) return;
      const el = ensureElement();
      if (!el) return;
      unlock?.();
      applySfxVolume();
      el.playbackRate = 1;
      el.currentTime = 0;
      el.play().catch(() => {});
    },
  };
}

/**
 * Reel spin bed — starts when reveal motion begins; plays the full wav (not tied to land impact).
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

/** Until `green_square.wav` metadata loads — matches placeholder Spine `dissolve`. */
export const GREEN_SQUARE_DISSOLVE_FALLBACK_MS = 320;

/**
 * Green square pop — one-shot, synced to dissolve visuals via {@link GREEN_SQUARE_DISSOLVE_FALLBACK_MS}.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createGreenSquareAudio(audioPrefs) {
  /** @type {HTMLAudioElement | null} */
  let dissolveEl = null;
  let durationMs = GREEN_SQUARE_DISSOLVE_FALLBACK_MS;

  function sfxLevel() {
    return audioPrefs.sfxVolume?.value ?? (audioPrefs.sfx?.enabled ? 1 : 0);
  }

  function applySfxVolume() {
    if (!dissolveEl) return;
    dissolveEl.volume = sfxLevel();
  }

  audioPrefs.sfxVolume?.onChange(applySfxVolume);

  function syncDurationFromElement(el) {
    if (!Number.isFinite(el.duration) || el.duration <= 0) return;
    durationMs = Math.round(el.duration * 1000);
  }

  function ensureElement() {
    const url = GAME_AUDIO_ASSETS.sfx?.greenSquare;
    if (!url) return null;
    const resolved = new URL(url, window.location.href).href;
    if (dissolveEl && dissolveEl.src !== resolved) {
      dissolveEl.pause();
      dissolveEl = null;
    }
    if (!dissolveEl) {
      dissolveEl = new Audio(url);
      dissolveEl.loop = false;
      dissolveEl.preload = 'auto';
      dissolveEl.volume = 1;
      dissolveEl.playbackRate = 1;
      dissolveEl.addEventListener('loadedmetadata', () => syncDurationFromElement(dissolveEl), {
        once: true,
      });
      if (dissolveEl.readyState >= HTMLMediaElement.HAVE_METADATA) {
        syncDurationFromElement(dissolveEl);
      }
    }
    return dissolveEl;
  }

  return {
    /** Warm the decoder — call after first user gesture to cut mobile start latency. */
    prime() {
      if (sfxLevel() <= 0) return;
      const el = ensureElement();
      if (!el) return;
      applySfxVolume();
      syncDurationFromElement(el);
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
    play(unlock) {
      if (sfxLevel() <= 0) return;
      const el = ensureElement();
      if (!el) return;
      unlock?.();
      applySfxVolume();
      syncDurationFromElement(el);
      el.playbackRate = 1;
      el.currentTime = 0;
      el.play().catch(() => {});
    },
    durationMs() {
      ensureElement();
      return durationMs;
    },
  };
}

/**
 * Post-spin board motion bed — blob tumble, cluster refill, symbol drops.
 * Starts with movement; plays the full wav (not truncated to settle).
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createCascadeAudio(audioPrefs) {
  /** @type {HTMLAudioElement | null} */
  let cascadeEl = null;
  let fadeToken = 0;

  function sfxLevel() {
    return audioPrefs.sfxVolume?.value ?? (audioPrefs.sfx?.enabled ? 1 : 0);
  }

  function applySfxVolume() {
    if (!cascadeEl) return;
    cascadeEl.volume = sfxLevel();
  }

  audioPrefs.sfxVolume?.onChange(applySfxVolume);

  function ensureElement() {
    const url = GAME_AUDIO_ASSETS.sfx?.cascade;
    if (!url) return null;
    const resolved = new URL(url, window.location.href).href;
    if (cascadeEl && cascadeEl.src !== resolved) {
      cascadeEl.pause();
      cascadeEl = null;
    }
    if (!cascadeEl) {
      cascadeEl = new Audio(url);
      cascadeEl.loop = false;
      cascadeEl.preload = 'auto';
      cascadeEl.volume = 1;
      cascadeEl.playbackRate = 1;
    }
    return cascadeEl;
  }

  function halt({ fadeMs = 0 } = {}) {
    if (!cascadeEl) return;
    const el = cascadeEl;
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
      el.pause();
      el.playbackRate = 1;
      el.currentTime = 0;
      el.play().catch(() => {});
    },
    stop({ fadeMs = 0 } = {}) {
      halt({ fadeMs });
    },
  };
}
