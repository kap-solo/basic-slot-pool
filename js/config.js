/** Basic Slot — game constants. */
export const GAME = {
  id: 'basic-slot',
  title: 'Reflecting Pool',
  subtitle: '5×5 cluster cascade · pool',
  replayVersion: '1',
  targetRtpPercent: 96,
  reels: 5,
  rows: 5,
};

/** Bump when verifying client updates — shown in the game area. */
export const BUILD_REF = 'BS-POOL';

const PLACEHOLDER_SYMBOLS = ['CH', 'LM', 'OR', 'GR', 'ST'];

/** Default visible column for empty board slots. */
export function defaultBoardColumn() {
  return Array.from({ length: GAME.rows }, (_, row) => PLACEHOLDER_SYMBOLS[row % PLACEHOLDER_SYMBOLS.length]);
}

/** Idle attract board — column-major [reel][row]. */
export function defaultIdleBoard() {
  return Array.from({ length: GAME.reels }, () => defaultBoardColumn());
}

/** Pool v1 — all symbols render single-height; tall merge is disabled. */
export const TALL_SYMBOLS_ENABLED = false;

export const DEFAULT_BET = 1;
export const BET_OPTIONS = [0.5, 1, 2, 5, 10];

/** Keep in sync with data/index.json. */
export const GAME_MODES = [
  { name: 'base', cost: 1 },
  { name: 'bb', cost: 20 },
];

/** Internal math/RGS mode key for bonus-buy (avoid "buy" in Stake math index). */
export const BB_MODE = 'bb';

/** Bonus-buy debit multiplier — keep in sync with data/index.json bb mode cost. */
export const BUY_MODE_COST = GAME_MODES.find((mode) => mode.name === BB_MODE)?.cost ?? 20;

/**
 * Symbol ids used in book JSON and paytable copy.
 * @type {Record<string, { label: string, glyph: string, tier: 'ordinary' | 'premium' | 'wild' | 'scatter' }>}
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
  SC: { label: 'Scatter', glyph: '☆', tier: 'scatter' },
};

export const ORDINARY_SYMBOLS = Object.entries(SYMBOLS)
  .filter(([, meta]) => meta.tier === 'ordinary')
  .map(([id]) => id);

export const PREMIUM_SYMBOLS = Object.entries(SYMBOLS)
  .filter(([, meta]) => meta.tier === 'premium')
  .map(([id]) => id);

export const WILD_SYMBOL = 'WD';
export const SCATTER_SYMBOL = 'SC';

/** Random visible board for first paint — column-major [reel][row]. */
export function randomIdleBoard() {
  const pool = Object.keys(SYMBOLS);
  return Array.from({ length: GAME.reels }, () =>
    Array.from({ length: GAME.rows }, () => {
      const index = Math.floor(Math.random() * pool.length);
      return pool[index];
    }),
  );
}
