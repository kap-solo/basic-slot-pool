/**
 * Game audio — wire paths when files exist under assets/audio/.
 * Empty by default so the preloader and console stay clean until you add MP3/OGG.
 */

/** @type {{ music: string | null, sfx: Record<string, string> }} */
export const GAME_AUDIO_ASSETS = {
  music: null,
  sfx: {},
};

/**
 * Uncomment and add files to enable audio:
 *
 * export const GAME_AUDIO_ASSETS = {
 *   music: 'assets/audio/music.mp3',
 *   sfx: {
 *     play: 'assets/audio/play.mp3',
 *     win: 'assets/audio/win.mp3',
 *     lose: 'assets/audio/lose.mp3',
 *   },
 * };
 */

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
