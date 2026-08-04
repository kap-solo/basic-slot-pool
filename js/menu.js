/**
 * Basic Slot — burger menu modals.
 */

import { appendGeneralDisclaimer, pickSocialCopy } from '@kap-solo/suki-engine/client/rgs.js';
import {
  CLUSTER_PAYTABLE,
  CLUSTER_SIZE_MULTIPLIERS,
  MAX_CASCADE_LADDER,
  MIN_CLUSTER_SIZE,
  basePayForSymbol,
  cascadeMultiplier,
  clusterSizeMultiplier,
  formatBasePayMult,
} from './cluster.js';
import { GAME, ORDINARY_SYMBOLS, PREMIUM_SYMBOLS, SCATTER_SYMBOL, SYMBOLS, WILD_SYMBOL, BB_MODE, BUY_MODE_COST, FREE_SPINS_AWARDED, MODE_MAX_WIN_MULT, SCATTER_TRIGGER_COUNT } from './config.js';
import { PERFORMANCE_BLOB_SYMBOL } from './pixi/performanceBlob.js';
import { appendSymbolIcon, destroyLedgerSpineIcons, mountLedgerSpineIcon } from './pixi/ledgerSpineIcon.js';
import { formatMult } from './slot.js';

export const GAME_INFO_MODAL_ID = 'game-info';

/** @type {'how-to-play' | 'paytable'} */
let activeGameInfoTab = 'how-to-play';

/** Every cluster size with a defined size multiplier (5–12), cascade step ×1. */
const PAYTABLE_CLUSTER_TIER_SIZES = Object.keys(CLUSTER_SIZE_MULTIPLIERS)
  .map(Number)
  .sort((a, b) => a - b);

/** @param {string} symbolId @param {number} size */
function clusterStepMultiplier(symbolId, size) {
  return basePayForSymbol(symbolId) * clusterSizeMultiplier(size);
}

/** @param {number} mult */
function formatPaytableStepMult(mult) {
  if (!Number.isFinite(mult) || mult <= 0) return '—';
  return formatMult(mult);
}

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/client/suki/modalHost.js').createModalHost>} modalHost
 * @param {'how-to-play' | 'paytable'} tab
 */
export function openGameInfoModal(modalHost, tab = 'how-to-play') {
  activeGameInfoTab = tab;
  modalHost.open(GAME_INFO_MODAL_ID);
}

/**
 * @param {object} ctx
 * @param {(key: string, vars?: Record<string, string | number>) => string} ctx.t
 * @param {object | null | undefined} ctx.game
 * @param {HTMLElement} target
 */
function renderHowToPlayContent(target, { t, game }) {
  const wildLabel = SYMBOLS[WILD_SYMBOL].label;

  const intro = pickSocialCopy(
    game,
    'A 5×5 cluster cascade game — connect 5 or more matching symbols to win. Winning symbols are removed; new symbols tumble in and cascades repeat until no cluster pays. Choose a bet and press Spin.',
    'A 5×5 cluster cascade game — connect 5 or more matching symbols to earn. Matched symbols are removed; new symbols tumble in and cascades repeat until no new clusters earn. Choose your play amount and press Spin.',
  );

  const bullets = pickSocialCopy(
    game,
    [
      'Wins pay on clusters of matching symbols (not paylines).',
      `Clusters must be at least ${MIN_CLUSTER_SIZE} symbols touching up, down, left, or right.`,
      `${wildLabel} substitutes for any paying symbol when forming clusters. Wild does not pay on its own.`,
      'Winning symbols are removed; new symbols tumble in — cascades repeat until no cluster pays.',
      `Each cascade step uses an increasing multiplier (×1 … ×${MAX_CASCADE_LADDER}).`,
      'If several clusters win on the same cascade step, they all use that step’s multiplier at once — the ladder does not advance separately for each cluster.',
      'Premium symbols pay more than ordinary symbols. Larger clusters multiply the win further.',
    ],
    [
      'Qualifying clusters are formed by connected matching symbols (not lines).',
      `Clusters must be at least ${MIN_CLUSTER_SIZE} symbols touching up, down, left, or right.`,
      `${wildLabel} substitutes for qualifying symbols when forming clusters. Wild cannot form a cluster on its own.`,
      'Matched symbols are removed; new symbols tumble in — cascades repeat until no new clusters earn.',
      `Each cascade step uses an increasing multiplier (×1 … ×${MAX_CASCADE_LADDER}).`,
      'If several clusters qualify on the same cascade step, they all use that step’s multiplier at once — the ladder does not advance separately for each cluster.',
      'Premium symbols award higher multipliers than ordinary symbols. Larger clusters apply a higher multiplier.',
    ],
  );

  const blobIntro =
    'Sometimes a green algae square lands on the bottom row of a reel — occasionally two on the bottom rows of the same column. Green algae squares are not symbols and have no value. This is a visual effect only.';

  const blobBullets = pickSocialCopy(
    game,
    [
      'The green algae square holds briefly, then pops. The reel then shows the symbols that apply for that spin.',
      'Clusters and wins are evaluated only after the green algae square disappears — not while it is on screen.',
      'A green algae square does not change your win or round result. It can hide winning symbols for a moment, so a good spin may look like a miss until the cascade finishes.',
    ],
    [
      'The green algae square holds briefly, then pops. The reel then shows the symbols that apply for that spin.',
      'Clusters are evaluated only after the green algae square disappears — not while it is on screen.',
      'A green algae square does not change your round result. It can briefly hide matched symbols, so a successful spin may look like a miss until the cascade finishes.',
    ],
  );

  const displayNote = pickSocialCopy(
    game,
    'When several clusters win on the same cascade step, the amount shown on each board pop-up and on the desktop win ledger is split for display only. Those amounts may differ slightly from one another or from the step total due to rounding (even by a fraction of a cent). Your balance is always updated with the exact amount returned by the Remote Game Server when the round settles.',
    'When several clusters qualify on the same cascade step, the amount shown on each board pop-up and on the desktop win ledger is split for display only. Those amounts may differ slightly from one another or from the step total due to rounding (even by a fraction of a cent). Your balance is always updated with the exact amount returned by the Remote Game Server when the round settles.',
  );

  const p = document.createElement('p');
  p.textContent = intro;
  target.appendChild(p);

  const ul = document.createElement('ul');
  ul.className = 'suki-game-info-list';
  for (const line of bullets) {
    const li = document.createElement('li');
    li.textContent = line;
    ul.appendChild(li);
  }
  target.appendChild(ul);

  const blobTitle = document.createElement('p');
  blobTitle.className = 'suki-game-info-subtitle';
  blobTitle.textContent = 'Green algae squares';
  target.appendChild(blobTitle);

  const blobIntroEl = document.createElement('p');
  blobIntroEl.className = 'suki-game-info-note';
  blobIntroEl.textContent = blobIntro;
  target.appendChild(blobIntroEl);

  const blobUl = document.createElement('ul');
  blobUl.className = 'suki-game-info-list suki-game-info-list--compact';
  for (const line of blobBullets) {
    const li = document.createElement('li');
    li.textContent = line;
    blobUl.appendChild(li);
  }
  target.appendChild(blobUl);

  const displayNoteEl = document.createElement('p');
  displayNoteEl.className = 'suki-game-info-footnote';
  displayNoteEl.textContent = displayNote;
  target.appendChild(displayNoteEl);

  const freeSpinsTitle = document.createElement('p');
  freeSpinsTitle.className = 'suki-game-info-subtitle';
  freeSpinsTitle.textContent = pickSocialCopy(game, 'Free spins', 'Free spins');
  target.appendChild(freeSpinsTitle);

  const freeSpinsBullets = pickSocialCopy(
    game,
    [
      `${SCATTER_TRIGGER_COUNT} or more Scatter symbols anywhere on the board at the end of the base-game cascade award ${FREE_SPINS_AWARDED} free spins.`,
      'Additional scatters do not award extra spins. Free spins cannot be re-triggered.',
      `Each free spin uses the same cluster and cascade rules as the base game. The total feature win is the sum of all wins across the ${FREE_SPINS_AWARDED} spins.`,
      'Scatter symbols do not pay on their own — they only trigger the feature.',
    ],
    [
      `${SCATTER_TRIGGER_COUNT} or more Scatter symbols anywhere on the board at the end of the base-game cascade award ${FREE_SPINS_AWARDED} free spins.`,
      'Additional scatters do not award extra spins. Free spins cannot be re-triggered.',
      `Each free spin uses the same cluster and cascade rules as the base game. The total feature earn is the sum of all amounts across the ${FREE_SPINS_AWARDED} spins.`,
      'Scatter symbols do not form clusters on their own — they only trigger the feature.',
    ],
  );

  const freeSpinsUl = document.createElement('ul');
  freeSpinsUl.className = 'suki-game-info-list suki-game-info-list--compact';
  for (const line of freeSpinsBullets) {
    const li = document.createElement('li');
    li.textContent = line;
    freeSpinsUl.appendChild(li);
  }
  target.appendChild(freeSpinsUl);

  const controlsTitle = document.createElement('p');
  controlsTitle.className = 'suki-game-info-subtitle';
  controlsTitle.textContent = 'Controls';
  target.appendChild(controlsTitle);

  const buyControlLabel = pickSocialCopy(
    game,
    `Buy ${BUY_MODE_COST}×`,
    'Get Bonus',
  );

  const paytableLabel = t('paytableTitle');

  const controlsBullets = pickSocialCopy(
    game,
    [
      `Use + / − or tap the ${t('bet').toLowerCase()} amount to change your ${t('bet').toLowerCase()} before spinning.`,
      `Press Spin to play one round at your selected ${t('bet').toLowerCase()} and active game mode cost (see ${paytableLabel} → Game modes).`,
      `${buyControlLabel} opens a confirmation at ${BUY_MODE_COST}× your selected ${t('bet').toLowerCase()}. Review the cost, then tap BUY to start the bonus feature (see ${paytableLabel}). Tap × or outside the dialog to cancel.`,
      `Open the menu (☰) for How to Play, ${paytableLabel}, and Music / Sound effects volume.`,
      'Spacebar triggers Spin when keyboard play is enabled for your region.',
      'Autoplay (Auto): where available, tap Auto, choose a number of rounds, then START AUTOPLAY. Each round uses your current bet and mode cost.',
      'To stop autoplay, tap Auto again. The session finishes the current spin and any cascades on that spin before stopping. Autoplay also ends when all chosen rounds complete or your balance is too low for the next round. Bet, mode, and manual spin are disabled while autoplay is running.',
      'When free spins start or finish, a full-screen summary may appear — tap anywhere on the screen to continue.',
    ],
    [
      `Use + / − or tap the ${t('betAmount').toLowerCase()} to change your amount before spinning.`,
      `Press Spin to play one round at your selected amount for the active game mode (see ${paytableLabel} → Game modes).`,
      `${buyControlLabel} opens a confirmation at ${BUY_MODE_COST}× your selected amount. Review the amount, then tap GET to start free spins (see ${paytableLabel}). Tap × or outside the dialog to cancel.`,
      `Open the menu (☰) for How to Play, ${paytableLabel}, and Music / Sound effects volume.`,
      'Spacebar triggers Spin when keyboard play is enabled for your region.',
      'Autoplay (Auto): where available, tap Auto, choose a number of rounds, then START AUTOPLAY. Each round uses your current play amount for the active game mode.',
      'To stop autoplay, tap Auto again. The session finishes the current spin and any cascades on that spin before stopping. Autoplay also ends when all chosen rounds complete or your balance is too low for the next round. Play amount, mode, and manual spin are disabled while autoplay is running.',
      'When free spins start or finish, a full-screen summary may appear — tap anywhere on the screen to continue.',
    ],
  );

  const controlsUl = document.createElement('ul');
  controlsUl.className = 'suki-game-info-list suki-game-info-list--compact';
  for (const line of controlsBullets) {
    const li = document.createElement('li');
    li.textContent = line;
    controlsUl.appendChild(li);
  }
  target.appendChild(controlsUl);
}

/**
 * @param {HTMLElement} grid
 * @param {typeof CLUSTER_PAYTABLE[number]} pay
 */
function appendPaytableCard(grid, pay) {
  const card = document.createElement('article');
  card.className = 'suki-game-info-paytable-card suki-game-info-paytable-card--symbol';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'suki-game-info-paytable-card__icon';
  appendSymbolIcon(iconWrap, pay.symbolId);

  const nameEl = document.createElement('p');
  nameEl.className = 'suki-game-info-paytable-card__name';
  nameEl.textContent = pay.label;

  const tiersEl = document.createElement('div');
  tiersEl.className = 'suki-game-info-paytable-card__tiers';

  for (const size of PAYTABLE_CLUSTER_TIER_SIZES) {
    const row = document.createElement('p');
    row.className = 'suki-game-info-paytable-card__tier';
    row.textContent =
      `${size} = ${formatPaytableStepMult(clusterStepMultiplier(pay.symbolId, size))}`;
    tiersEl.appendChild(row);
  }

  const perExtraMult = basePayForSymbol(pay.symbolId) * 4;

  const size13Row = document.createElement('p');
  size13Row.className = 'suki-game-info-paytable-card__tier suki-game-info-paytable-card__tier--large';
  size13Row.textContent =
    `13 = ${formatPaytableStepMult(clusterStepMultiplier(pay.symbolId, 13))}`;

  const extraRow = document.createElement('p');
  extraRow.className = 'suki-game-info-paytable-card__tier suki-game-info-paytable-card__tier--extra';
  extraRow.textContent =
    `+${formatPaytableStepMult(perExtraMult)} for each symbol above 12`;

  tiersEl.append(size13Row, extraRow);
  card.append(iconWrap, nameEl, tiersEl);
  grid.appendChild(card);
}

/**
 * @param {HTMLElement} grid
 * @param {{ symbolId: string, description: string }} feature
 */
function appendPaytableFeatureCard(grid, { symbolId, description }) {
  const card = document.createElement('article');
  card.className = 'suki-game-info-paytable-card suki-game-info-paytable-card--feature';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'suki-game-info-paytable-card__icon';
  appendSymbolIcon(iconWrap, symbolId);

  const content = document.createElement('div');
  content.className = 'suki-game-info-paytable-card__content';

  const nameEl = document.createElement('span');
  nameEl.className = 'suki-game-info-paytable-card__name';
  nameEl.textContent = SYMBOLS[symbolId]?.label ?? symbolId;

  const descEl = document.createElement('span');
  descEl.className = 'suki-game-info-paytable-card__desc';
  descEl.textContent = description;

  content.append(nameEl, descEl);
  card.append(iconWrap, content);
  grid.appendChild(card);
}

/**
 * @param {HTMLElement} parent
 * @param {object | null | undefined} game
 */
function appendGreenSquarePaytableIcon(parent, game) {
  const label = pickSocialCopy(game, 'Green Algae Square', 'Green Algae Square');

  function mountBlobSpriteFallback() {
    parent.replaceChildren();
    const sprite = document.createElement('span');
    sprite.className = 'suki-game-info-paytable-card__blob-sprite';
    sprite.setAttribute('role', 'img');
    sprite.setAttribute('aria-label', label);
    parent.appendChild(sprite);
  }

  const host = document.createElement('span');
  host.className = 'ledger-symbol-spine';
  host.setAttribute('role', 'img');
  host.setAttribute('aria-label', label);
  parent.appendChild(host);

  void mountLedgerSpineIcon(host, PERFORMANCE_BLOB_SYMBOL).then((ok) => {
    if (ok) return;
    mountBlobSpriteFallback();
  });
}

/**
 * @param {HTMLElement} parent
 * @param {string} title
 * @param {typeof CLUSTER_PAYTABLE[number][]} pays
 */
function appendPaytableSection(parent, title, pays) {
  const section = document.createElement('section');
  section.className = 'suki-game-info-paytable-section';

  const heading = document.createElement('h3');
  heading.className = 'suki-game-info-paytable-section__title';
  heading.textContent = title;

  const grid = document.createElement('div');
  grid.className = 'suki-game-info-paytable-grid';
  for (const pay of pays) appendPaytableCard(grid, pay);

  section.append(heading, grid);
  parent.appendChild(section);
}

/**
 * @param {HTMLElement} parent
 * @param {object | null | undefined} game
 */
function appendPaytableFeatureSection(parent, game) {
  const section = document.createElement('section');
  section.className = 'suki-game-info-paytable-section';

  const heading = document.createElement('h3');
  heading.className = 'suki-game-info-paytable-section__title';
  heading.textContent = pickSocialCopy(game, 'Special symbols', 'Special symbols');

  const grid = document.createElement('div');
  grid.className = 'suki-game-info-paytable-grid suki-game-info-paytable-grid--features';

  appendPaytableFeatureCard(grid, {
    symbolId: WILD_SYMBOL,
    description: pickSocialCopy(
      game,
      'Substitutes for paying symbols in clusters. Does not pay on its own.',
      'Substitutes for qualifying symbols in clusters. Cannot form a cluster on its own.',
    ),
  });
  appendPaytableFeatureCard(grid, {
    symbolId: SCATTER_SYMBOL,
    description: pickSocialCopy(
      game,
      `${SCATTER_TRIGGER_COUNT} or more anywhere on the board award ${FREE_SPINS_AWARDED} free spins (see Free spins below).`,
      `${SCATTER_TRIGGER_COUNT} or more anywhere on the board award ${FREE_SPINS_AWARDED} free spins (see Free spins below).`,
    ),
  });

  section.append(heading, grid);
  parent.appendChild(section);
}

/**
 * @param {HTMLElement} parent
 * @param {object | null | undefined} game
 */
function appendFreeSpinsRulesSection(parent, game) {
  const section = document.createElement('section');
  section.className = 'suki-game-info-paytable-section';

  const heading = document.createElement('h3');
  heading.className = 'suki-game-info-paytable-section__title';
  heading.textContent = pickSocialCopy(game, 'Free spins', 'Free spins');

  const list = document.createElement('ul');
  list.className = 'suki-game-info-list suki-game-info-list--compact';

  const lines = pickSocialCopy(
    game,
    [
      `${SCATTER_TRIGGER_COUNT} or more Scatter symbols anywhere on the board at the end of the base-game cascade award ${FREE_SPINS_AWARDED} free spins.`,
      'Additional scatters do not award extra spins. Free spins cannot be re-triggered.',
      `Each free spin uses the same cluster and cascade rules as the base game. Wins during free spins are added to a running total shown as “Total Win”.`,
      `The total feature win is the sum of all wins across the ${FREE_SPINS_AWARDED} spins and is shown when the feature ends.`,
      'Scatter symbols do not pay on their own — they only trigger the feature.',
    ],
    [
      `${SCATTER_TRIGGER_COUNT} or more Scatter symbols anywhere on the board at the end of the base-game cascade award ${FREE_SPINS_AWARDED} free spins.`,
      'Additional scatters do not award extra spins. Free spins cannot be re-triggered.',
      `Each free spin uses the same cluster and cascade rules as the base game. Amounts during free spins are added to a running total shown as “Total Earn”.`,
      `The total feature earn is the sum of all amounts across the ${FREE_SPINS_AWARDED} spins and is shown when the feature ends.`,
      'Scatter symbols do not form clusters on their own — they only trigger the feature.',
    ],
  );

  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    list.appendChild(li);
  }

  section.append(heading, list);
  parent.appendChild(section);
}

/**
 * @param {HTMLElement} parent
 * @param {object | null | undefined} game
 * @param {{ showRtp?: boolean }} [opts]
 */
function appendGameModesSection(parent, game, { showRtp = false } = {}) {
  const section = document.createElement('section');
  section.className = 'suki-game-info-paytable-section';

  const heading = document.createElement('h3');
  heading.className = 'suki-game-info-paytable-section__title';
  heading.textContent = pickSocialCopy(game, 'Game modes', 'Game modes');

  const list = document.createElement('ul');
  list.className = 'suki-game-info-list suki-game-info-list--compact';

  const baseMax = formatMult(MODE_MAX_WIN_MULT.base);
  const buyMax = formatMult(MODE_MAX_WIN_MULT[BB_MODE]);
  const bonusModeLabel = pickSocialCopy(game, `Bonus feature (${BUY_MODE_COST}×)`, `Get Bonus (${BUY_MODE_COST}×)`);

  const lines = pickSocialCopy(
    game,
    [
      `Base game — costs 1× your selected bet per round. A natural scatter trigger awards ${FREE_SPINS_AWARDED} free spins. Maximum win ${baseMax} bet.`,
      `${bonusModeLabel} — costs ${BUY_MODE_COST}× your selected bet and immediately awards ${FREE_SPINS_AWARDED} free spins (same feature as a natural scatter trigger). Maximum win ${buyMax} bet.`,
    ],
    [
      `Base game — 1× your selected amount per round. A natural scatter trigger awards ${FREE_SPINS_AWARDED} free spins. Maximum earn ${baseMax} on a 1× round.`,
      `${bonusModeLabel} — ${BUY_MODE_COST}× your selected amount and immediately awards ${FREE_SPINS_AWARDED} free spins (same feature as a natural scatter trigger). Maximum earn ${buyMax} on a 1× round.`,
    ],
  );

  for (const line of lines) {
    const li = document.createElement('li');
    li.textContent = line;
    list.appendChild(li);
  }

  section.append(heading, list);

  if (showRtp) {
    const rtpNote = document.createElement('p');
    rtpNote.className = 'suki-game-info-paytable-rules__note';
    rtpNote.textContent = pickSocialCopy(
      game,
      `Target RTP ${GAME.targetRtpPercent}% for base game and bonus feature modes.`,
      `Target RTP ${GAME.targetRtpPercent}% for base game and Get Bonus modes.`,
    );
    section.appendChild(rtpNote);
  }

  parent.appendChild(section);
}

/**
 * @param {HTMLElement} parent
 * @param {object | null | undefined} game
 */
function appendPaytableGreenSquareSection(parent, game) {
  const section = document.createElement('section');
  section.className = 'suki-game-info-paytable-section';

  const heading = document.createElement('h3');
  heading.className = 'suki-game-info-paytable-section__title';
  heading.textContent = pickSocialCopy(game, 'Green algae square', 'Green algae square');

  const grid = document.createElement('div');
  grid.className = 'suki-game-info-paytable-grid suki-game-info-paytable-grid--features';

  const card = document.createElement('article');
  card.className = 'suki-game-info-paytable-card suki-game-info-paytable-card--info';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'suki-game-info-paytable-card__icon';
  appendGreenSquarePaytableIcon(iconWrap, game);

  const content = document.createElement('div');
  content.className = 'suki-game-info-paytable-card__content';

  const nameEl = document.createElement('span');
  nameEl.className = 'suki-game-info-paytable-card__name';
  nameEl.textContent = pickSocialCopy(game, 'Green Algae Square', 'Green Algae Square');

  const valueEl = document.createElement('span');
  valueEl.className = 'suki-game-info-paytable-card__value';
  valueEl.textContent = pickSocialCopy(game, 'No payout value', 'No Earn Value');

  const descEl = document.createElement('span');
  descEl.className = 'suki-game-info-paytable-card__desc';
  descEl.textContent = pickSocialCopy(
    game,
    'Not a paying symbol — a visual effect only. It can land on the bottom row of a reel (sometimes two stacked in one column). The green algae square holds briefly, then pops; the reel then shows the symbols that apply for that spin. Clusters and wins are evaluated only after it disappears. It does not change your win or round result.',
    'Not a qualifying symbol — a visual effect only. It can land on the bottom row of a reel (sometimes two stacked in one column). The green algae square holds briefly, then pops; the reel then shows the symbols that apply for that spin. Clusters are evaluated only after it disappears. It does not change your round result.',
  );

  content.append(nameEl, valueEl, descEl);
  card.append(iconWrap, content);
  grid.appendChild(card);

  section.append(heading, grid);
  parent.appendChild(section);
}

/**
 * @param {object} ctx
 * @param {(key: string, vars?: Record<string, string | number>) => string} ctx.t
 * @param {object | null | undefined} ctx.game
 * @param {HTMLElement} target
 */
function renderPaytableContent(target, { t, game }) {
  const payById = Object.fromEntries(CLUSTER_PAYTABLE.map((pay) => [pay.symbolId, pay]));
  /** @param {string[]} ids */
  const paysForIds = (ids) => ids.map((id) => payById[id]).filter(Boolean);

  const root = document.createElement('div');
  root.className = 'suki-game-info-paytable';

  const intro = document.createElement('p');
  intro.className = 'suki-game-info-paytable-intro';
  intro.textContent = pickSocialCopy(
    game,
    `Payout multipliers per cluster size at cascade step ×1 (first win in a spin). Values are per $1 bet before the cascade ladder.`,
    `Payout multipliers per cluster size at cascade step ×1 (first qualifying cluster in a round). Values are on a 1× round before the cascade ladder.`,
  );
  root.appendChild(intro);

  appendPaytableSection(
    root,
    pickSocialCopy(game, 'Ordinary symbols', 'Ordinary symbols'),
    paysForIds(ORDINARY_SYMBOLS),
  );
  appendPaytableSection(
    root,
    pickSocialCopy(game, 'Premium symbols', 'Premium symbols'),
    paysForIds(PREMIUM_SYMBOLS),
  );
  appendPaytableFeatureSection(root, game);
  appendPaytableGreenSquareSection(root, game);
  appendFreeSpinsRulesSection(root, game);

  const rules = document.createElement('div');
  rules.className = 'suki-game-info-paytable-rules';

  const sizeTitle = document.createElement('p');
  sizeTitle.className = 'suki-game-info-paytable-rules__title';
  sizeTitle.textContent = pickSocialCopy(
    game,
    'Cluster size multiplier (reference)',
    'Cluster size multiplier (reference)',
  );
  rules.appendChild(sizeTitle);

  const chipRow = document.createElement('div');
  chipRow.className = 'suki-game-info-paytable-chips';
  for (const [size, mult] of Object.entries(CLUSTER_SIZE_MULTIPLIERS)) {
    const chip = document.createElement('span');
    chip.className = 'suki-game-info-paytable-chip';
    chip.textContent = `${size} = ×${mult}`;
    chipRow.appendChild(chip);
  }
  rules.appendChild(chipRow);

  const maxClusterSize = GAME.reels * GAME.rows;
  const fullBoardExample = formatPaytableStepMult(clusterStepMultiplier('CR', maxClusterSize));

  const largeClusterNote = document.createElement('p');
  largeClusterNote.className = 'suki-game-info-paytable-rules__note';
  largeClusterNote.textContent = pickSocialCopy(
    game,
    `Only clusters of ${MIN_CLUSTER_SIZE} or more connected paying symbols qualify; smaller groups pay nothing. Symbol cards show payout at cascade step ×1; multiply by the cascade ladder below for later wins in the same spin. Clusters of 13+ continue to increase (+×4 size multiplier per extra symbol — shown on each card). Example: ${SYMBOLS.CR.label} full-board cluster (${maxClusterSize} symbols) at step ×1 = ${fullBoardExample} per $1 bet. Each step and the round total are rounded to the nearest $0.01 per $1 bet. Only the amount returned by the Remote Game Server is credited.`,
    `Only clusters of ${MIN_CLUSTER_SIZE} or more connected qualifying symbols count; smaller groups award nothing. Symbol cards show amounts at cascade step ×1; multiply by the cascade ladder below for later wins in the same round. Clusters of 13+ continue to increase (+×4 size multiplier per extra symbol — shown on each card). Example: ${SYMBOLS.CR.label} full-board cluster (${maxClusterSize} symbols) at step ×1 = ${fullBoardExample} on a 1× round. Each step and the round total are rounded to the nearest 0.01×. Only the amount returned by the Remote Game Server applies.`,
  );
  rules.appendChild(largeClusterNote);

  const cascadeTitle = document.createElement('p');
  cascadeTitle.className = 'suki-game-info-paytable-rules__title suki-game-info-paytable-rules__title--spaced';
  cascadeTitle.textContent = pickSocialCopy(
    game,
    'Cascade multiplier (each tumble after a win)',
    'Cascade multiplier (each tumble after a qualifying cluster)',
  );
  rules.appendChild(cascadeTitle);

  const cascadeChipRow = document.createElement('div');
  cascadeChipRow.className = 'suki-game-info-paytable-chips';
  for (let step = 1; step <= MAX_CASCADE_LADDER; step += 1) {
    const chip = document.createElement('span');
    chip.className = 'suki-game-info-paytable-chip';
    chip.textContent = `${step} = ×${cascadeMultiplier(step)}`;
    cascadeChipRow.appendChild(chip);
  }
  rules.appendChild(cascadeChipRow);

  const lowPayExample = formatBasePayMult(basePayForSymbol('CH'));
  const highPayExample = formatBasePayMult(basePayForSymbol('CR'));
  const cascadeNote = document.createElement('p');
  cascadeNote.className = 'suki-game-info-paytable-rules__note';
  cascadeNote.textContent = pickSocialCopy(
    game,
    `Each time winning symbols are removed and new ones tumble in counts as the next cascade step — the first win in a spin uses ×1, the second ×2, and so on up to ×${MAX_CASCADE_LADDER} (further cascades stay at ×${MAX_CASCADE_LADDER}). If several clusters win on the same step, they all use that step’s multiplier together. Step payout = base multiplier × cluster size multiplier × cascade multiplier (e.g. ${SYMBOLS.CH.label} from ${lowPayExample}, ${SYMBOLS.CR.label} from ${highPayExample} at minimum cluster size on a $1 bet).`,
    `Each time matched symbols are removed and new ones tumble in counts as the next cascade step — the first qualifying cluster in a round uses ×1, the second ×2, and so on up to ×${MAX_CASCADE_LADDER} (further cascades stay at ×${MAX_CASCADE_LADDER}). If several clusters qualify on the same step, they all use that step’s multiplier together. Step amount = base multiplier × cluster size multiplier × cascade multiplier (e.g. ${SYMBOLS.CH.label} from ${lowPayExample}, ${SYMBOLS.CR.label} from ${highPayExample} at minimum cluster size on a $1 round).`,
  );
  rules.appendChild(cascadeNote);

  appendGameModesSection(rules, game, { showRtp: Boolean(game?.controls?.showRtp) });

  const info = document.createElement('div');
  info.className = 'suki-game-info-footnote-block suki-game-info-paytable-rules__footnotes';
  const rounding = document.createElement('p');
  rounding.textContent = t('roundingNote');
  info.appendChild(rounding);

  const clusterRounding = document.createElement('p');
  clusterRounding.textContent = pickSocialCopy(
    game,
    'Per-cluster amounts on board pop-ups and the desktop win ledger during cascades are illustrative splits of each step and may differ slightly from the step or round total due to rounding. Only the final amount credited by the Remote Game Server applies.',
    'Per-cluster amounts on board pop-ups and the desktop win ledger during cascades are illustrative splits of each step and may differ slightly from the step or round total due to rounding. Only the final amount credited by the Remote Game Server applies.',
  );
  info.appendChild(clusterRounding);
  appendGeneralDisclaimer(info, t);
  rules.appendChild(info);
  root.appendChild(rules);
  target.appendChild(root);
}

/**
 * @param {HTMLElement} body
 * @param {object} ctx
 * @param {'how-to-play' | 'paytable'} initialTab
 */
function renderGameInfoModal(body, ctx, initialTab) {
  const { t, shell } = ctx;

  shell?.classList.add('suki-game-info-modal-open');

  const dialog = body.closest('.suki-modal-dialog');
  const header = dialog?.querySelector('.suki-modal-header');
  const existingClose = dialog?.querySelector('.suki-modal-close');
  if (existingClose && header && existingClose.parentElement !== header) {
    header.appendChild(existingClose);
  }

  body.innerHTML = '';
  body.classList.add('suki-game-info-body');

  const card = document.createElement('div');
  card.className = 'suki-game-info-card';

  const tabs = document.createElement('div');
  tabs.className = 'suki-game-info-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Game information');

  const howTab = document.createElement('button');
  howTab.type = 'button';
  howTab.className = 'suki-game-info-tab';
  howTab.id = 'suki-game-info-tab-how';
  howTab.textContent = 'How to Play';
  howTab.setAttribute('role', 'tab');

  const payTab = document.createElement('button');
  payTab.type = 'button';
  payTab.className = 'suki-game-info-tab';
  payTab.id = 'suki-game-info-tab-pay';
  payTab.textContent = t('paytableTitle');
  payTab.setAttribute('role', 'tab');

  const panel = document.createElement('div');
  panel.className = 'suki-game-info-panel';
  panel.setAttribute('role', 'tabpanel');

  function setTab(tabId) {
    const isHow = tabId === 'how-to-play';
    howTab.classList.toggle('active', isHow);
    howTab.setAttribute('aria-selected', isHow ? 'true' : 'false');
    payTab.classList.toggle('active', !isHow);
    payTab.setAttribute('aria-selected', !isHow ? 'true' : 'false');
    panel.id = isHow ? 'suki-game-info-panel-how' : 'suki-game-info-panel-pay';
    panel.setAttribute('aria-labelledby', isHow ? howTab.id : payTab.id);
    panel.classList.toggle('suki-game-info-panel--paytable', !isHow);
    destroyLedgerSpineIcons(panel);
    panel.innerHTML = '';
    if (isHow) renderHowToPlayContent(panel, ctx);
    else renderPaytableContent(panel, ctx);
  }

  howTab.addEventListener('click', () => setTab('how-to-play'));
  payTab.addEventListener('click', () => setTab('paytable'));

  tabs.append(howTab, payTab);

  const toolbar = document.createElement('div');
  toolbar.className = 'suki-game-info-toolbar';

  const closeSlot = document.createElement('div');
  closeSlot.className = 'suki-game-info-close-slot';
  closeSlot.setAttribute('aria-hidden', 'true');

  toolbar.append(tabs, closeSlot);
  card.append(toolbar, panel);
  body.appendChild(card);

  const closeBtn = dialog?.querySelector('.suki-modal-close');
  if (closeBtn) {
    closeBtn.classList.add('suki-game-info-close');
    closeSlot.appendChild(closeBtn);
    closeSlot.removeAttribute('aria-hidden');
  }

  setTab(initialTab);
}

/**
 * @param {object} ctx
 */
export function registerGameModals(ctx) {
  const {
    modalHost,
    recentResults,
    game,
    shell = null,
    formatCurrency = (n) => String(n),
    formatWin = formatCurrency,
  } = ctx;

  function t(key, vars) {
    return game?.t?.(key, vars) ?? game?.copy?.term?.(key) ?? key;
  }

  const renderCtx = { t, game, shell, formatCurrency, formatWin };

  modalHost.register(GAME_INFO_MODAL_ID, {
    title: '',
    render(body) {
      renderGameInfoModal(body, renderCtx, activeGameInfoTab);
    },
  });

  modalHost.register('stats', {
    title: 'Stats',
    render(body) {
      const p = document.createElement('p');
      p.textContent = 'Session stats are not tracked in v1.';
      body.appendChild(p);
    },
  });

  modalHost.register('recent-results', {
    title: 'Recent Results',
    render(body) {
      recentResults.renderList(
        body,
        (entry) => {
          const d = entry.data ?? entry;
          const mult = d.multiplier != null ? formatMult(d.multiplier) : '—';
          const payout = d.payout != null ? formatWin(d.payout) : '—';
          return `${d.summary ?? '—'} · ${mult} → ${payout}`;
        },
        'No spins yet — play to populate history.',
      );
    },
  });
}
