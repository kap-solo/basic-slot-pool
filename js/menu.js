/**
 * Basic Slot — burger menu modals.
 */

import { appendGeneralDisclaimer, pickSocialCopy } from '@kap-solo/suki-engine/client/rgs.js';
import {
  CLUSTER_PAYTABLE,
  CLUSTER_SIZE_MULTIPLIERS,
  MAX_CASCADE_LADDER,
  MIN_CLUSTER_SIZE,
  formatBasePayMult,
  formatSymbolList,
} from './cluster.js';
import { GAME, SYMBOLS, WILD_SYMBOL } from './config.js';
import { formatMult } from './slot.js';

export const GAME_INFO_MODAL_ID = 'game-info';

/** @type {'how-to-play' | 'paytable'} */
let activeGameInfoTab = 'how-to-play';

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
  const boardNote =
    `The ${GAME.reels}×${GAME.rows} board outcome is decided by the RGS before the reels stop — animation is presentation only.`;

  const intro = pickSocialCopy(
    game,
    `Choose a ${t('bet').toLowerCase()} and press Spin. ${boardNote}`,
    `Choose your ${t('betAmount').toLowerCase()} and press Spin. ${boardNote}`,
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
      'Matched symbols are removed; new symbols tumble in — cascades repeat until no further clusters qualify.',
      `Each cascade step uses an increasing multiplier (×1 … ×${MAX_CASCADE_LADDER}).`,
      'If several clusters qualify on the same cascade step, they all use that step’s multiplier at once — the ladder does not advance separately for each cluster.',
      'Premium symbols award higher multipliers than ordinary symbols. Larger clusters apply a higher multiplier.',
    ],
  );

  const blobIntro =
    'Sometimes a green square lands on the bottom row of a reel — occasionally two on the bottom rows of the same column. Green squares are not symbols and have no value. This is a visual effect only; your spin result is already decided before the reels stop.';

  const blobBullets = pickSocialCopy(
    game,
    [
      'The green square holds briefly, then pops. The reel strip falls to show the true symbols underneath.',
      'Clusters and wins are evaluated only after the green square disappears — not while it is on screen.',
      'A green square does not change your win or round result. It can hide winning symbols for a moment, so a good spin may look like a miss until the cascade finishes.',
    ],
    [
      'The green square holds briefly, then pops. The reel strip falls to show the true symbols underneath.',
      'Clusters are evaluated only after the green square disappears — not while it is on screen.',
      'A green square does not change your round result. It can briefly hide matched symbols, so a successful spin may look like a miss until the cascade finishes.',
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
  blobTitle.textContent = 'Green squares';
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
}

/**
 * @param {object} ctx
 * @param {(key: string, vars?: Record<string, string | number>) => string} ctx.t
 * @param {object | null | undefined} ctx.game
 * @param {HTMLElement} target
 */
function renderPaytableContent(target, { t, game }) {
  const wildLabel = SYMBOLS[WILD_SYMBOL].label;
  const wildGlyph = SYMBOLS[WILD_SYMBOL].glyph;

  const tableHeaders = pickSocialCopy(
    game,
    ['Cluster win', 'Base multiplier'],
    ['Symbol group', 'Base multiplier'],
  );

  const table = document.createElement('table');
  table.className = 'suki-game-info-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of tableHeaders) {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const pay of CLUSTER_PAYTABLE) {
    const tr = document.createElement('tr');
    const label = `${pay.label} (${pay.minSize}+ connected): ${formatSymbolList(pay.symbols)}`;
    const mult = formatBasePayMult(pay.multiplier);
    for (const cell of [label, mult]) {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  target.appendChild(table);

  const sizeTitle = document.createElement('p');
  sizeTitle.className = 'suki-game-info-note suki-game-info-note--emphasis';
  sizeTitle.textContent = pickSocialCopy(
    game,
    'Cluster size multiplier (applied to base pay):',
    'Cluster size multiplier (applied to the base value above):',
  );
  target.appendChild(sizeTitle);

  const sizeList = document.createElement('p');
  sizeList.className = 'suki-game-info-footnote';
  sizeList.textContent = Object.entries(CLUSTER_SIZE_MULTIPLIERS)
    .map(([size, mult]) => `${size} symbols = ×${mult}`)
    .join(' · ');
  target.appendChild(sizeList);

  const ladder = document.createElement('p');
  ladder.className = 'suki-game-info-note suki-game-info-note--emphasis';
  ladder.textContent = pickSocialCopy(
    game,
    `Cascade ladder: 1st win ×1 … ${MAX_CASCADE_LADDER}th+ ×${MAX_CASCADE_LADDER}. Step payout = base × cluster size mult × ladder. Each symbol has its own base pay (see table above) — e.g. cherry from ${formatBasePayMult(0.08)}, crown from ${formatBasePayMult(6)} on a $1 bet at minimum cluster size.`,
    `Cascade ladder: 1st qualifying cluster ×1 … ${MAX_CASCADE_LADDER}th+ ×${MAX_CASCADE_LADDER}. Step amount = base × cluster size mult × ladder. Each symbol has its own base multiplier (see table above) — e.g. cherry from ${formatBasePayMult(0.08)}, crown from ${formatBasePayMult(6)} at minimum cluster size on a $1 round.`,
  );
  target.appendChild(ladder);

  const wildNote = document.createElement('p');
  wildNote.className = 'suki-game-info-note suki-game-info-note--emphasis';
  wildNote.textContent = pickSocialCopy(
    game,
    `${wildGlyph} ${wildLabel} substitutes for paying symbols in clusters.`,
    `${wildGlyph} ${wildLabel} substitutes for qualifying symbols in clusters.`,
  );
  target.appendChild(wildNote);

  const info = document.createElement('div');
  info.className = 'suki-game-info-footnote-block';
  if (game?.controls?.showRtp) {
    const rtp = document.createElement('p');
    rtp.textContent = `Target RTP ${GAME.targetRtpPercent}%`;
    info.appendChild(rtp);
  }
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
  target.appendChild(info);
}

/**
 * @param {HTMLElement} body
 * @param {object} ctx
 * @param {'how-to-play' | 'paytable'} initialTab
 */
function renderGameInfoModal(body, ctx, initialTab) {
  const { t } = ctx;

  body.innerHTML = '';
  body.classList.add('suki-game-info-body');

  const root = document.createElement('div');
  root.className = 'suki-game-info';

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
    panel.innerHTML = '';
    if (isHow) renderHowToPlayContent(panel, ctx);
    else renderPaytableContent(panel, ctx);
  }

  howTab.addEventListener('click', () => setTab('how-to-play'));
  payTab.addEventListener('click', () => setTab('paytable'));

  tabs.append(howTab, payTab);
  root.append(tabs, panel);
  body.appendChild(root);

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
    formatCurrency = (n) => String(n),
    formatWin = formatCurrency,
  } = ctx;

  function t(key, vars) {
    return game?.t?.(key, vars) ?? game?.copy?.term?.(key) ?? key;
  }

  const renderCtx = { t, game, formatCurrency, formatWin };

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
