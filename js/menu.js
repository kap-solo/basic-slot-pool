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

  modalHost.register('how-to-play', {
    title: 'How to Play',
    render(body) {
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
          'Premium symbols pay more than ordinary symbols. Larger clusters multiply the win further.',
        ],
        [
          'Qualifying clusters are formed by connected matching symbols (not lines).',
          `Clusters must be at least ${MIN_CLUSTER_SIZE} symbols touching up, down, left, or right.`,
          `${wildLabel} substitutes for qualifying symbols when forming clusters. Wild cannot form a cluster on its own.`,
          'Matched symbols are removed; new symbols tumble in — cascades repeat until no further clusters qualify.',
          `Each cascade step uses an increasing multiplier (×1 … ×${MAX_CASCADE_LADDER}).`,
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
        'When several clusters win on the same cascade step, the amount shown on each cluster pop-up is split for display only. Those amounts may differ slightly from one another or from the step total due to rounding (even by a fraction of a cent). Your balance is always updated with the exact amount returned by the Remote Game Server when the round settles.',
        'When several clusters qualify on the same cascade step, the amount shown on each cluster pop-up is split for display only. Those amounts may differ slightly from one another or from the step total due to rounding (even by a fraction of a cent). Your balance is always updated with the exact amount returned by the Remote Game Server when the round settles.',
      );

      const p = document.createElement('p');
      p.textContent = intro;
      body.appendChild(p);
      const ul = document.createElement('ul');
      ul.style.marginTop = '0.75rem';
      ul.style.paddingLeft = '1.1rem';
      for (const line of bullets) {
        const li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
      }
      body.appendChild(ul);

      const blobTitle = document.createElement('p');
      blobTitle.style.marginTop = '0.85rem';
      blobTitle.style.fontWeight = '600';
      blobTitle.style.color = '#c5d0de';
      blobTitle.textContent = 'Green squares';
      body.appendChild(blobTitle);

      const blobIntroEl = document.createElement('p');
      blobIntroEl.style.marginTop = '0.35rem';
      blobIntroEl.style.fontSize = '0.85rem';
      blobIntroEl.textContent = blobIntro;
      body.appendChild(blobIntroEl);

      const blobUl = document.createElement('ul');
      blobUl.style.marginTop = '0.5rem';
      blobUl.style.paddingLeft = '1.1rem';
      for (const line of blobBullets) {
        const li = document.createElement('li');
        li.textContent = line;
        li.style.fontSize = '0.85rem';
        blobUl.appendChild(li);
      }
      body.appendChild(blobUl);

      const displayNoteEl = document.createElement('p');
      displayNoteEl.style.marginTop = '0.85rem';
      displayNoteEl.style.fontSize = '0.82rem';
      displayNoteEl.style.color = '#8b97a8';
      displayNoteEl.textContent = displayNote;
      body.appendChild(displayNoteEl);
    },
  });

  modalHost.register('paytable', {
    title: ({ game: g }) => g?.copy?.t('paytableTitle') ?? 'Paytable',
    render(body) {
      const wildLabel = SYMBOLS[WILD_SYMBOL].label;
      const wildGlyph = SYMBOLS[WILD_SYMBOL].glyph;

      const tableHeaders = pickSocialCopy(
        game,
        ['Cluster win', 'Base multiplier'],
        ['Symbol group', 'Base multiplier'],
      );

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '0.85rem';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const label of tableHeaders) {
        const th = document.createElement('th');
        th.textContent = label;
        th.style.textAlign = 'left';
        th.style.padding = '0.35rem 0';
        th.style.borderBottom = '1px solid #1f2733';
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
          td.style.padding = '0.35rem 0';
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
      body.appendChild(table);

      const sizeTitle = document.createElement('p');
      sizeTitle.style.marginTop = '0.75rem';
      sizeTitle.style.fontSize = '0.82rem';
      sizeTitle.style.color = '#c5d0de';
      sizeTitle.textContent = pickSocialCopy(
        game,
        'Cluster size multiplier (applied to base pay):',
        'Cluster size multiplier (applied to the base value above):',
      );
      body.appendChild(sizeTitle);

      const sizeList = document.createElement('p');
      sizeList.style.marginTop = '0.35rem';
      sizeList.style.fontSize = '0.8rem';
      sizeList.style.color = '#8b97a8';
      sizeList.textContent = Object.entries(CLUSTER_SIZE_MULTIPLIERS)
        .map(([size, mult]) => `${size} symbols = ×${mult}`)
        .join(' · ');
      body.appendChild(sizeList);

      const ladder = document.createElement('p');
      ladder.style.marginTop = '0.65rem';
      ladder.style.fontSize = '0.82rem';
      ladder.style.color = '#c5d0de';
      ladder.textContent = pickSocialCopy(
        game,
        `Cascade ladder: 1st win ×1 … ${MAX_CASCADE_LADDER}th+ ×${MAX_CASCADE_LADDER}. Step payout = base × cluster size mult × ladder. Each symbol has its own base pay (see table above) — e.g. cherry from ${formatBasePayMult(0.08)}, crown from ${formatBasePayMult(6)} on a $1 bet at minimum cluster size.`,
        `Cascade ladder: 1st qualifying cluster ×1 … ${MAX_CASCADE_LADDER}th+ ×${MAX_CASCADE_LADDER}. Step amount = base × cluster size mult × ladder. Each symbol has its own base multiplier (see table above) — e.g. cherry from ${formatBasePayMult(0.08)}, crown from ${formatBasePayMult(6)} at minimum cluster size on a $1 round.`,
      );
      body.appendChild(ladder);

      const wildNote = document.createElement('p');
      wildNote.style.marginTop = '0.65rem';
      wildNote.style.fontSize = '0.82rem';
      wildNote.style.color = '#c5d0de';
      wildNote.textContent = pickSocialCopy(
        game,
        `${wildGlyph} ${wildLabel} substitutes for paying symbols in clusters.`,
        `${wildGlyph} ${wildLabel} substitutes for qualifying symbols in clusters.`,
      );
      body.appendChild(wildNote);

      const info = document.createElement('div');
      info.style.marginTop = '0.75rem';
      info.style.fontSize = '0.8rem';
      info.style.color = '#8b97a8';
      if (game?.controls?.showRtp) {
        const rtp = document.createElement('p');
        rtp.style.margin = '0.25rem 0';
        rtp.textContent = `Target RTP ${GAME.targetRtpPercent}%`;
        info.appendChild(rtp);
      }
      const rounding = document.createElement('p');
      rounding.style.margin = '0.25rem 0';
      rounding.textContent = t('roundingNote');
      info.appendChild(rounding);

      const clusterRounding = document.createElement('p');
      clusterRounding.style.margin = '0.25rem 0';
      clusterRounding.textContent = pickSocialCopy(
        game,
        'Per-cluster win pop-ups during cascades are illustrative splits of each step and may differ slightly from the step or round total due to rounding. Only the final amount credited by the Remote Game Server applies.',
        'Per-cluster amount pop-ups during cascades are illustrative splits of each step and may differ slightly from the step or round total due to rounding. Only the final amount credited by the Remote Game Server applies.',
      );
      info.appendChild(clusterRounding);
      appendGeneralDisclaimer(info, t);
      body.appendChild(info);
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
