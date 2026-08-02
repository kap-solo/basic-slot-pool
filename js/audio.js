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
export const BACKGROUND_MUSIC_URL = 'assets/audio/background_music.mp3';
export const BACKGROUND_MUSIC_BONUS_URL = 'assets/audio/background_music_bonus.mp3';

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

/**
 * Shared Web Audio bus for one-shot SFX — same path as background music, which works on iOS.
 * HTMLAudioElement SFX stay blocked in Stake iframes even after gesture unlock.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
function createSharedSfxBus(audioPrefs) {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let masterGain = null;
  /** @type {Map<string, AudioBuffer>} */
  const bufferCache = new Map();
  /** @type {Map<string, Promise<AudioBuffer | null>>} */
  const loadPromises = new Map();
  /** @type {Map<string, { source: AudioBufferSourceNode, gain: GainNode }>} */
  const activeBeds = new Map();

  function sfxLevel() {
    return audioPrefs.sfxVolume?.value ?? (audioPrefs.sfx?.enabled ? 1 : 0);
  }

  function ensureContext() {
    if (ctx) return ctx;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = sfxLevel();
    masterGain.connect(ctx.destination);
    return ctx;
  }

  /** Must run synchronously inside a user-gesture handler (iOS Web Audio policy). */
  function resumeContextSync() {
    ensureContext();
    if (ctx?.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  function applyMasterVolume() {
    if (!masterGain) return;
    masterGain.gain.value = Math.min(1, Math.max(0, sfxLevel()));
  }

  audioPrefs.sfxVolume?.onChange(applyMasterVolume);

  /** @param {string} url */
  function loadBuffer(url) {
    const cached = bufferCache.get(url);
    if (cached) return Promise.resolve(cached);
    const pending = loadPromises.get(url);
    if (pending) return pending;

    const promise = (async () => {
      ensureContext();
      if (!ctx || !url) return null;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(data);
      bufferCache.set(url, buffer);
      return buffer;
    })().catch(() => null);

    loadPromises.set(url, promise);
    return promise;
  }

  /** @param {string[]} urls */
  function primeUrls(urls) {
    resumeContextSync();
    for (const url of urls) {
      if (url) void loadBuffer(url);
    }
  }

  /** @param {string} url @param {() => void} [unlock] */
  function playOneShot(url, unlock) {
    unlock?.();
    resumeContextSync();
    applyMasterVolume();
    if (sfxLevel() <= 0 || !url) return;

    void (async () => {
      const buffer = await loadBuffer(url);
      if (!buffer || !ctx || !masterGain) return;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGain);
      source.onended = () => {
        source.disconnect();
      };
      source.start(0);
    })();
  }

  /** @param {string} url @param {string} key @param {() => void} [unlock] */
  function startBed(url, key, unlock) {
    unlock?.();
    resumeContextSync();
    applyMasterVolume();
    if (sfxLevel() <= 0 || !url) return;

    stopBed(key, { fadeMs: 0 });

    void (async () => {
      const buffer = await loadBuffer(url);
      if (!buffer || !ctx || !masterGain) return;
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      source.connect(gain);
      gain.connect(masterGain);
      source.onended = () => {
        activeBeds.delete(key);
        source.disconnect();
        gain.disconnect();
      };
      source.start(0);
      activeBeds.set(key, { source, gain });
    })();
  }

  /** @param {string} key @param {{ fadeMs?: number }} [opts] */
  function stopBed(key, { fadeMs = 0 } = {}) {
    const active = activeBeds.get(key);
    if (!active) return;
    const { source, gain } = active;
    activeBeds.delete(key);

    if (!ctx || fadeMs <= 0) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
      gain.disconnect();
      return;
    }

    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(0, now + fadeMs / 1000);
    window.setTimeout(() => {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
      gain.disconnect();
    }, fadeMs + 30);
  }

  /** @param {string} url @param {number} fallbackMs */
  function durationMs(url, fallbackMs) {
    const buffer = bufferCache.get(url);
    if (buffer) return Math.round(buffer.duration * 1000);
    void loadBuffer(url);
    return fallbackMs;
  }

  return {
    resumeContextSync,
    primeUrls,
    playOneShot,
    startBed,
    stopBed,
    durationMs,
    loadBuffer,
  };
}

/** @type {WeakMap<ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>, ReturnType<createSharedSfxBus>>} */
const sfxBusByPrefs = new WeakMap();

/** @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs */
function getSharedSfxBus(audioPrefs) {
  let bus = sfxBusByPrefs.get(audioPrefs);
  if (!bus) {
    bus = createSharedSfxBus(audioPrefs);
    sfxBusByPrefs.set(audioPrefs, bus);
  }
  return bus;
}

/** Resume the SFX AudioContext during a user gesture (iOS). */
export function resumeGameSfxContext(audioPrefs) {
  getSharedSfxBus(audioPrefs).resumeContextSync();
}

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

  /** Must run synchronously inside a user-gesture handler (iOS Web Audio policy). */
  function resumeContextSync() {
    ensureContext();
    if (ctx?.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
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
    resumeContextSync();
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
      resumeContextSync();
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
  const bus = getSharedSfxBus(audioPrefs);
  const url = GAME_AUDIO_ASSETS.sfx?.pulse;

  return {
    prime() {
      if (url) bus.primeUrls([url]);
    },
    play(unlock) {
      bus.playOneShot(url, unlock);
    },
  };
}

/**
 * Reel spin bed — starts when reveal motion begins; plays the full wav (not tied to land impact).
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createReelSpinAudio(audioPrefs) {
  const bus = getSharedSfxBus(audioPrefs);
  const url = GAME_AUDIO_ASSETS.sfx?.reels;
  const key = 'reels';

  return {
    prime() {
      if (url) bus.primeUrls([url]);
    },
    start(unlock) {
      bus.startBed(url, key, unlock);
    },
    stop({ fadeMs = 60 } = {}) {
      bus.stopBed(key, { fadeMs });
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
  const bus = getSharedSfxBus(audioPrefs);
  const url = GAME_AUDIO_ASSETS.sfx?.greenSquare;

  return {
    prime() {
      if (url) bus.primeUrls([url]);
    },
    play(unlock) {
      bus.playOneShot(url, unlock);
    },
    durationMs() {
      return bus.durationMs(url, GREEN_SQUARE_DISSOLVE_FALLBACK_MS);
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
  const bus = getSharedSfxBus(audioPrefs);
  const url = GAME_AUDIO_ASSETS.sfx?.cascade;
  const key = 'cascade';

  return {
    prime() {
      if (url) bus.primeUrls([url]);
    },
    start(unlock) {
      bus.startBed(url, key, unlock);
    },
    stop({ fadeMs = 0 } = {}) {
      bus.stopBed(key, { fadeMs });
    },
  };
}

/**
 * Cluster highlight — one-shot per cascade step (cluster01 … cluster08).
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createClusterStepAudio(audioPrefs) {
  const bus = getSharedSfxBus(audioPrefs);

  function clampStep(step) {
    const rounded = Math.round(step);
    if (!Number.isFinite(rounded) || rounded < 1) return 1;
    return Math.min(MAX_CLUSTER_STEP_SFX, rounded);
  }

  return {
    prime() {
      bus.primeUrls(CLUSTER_STEP_SFX);
    },
    play(step, unlock) {
      const url = CLUSTER_STEP_SFX[clampStep(step) - 1];
      bus.playOneShot(url, unlock);
    },
  };
}

/**
 * Cluster highlight — one-shot when the green win box appears over matched symbols.
 *
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createAudioPrefs>} audioPrefs
 */
export function createWhooshAudio(audioPrefs) {
  const bus = getSharedSfxBus(audioPrefs);
  const url = GAME_AUDIO_ASSETS.sfx?.whoosh;

  return {
    prime() {
      if (url) bus.primeUrls([url]);
    },
    play(unlock) {
      bus.playOneShot(url, unlock);
    },
  };
}
