/** Basic Slot — game constants. */
export const GAME = {
  id: 'basic-slot',
  title: 'Basic Slot',
  subtitle: '5×5 cluster cascade',
  replayVersion: '1',
  targetRtpPercent: 96,
  reels: 5,
  rows: 5,
};

/** Bump when verifying client updates — shown in the game area. */
export const BUILD_REF = 'BS-090';

const PLACEHOLDER_SYMBOLS = ['CH', 'LM', 'OR', 'GR', 'ST'];

/** Default visible column for empty board slots. */
export function defaultBoardColumn() {
  return Array.from({ length: GAME.rows }, (_, row) => PLACEHOLDER_SYMBOLS[row % PLACEHOLDER_SYMBOLS.length]);
}

export const DEFAULT_BET = 1;
export const BET_OPTIONS = [0.5, 1, 2, 5, 10];

/** Keep in sync with data/index.json — base mode only in v1. */
export const GAME_MODES = [{ name: 'base', cost: 1 }];

/**
 * Symbol ids used in book JSON and paytable copy.
 * @type {Record<string, { label: string, glyph: string, tier: 'ordinary' | 'premium' | 'wild' }>}
 */
export const SYMBOLS = {
  CH: { label: 'Cherry', glyph: '🍒', tier: 'ordinary' },
  LM: { label: 'Lemon', glyph: '🍋', tier: 'ordinary' },
  OR: { label: 'Orange', glyph: '🍊', tier: 'ordinary' },
  GR: { label: 'Grape', glyph: '🍇', tier: 'ordinary' },
  ST: { label: 'Star', glyph: '⭐', tier: 'premium' },
  S7: { label: 'Seven', glyph: '7️⃣', tier: 'premium' },
  DM: { label: 'Diamond', glyph: '💎', tier: 'premium' },
  CR: { label: 'Crown', glyph: '👑', tier: 'premium' },
  WD: { label: 'Wild', glyph: '✦', tier: 'wild' },
};

export const ORDINARY_SYMBOLS = Object.entries(SYMBOLS)
  .filter(([, meta]) => meta.tier === 'ordinary')
  .map(([id]) => id);

export const PREMIUM_SYMBOLS = Object.entries(SYMBOLS)
  .filter(([, meta]) => meta.tier === 'premium')
  .map(([id]) => id);

export const WILD_SYMBOL = 'WD';
