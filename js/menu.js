/**
 * Basic Slot — burger menu modals.
 */

import { appendGeneralDisclaimer } from '@kap-solo/suki-engine/client/rgs.js';
import {
  CLUSTER_PAYTABLE,
  CLUSTER_SIZE_MULTIPLIERS,
  MAX_CASCADE_LADDER,
  MIN_CLUSTER_SIZE,
  formatSymbolList,
} from './cluster.js';
import { GAME, SYMBOLS, WILD_SYMBOL } from './config.js';
import { formatMult } from './slot.js';

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
      const p = document.createElement('p');
      p.textContent =
        `Choose a bet and press Spin. The ${GAME.reels}×${GAME.rows} board outcome is decided by the RGS before the reels stop — animation is presentation only.`;
      body.appendChild(p);
      const ul = document.createElement('ul');
      ul.style.marginTop = '0.75rem';
      ul.style.paddingLeft = '1.1rem';
      for (const line of [
        'Wins pay on clusters of matching symbols (not paylines).',
        `Clusters must be at least ${MIN_CLUSTER_SIZE} symbols touching up, down, left, or right.`,
        `${SYMBOLS[WILD_SYMBOL].label} substitutes for any paying symbol when forming clusters. Wild does not pay on its own.`,
        'Winning symbols are removed; new symbols tumble in — cascades repeat until no cluster pays.',
        `Each cascade step uses an increasing multiplier (×1 … ×${MAX_CASCADE_LADDER}).`,
        'Premium symbols pay more than ordinary symbols. Larger clusters multiply the win further.',
      ]) {
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

      const blobIntro = document.createElement('p');
      blobIntro.style.marginTop = '0.35rem';
      blobIntro.style.fontSize = '0.85rem';
      blobIntro.textContent =
        'Sometimes a green square lands on the bottom row of a reel — occasionally two on the bottom rows of the same column. This is a visual effect only; your spin result is already decided before the reels stop.';
      body.appendChild(blobIntro);

      const blobUl = document.createElement('ul');
      blobUl.style.marginTop = '0.5rem';
      blobUl.style.paddingLeft = '1.1rem';
      for (const line of [
        'The green square holds briefly, then pops. The reel strip falls to show the true symbols underneath.',
        'Clusters and wins are evaluated only after the green square disappears — not while it is on screen.',
        'A green square does not change your payout. It can hide winning symbols for a moment, so a good spin may look like a miss until the cascade finishes.',
      ]) {
        const li = document.createElement('li');
        li.textContent = line;
        li.style.fontSize = '0.85rem';
        blobUl.appendChild(li);
      }
      body.appendChild(blobUl);
    },
  });

  modalHost.register('paytable', {
    title: 'Paytable',
    render(body) {
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '0.85rem';

      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      for (const label of ['Cluster win', 'Base multiplier']) {
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
        const mult = formatMult(pay.multiplier);
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
      sizeTitle.textContent = 'Cluster size multiplier (applied to base pay):';
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
      ladder.textContent = `Cascade ladder: 1st win ×1 … ${MAX_CASCADE_LADDER}th+ ×${MAX_CASCADE_LADDER}. Step payout = base × cluster size mult × ladder. On a $1 bet, ordinary clusters start at $0.10 (0.1×); typical small hits land around $0.20 and $0.60. Premium minimum is $5 (5×).`;
      body.appendChild(ladder);

      const wildNote = document.createElement('p');
      wildNote.style.marginTop = '0.65rem';
      wildNote.style.fontSize = '0.82rem';
      wildNote.style.color = '#c5d0de';
      wildNote.textContent = `${SYMBOLS[WILD_SYMBOL].glyph} ${SYMBOLS[WILD_SYMBOL].label} substitutes for paying symbols in clusters.`;
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
