/**
 * Game audio — wire paths when files exist under assets/audio/.
 */

export const MAX_CLUSTER_STEP_SFX = 8;

/** @type {string[]} cluster01.wav … cluster08.wav — one per cascade step in a spin. */
export const CLUSTER_STEP_SFX = Array.from(
  { length: MAX_CLUSTER_STEP_SFX },
  (_, index) => `assets/audio/cluster${String(index + 1).padStart(2, '0')}.wav`,
);

/** Looping background bed — decoded via Web Audio for gapless sample-accurate loops. */
export const BACKGROUND_MUSIC_URL = 'assets/audio/background_music.wav';
export const BACKGROUND_MUSIC_BONUS_URL = 'assets/audio/background_music_bonus.wav';

/** Crossfade duration — keep in sync with character/background bonus transitions. */
export const BACKGROUND_MUSIC_CROSSFADE_MS = 900;

/** @type {{ music: string | null, sfx: Record<string, string> }} */
export const GAME_AUDIO_ASSETS = {
  music: BACKGROUND_MUSIC_URL,
  sfx: {
    pulse: 'assets/audio/pulse.wav',
    reels: 'assets/audio/reels3.wav',
    greenSquare: 'assets/audio/green_square.wav',
    cascade: 'assets/audio/cascade.wav',
    whoosh: 'assets/audio/whoosh.wav',
  },
};

/** Paths to front-load during the Suki preloader. */
export function buildPreloadAssets() {
  const assets = [];
  if (GAME_AUDIO_ASSETS.music) {
    assets.push({ src: GAME_AUDIO_ASSETS.music, type: 'audio' });
  }
  assets.push({ src: BACKGROUND_MUSIC_BONUS_URL, type: 'audio' });
  for (const src of Object.values(GAME_AUDIO_ASSETS.sfx ?? {})) {
    if (src) assets.push({ src, type: 'audio' });
  }
  for (const src of CLUSTER_STEP_SFX) {
    assets.push({ src, type: 'audio' });
  }
  return assets;
}

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createGameAudio>} gameAudio
 */
export function wireTemplateAudio(gameAudio) {
  gameAudio.setAssets({
    ...GAME_AUDIO_ASSETS,
    music: null,
  });
}

/**
 * Gapless background music with base/bonus crossfade — HTMLAudioElement.loop re-seeks
 * the decoder and often produces a brief gap or click; Web Audio buffer looping is sample-accurate.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 * @param {{
 *   baseUrl?: string,
 *   bonusUrl?: string,
 *   crossfadeMs?: number,
 * }} [options]
 */
export function createBackgroundMusicLoop(audioPrefs, options = {}) {
  const baseUrl = options.baseUrl ?? BACKGROUND_MUSIC_URL;
  const bonusUrl = options.bonusUrl ?? BACKGROUND_MUSIC_BONUS_URL;
  const crossfadeMs = options.crossfadeMs ?? BACKGROUND_MUSIC_CROSSFADE_MS;

  /** @typedef {'base' | 'bonus'} MusicTrackKey */
  /** @typedef {{
   *   url: string,
   *   buffer: AudioBuffer | null,
   *   source: AudioBufferSourceNode | null,
   *   gain: GainNode | null,
   *   loadPromise: Promise<AudioBuffer | null> | null,
   * }} MusicTrackState */

  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let masterGain = null;
  /** @type {Record<MusicTrackKey, MusicTrackState>} */
  const tracks = {
    base: { url: baseUrl, buffer: null, source: null, gain: null, loadPromise: null },
    bonus: { url: bonusUrl, buffer: null, source: null, gain: null, loadPromise: null },
  };
  let unlocked = false;
  let inBonusMode = false;
  let fadeToken = 0;
  /** @type {Promise<void>} */
  let modeTransition = Promise.resolve();

  function effectiveVolume() {
    return unlocked ? audioPrefs.musicVolume.value : 0;
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);

    for (const key of /** @type {MusicTrackKey[]} */ (['base', 'bonus'])) {
      const gain = ctx.createGain();
      gain.gain.value = key === 'base' ? 1 : 0;
      gain.connect(masterGain);
      tracks[key].gain = gain;
    }
    return ctx;
  }

  /** @param {MusicTrackKey} key */
  function loadTrack(key) {
    const track = tracks[key];
    if (track.buffer) return Promise.resolve(track.buffer);
    if (track.loadPromise) return track.loadPromise;
    track.loadPromise = (async () => {
      if (!track.url) return null;
      ensureContext();
      if (!ctx) return null;
      const response = await fetch(track.url);
      if (!response.ok) return null;
      const data = await response.arrayBuffer();
      track.buffer = await ctx.decodeAudioData(data);
      return track.buffer;
    })().catch(() => {
      track.loadPromise = null;
      return null;
    });
    return track.loadPromise;
  }

  /** @param {MusicTrackKey} key */
  function stopSource(key) {
    const track = tracks[key];
    if (!track.source) return;
    try {
      track.source.stop();
    } catch {
      /* already stopped */
    }
    track.source.disconnect();
    track.source = null;
  }

  /** @param {MusicTrackKey} key */
  function startSource(key) {
    const track = tracks[key];
    if (!ctx || !track.gain || !track.buffer || track.source) return;
    track.source = ctx.createBufferSource();
    track.source.buffer = track.buffer;
    track.source.loop = true;
    track.source.connect(track.gain);
    track.source.onended = () => {
      track.source = null;
    };
    track.source.start(0);
  }

  function applyMasterVolume() {
    if (!masterGain) return;
    masterGain.gain.value = Math.min(1, Math.max(0, effectiveVolume()));
  }

  /** @param {{ animate?: boolean }} [opts] */
  async function applyModeGains({ animate = true } = {}) {
    if (!ctx || !tracks.base.gain || !tracks.bonus.gain) return;

    await Promise.all([loadTrack('base'), loadTrack('bonus')]);
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    const token = ++fadeToken;
    const now = ctx.currentTime;
    const durationSec = animate ? crossfadeMs / 1000 : 0;
    const baseTarget = inBonusMode ? 0 : 1;
    const bonusTarget = inBonusMode ? 1 : 0;

    if (baseTarget > 0) startSource('base');
    if (bonusTarget > 0) startSource('bonus');

    for (const track of Object.values(tracks)) {
      track.gain.gain.cancelScheduledValues(now);
      track.gain.gain.setValueAtTime(track.gain.gain.value, now);
    }

    if (durationSec <= 0) {
      tracks.base.gain.gain.value = baseTarget;
      tracks.bonus.gain.gain.value = bonusTarget;
    } else {
      tracks.base.gain.gain.linearRampToValueAtTime(baseTarget, now + durationSec);
      tracks.bonus.gain.gain.linearRampToValueAtTime(bonusTarget, now + durationSec);
    }

    if (durationSec <= 0) {
      if (inBonusMode) stopSource('base');
      else stopSource('bonus');
      return;
    }

    window.setTimeout(() => {
      if (token !== fadeToken) return;
      if (inBonusMode) stopSource('base');
      else stopSource('bonus');
    }, crossfadeMs + 50);
  }

  async function sync() {
    ensureContext();
    applyMasterVolume();
    if (!unlocked || effectiveVolume() <= 0) return;
    await applyModeGains({ animate: false });
  }

  /** @param {boolean} active @param {{ animate?: boolean }} [opts] */
  function setBonusMode(active, { animate = true } = {}) {
    if (inBonusMode === active) return modeTransition;
    inBonusMode = active;
    if (!unlocked || effectiveVolume() <= 0) return modeTransition;
    modeTransition = modeTransition
      .then(() => applyModeGains({ animate }))
      .catch(() => {});
    return modeTransition;
  }

  audioPrefs.music.onChange(() => {
    void sync();
  });
  audioPrefs.musicVolume.onChange(() => {
    void sync();
  });

  return {
    prime() {
      void loadTrack('base');
      void loadTrack('bonus');
    },
    async unlock() {
      if (unlocked) {
        await sync();
        return;
      }
      unlocked = true;
      await sync();
    },
    setBonusMode,
    sync,
    destroy() {
      fadeToken += 1;
      stopSource('base');
      stopSource('bonus');
      for (const track of Object.values(tracks)) {
        track.gain?.disconnect();
        track.gain = null;
        track.buffer = null;
        track.loadPromise = null;
      }
      masterGain?.disconnect();
      masterGain = null;
      if (ctx) {
        void ctx.close();
        ctx = null;
      }
    },
  };
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

/** Until `green_square.wav` metadata loads — matches Spine `melt` duration (~0.467s). */
export const GREEN_SQUARE_DISSOLVE_FALLBACK_MS = 467;

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

/**
 * Cluster highlight — one-shot per cascade step (cluster01 … cluster08).
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createClusterStepAudio(audioPrefs) {
  /** @type {Map<number, HTMLAudioElement>} */
  const stepEls = new Map();

  function sfxLevel() {
    return audioPrefs.sfxVolume?.value ?? (audioPrefs.sfx?.enabled ? 1 : 0);
  }

  function clampStep(step) {
    const rounded = Math.round(step);
    if (!Number.isFinite(rounded) || rounded < 1) return 1;
    return Math.min(MAX_CLUSTER_STEP_SFX, rounded);
  }

  function applySfxVolume(el) {
    el.volume = sfxLevel();
  }

  audioPrefs.sfxVolume?.onChange(() => {
    for (const el of stepEls.values()) applySfxVolume(el);
  });

  function ensureElement(step) {
    const clamped = clampStep(step);
    const url = CLUSTER_STEP_SFX[clamped - 1];
    if (!url) return null;

    let el = stepEls.get(clamped);
    const resolved = new URL(url, window.location.href).href;
    if (el && el.src !== resolved) {
      el.pause();
      stepEls.delete(clamped);
      el = undefined;
    }
    if (!el) {
      el = new Audio(url);
      el.loop = false;
      el.preload = 'auto';
      el.volume = 1;
      el.playbackRate = 1;
      stepEls.set(clamped, el);
    }
    return el;
  }

  return {
    prime() {
      if (sfxLevel() <= 0) return;
      for (let step = 1; step <= MAX_CLUSTER_STEP_SFX; step += 1) {
        const el = ensureElement(step);
        if (!el) continue;
        applySfxVolume(el);
        const playPromise = el.play();
        if (!playPromise) continue;
        playPromise
          .then(() => {
            el.pause();
            el.currentTime = 0;
            applySfxVolume(el);
          })
          .catch(() => {});
      }
    },
    play(step, unlock) {
      if (sfxLevel() <= 0) return;
      const el = ensureElement(step);
      if (!el) return;
      unlock?.();
      applySfxVolume(el);
      el.pause();
      el.playbackRate = 1;
      el.currentTime = 0;
      el.play().catch(() => {});
    },
  };
}

/**
 * Cluster highlight — one-shot when the green win box appears over matched symbols.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createWhooshAudio(audioPrefs) {
  /** @type {HTMLAudioElement | null} */
  let whooshEl = null;

  function sfxLevel() {
    return audioPrefs.sfxVolume?.value ?? (audioPrefs.sfx?.enabled ? 1 : 0);
  }

  function applySfxVolume() {
    if (!whooshEl) return;
    whooshEl.volume = sfxLevel();
  }

  audioPrefs.sfxVolume?.onChange(applySfxVolume);

  function ensureElement() {
    const url = GAME_AUDIO_ASSETS.sfx?.whoosh;
    if (!url) return null;
    const resolved = new URL(url, window.location.href).href;
    if (whooshEl && whooshEl.src !== resolved) {
      whooshEl.pause();
      whooshEl = null;
    }
    if (!whooshEl) {
      whooshEl = new Audio(url);
      whooshEl.loop = false;
      whooshEl.preload = 'auto';
      whooshEl.volume = 1;
      whooshEl.playbackRate = 1;
    }
    return whooshEl;
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
    play(unlock) {
      if (sfxLevel() <= 0) return;
      const el = ensureElement();
      if (!el) return;
      unlock?.();
      applySfxVolume();
      el.pause();
      el.playbackRate = 1;
      el.currentTime = 0;
      el.play().catch(() => {});
    },
  };
}
