/**
 * Desktop bet UI — four grouped chrome panels (menu/stats, bet, spin, buy).
 */

import { isPopoutSViewport } from './stakeScreenInfer.js';
import {
  flashAutoplayStopClick,
  syncAutoplayBetControl,
} from '@kap-solo/suki-engine/client/suki/betChromeAutoplay.js';
import { syncAutoplayChromeHidden } from '@kap-solo/suki-engine/client/suki/autoplayVisibility.js';
import { ensureAutoHitWrap, mountAutoButtonGraphic } from './autoButtonGraphic.js';
import { ensureBuyHitWrap, mountBuyButtonGraphic } from './buyButtonGraphic.js';
import { getPlayControlMount } from './spinButtonGraphic.js';

/**
 * @param {object} options
 * @param {HTMLElement} options.root — `#bet-ui-root`
 * @param {HTMLElement} options.shell — `.suki-stake-shell`
 * @param {HTMLButtonElement} options.playButton — main spin / play control
 * @param {HTMLElement | null} [options.playRow] — stepper row to restore play into
 * @param {object} options.handlers
 * @param {() => void} options.handlers.onMenu
 * @param {() => void} options.handlers.onAuto
 * @param {() => boolean} [options.handlers.getAutoplayActive]
 * @param {() => boolean} [options.handlers.getAutoplayStopPending]
 * @param {() => string} [options.handlers.getAutoplayStopLabel]
 * @param {() => { current: number, total: number }} [options.handlers.getAutoplayProgress]
 * @param {() => void} options.handlers.onStepUp
 * @param {() => void} options.handlers.onStepDown
 * @param {() => string} options.handlers.getBalance
 * @param {() => string} options.handlers.getBet
 * @param {() => string} [options.handlers.getBetLabel]
 * @param {() => string} [options.handlers.getWinLabel]
 * @param {() => boolean} options.handlers.getBusy
 * @param {() => boolean} [options.handlers.getCanPickBet]
 * @param {() => void} [options.handlers.onBetPick]
 * @param {() => boolean} options.handlers.getAutoEnabled
 * @param {() => boolean} [options.handlers.getAutoVisible]
 * @param {() => void} [options.handlers.onBuy]
 * @param {() => boolean} [options.handlers.getBuyEnabled]
 * @param {() => string} [options.handlers.getBuyLabel]
 * @param {(buttons: { downButton: HTMLButtonElement, upButton: HTMLButtonElement }) => void} [options.handlers.syncStepper]
 */
export function mountDesktopBetUi({
  root,
  shell: stakeShell,
  playButton,
  playRow = null,
  handlers,
}) {
  const chrome = document.createElement('div');
  chrome.className = 'bet-ui-desktop-chrome';
  chrome.hidden = true;

  const dock = document.createElement('div');
  dock.className = 'bet-ui-desktop__dock';

  const menuStatsGroup = document.createElement('div');
  menuStatsGroup.className = 'bet-ui-desktop__group bet-ui-desktop__group--menu-stats';

  const betGroup = document.createElement('div');
  betGroup.className = 'bet-ui-desktop__group bet-ui-desktop__group--bet';

  const statsBetCluster = document.createElement('div');
  statsBetCluster.className = 'bet-ui-desktop__stats-bet-cluster';

  statsBetCluster.append(menuStatsGroup, betGroup);

  const playGroup = document.createElement('div');
  playGroup.className = 'bet-ui-desktop__group bet-ui-desktop__group--play';

  const buyGroup = document.createElement('div');
  buyGroup.className = 'bet-ui-desktop__group bet-ui-desktop__group--buy';

  const menuBtn = createIconButton('menu', 'Menu', '☰');

  const replayDisclaimer = document.createElement('p');
  replayDisclaimer.className = 'bet-ui-desktop__replay-disclaimer';
  replayDisclaimer.hidden = true;
  replayDisclaimer.textContent = '';

  const balanceStat = createStatBlock('balance', 'Balance');
  const winStat = createStatBlock('win', 'Win');
  winStat.valueEl.classList.add('bet-ui-desktop__stat-value--win');
  winStat.valueEl.textContent = '';

  menuStatsGroup.append(menuBtn, replayDisclaimer, balanceStat.root, winStat.root);

  const betPickBtn = createBetPickButton();
  const stepper = document.createElement('div');
  stepper.className = 'bet-ui-desktop__stepper';
  const betUpBtn = createStepButton('up', 'Increase bet', '+');
  const betDownBtn = createStepButton('down', 'Decrease bet', '−');
  stepper.append(betUpBtn, betDownBtn);
  betGroup.append(betPickBtn.root, stepper);

  const spinSlot = document.createElement('div');
  spinSlot.className = 'bet-ui-desktop__spin';

  const autoCluster = document.createElement('div');
  autoCluster.className = 'bet-ui-desktop__auto-cluster';
  const autoBtn = createIconButton('auto', 'Autoplay', '');
  ensureAutoHitWrap(autoBtn);
  const autoProgress = document.createElement('span');
  autoProgress.className = 'bet-ui-desktop__auto-progress';
  autoProgress.hidden = true;
  autoCluster.append(autoBtn, autoProgress);

  const autoPanel = document.createElement('div');
  autoPanel.className = 'bet-ui-desktop__auto-panel';
  autoPanel.append(autoCluster);

  playGroup.append(spinSlot, autoPanel);

  const buyBtn = createBuyButton();
  ensureBuyHitWrap(buyBtn);
  buyGroup.append(buyBtn);

  dock.append(statsBetCluster, playGroup, buyGroup);
  chrome.append(dock);
  stakeShell.appendChild(chrome);

  const statValueEls = [balanceStat.valueEl, winStat.valueEl, betPickBtn.valueEl];
  let fitRaf = 0;
  function scheduleFitAllStatValues() {
    if (fitRaf) return;
    fitRaf = requestAnimationFrame(() => {
      fitRaf = 0;
      fitAllStatValues();
    });
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => scheduleFitAllStatValues())
    : null;

  resizeObserver?.observe(menuStatsGroup);
  resizeObserver?.observe(statsBetCluster);

  for (const stat of [balanceStat, winStat, betPickBtn]) {
    resizeObserver?.observe(stat.root);
  }

  let active = false;
  let replayChrome = false;

  function setReplayChrome(isReplay, { disclaimer } = {}) {
    replayChrome = isReplay;
    chrome.classList.toggle('bet-ui-desktop-chrome--replay', isReplay);
    menuBtn.hidden = isReplay;
    balanceStat.root.hidden = isReplay;
    betGroup.hidden = isReplay;
    playGroup.hidden = isReplay;
    buyGroup.hidden = isReplay;
    replayDisclaimer.hidden = !isReplay;
    if (disclaimer) {
      replayDisclaimer.textContent = disclaimer;
    }
    sync();
  }

  function restorePlayButton() {
    const mount = getPlayControlMount(playButton);
    if (!playRow || !mount || mount.parentNode === playRow) return;
    const upButton = playRow.querySelector('.suki-bet-step--up');
    if (upButton) {
      playRow.insertBefore(mount, upButton);
    } else {
      playRow.appendChild(mount);
    }
    playButton.classList.remove('bet-ui-desktop__play');
  }

  function setActive(desktop) {
    active = desktop;
    chrome.hidden = !desktop;
    root.classList.toggle('bet-ui-desktop-active', desktop);

    if (desktop) {
      const mount = getPlayControlMount(playButton);
      if (mount) spinSlot.appendChild(mount);
      playButton.classList.add('bet-ui-desktop__play');
      playButton.setAttribute('aria-label', 'Spin');
    } else {
      restorePlayButton();
    }
    sync();
    if (desktop) {
      requestAnimationFrame(() => fitAllStatValues());
    }
  }

  function isPopoutSLayout() {
    return isPopoutSViewport(stakeShell);
  }

  function fitStatValue(valueEl) {
    valueEl.style.fontSize = '';
    const max = parseFloat(getComputedStyle(valueEl).fontSize) || 15;
    const min = isPopoutSLayout() ? 5 : 6;
    let size = max;
    valueEl.style.fontSize = `${size}px`;

    while (size > min && valueEl.scrollWidth > valueEl.clientWidth + 1) {
      size -= 0.25;
      valueEl.style.fontSize = `${size}px`;
    }

    if (valueEl.textContent) {
      valueEl.title = valueEl.scrollWidth > valueEl.clientWidth + 1
        ? valueEl.textContent
        : '';
    }
  }

  function fitAllStatValues() {
    if (!active) return;
    // Balance first — longest currency strings get the widest flex slice before bet/win shrink.
    fitStatValue(balanceStat.valueEl);
    fitStatValue(winStat.valueEl);
    fitStatValue(betPickBtn.valueEl);
  }

  function updateWin({ text, visible, settled = false, hiding = false }) {
    if (!active) return;

    winStat.valueEl.textContent = text;
    winStat.valueEl.classList.toggle('is-visible', visible);
    winStat.valueEl.classList.toggle('is-settled', settled);
    winStat.valueEl.classList.toggle('is-hiding', hiding);
    if (isPopoutSLayout() && !replayChrome) {
      winStat.root.hidden = !visible;
    }
    fitAllStatValues();
    requestAnimationFrame(() => fitAllStatValues());
  }

  function syncAutoVisibility() {
    const autoplayActive = handlers.getAutoplayActive?.() ?? false;
    const stopPending = autoplayActive && (handlers.getAutoplayStopPending?.() ?? false);
    const autoVisible = autoplayActive || (handlers.getAutoVisible?.() ?? true);
    syncAutoplayChromeHidden({
      root: autoCluster,
      panel: autoPanel,
      replayChrome,
      autoplaying: autoplayActive,
      stopPending,
      visible: autoVisible,
    });
  }

  function sync() {
    syncAutoVisibility();
    if (!active) return;

    balanceStat.valueEl.textContent = handlers.getBalance();
    betPickBtn.labelEl.textContent = handlers.getBetLabel?.() ?? 'Bet';
    betPickBtn.valueEl.textContent = handlers.getBet();
    winStat.labelEl.textContent = handlers.getWinLabel?.() ?? 'Win';
    if (isPopoutSLayout() && !replayChrome) {
      winStat.root.hidden = !winStat.valueEl.classList.contains('is-visible');
    }
    fitAllStatValues();
    requestAnimationFrame(() => fitAllStatValues());

    const busy = handlers.getBusy();
    const canPickBet = handlers.getCanPickBet?.() ?? !busy;
    betUpBtn.disabled = busy;
    betDownBtn.disabled = busy;
    betPickBtn.button.disabled = !canPickBet;

    const autoplayActive = handlers.getAutoplayActive?.() ?? false;
    const stopPending = autoplayActive && (handlers.getAutoplayStopPending?.() ?? false);
    const progress = handlers.getAutoplayProgress?.() ?? { current: 0, total: 0 };
    const iconEl = autoBtn.querySelector('.bet-ui-desktop__icon');

    if (iconEl) {
      iconEl.textContent = autoplayActive ? '■' : '';
    }

    syncAutoplayBetControl({
      button: autoBtn,
      cluster: autoCluster,
      panel: autoPanel,
      progressEl: autoProgress,
      autoplaying: autoplayActive,
      stopPending,
      stopMode: autoplayActive,
      stopLabel: handlers.getAutoplayStopLabel?.() ?? 'Stopping…',
      progress,
      disabled: stopPending
        ? true
        : autoplayActive
          ? false
          : (!handlers.getAutoEnabled() || busy),
    });

    mountAutoButtonGraphic(ensureAutoHitWrap(autoBtn));

    buyBtn.disabled = busy || !(handlers.getBuyEnabled?.() ?? false);
    buyBtn.setAttribute('aria-label', handlers.getBuyLabel?.() ?? 'Buy bonus');

    mountBuyButtonGraphic(ensureBuyHitWrap(buyBtn));

    handlers.syncStepper?.({ downButton: betDownBtn, upButton: betUpBtn });
  }

  menuBtn.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onMenu();
  });
  autoBtn.addEventListener('click', () => {
    if (handlers.getAutoplayActive?.() && !handlers.getAutoplayStopPending?.()) {
      flashAutoplayStopClick(autoBtn);
    }
    handlers.onAuto();
  });
  buyBtn.addEventListener('click', () => handlers.onBuy?.());
  betUpBtn.addEventListener('click', () => handlers.onStepUp());
  betDownBtn.addEventListener('click', () => handlers.onStepDown());
  betPickBtn.button.addEventListener('click', () => {
    if (betPickBtn.button.disabled) return;
    handlers.onBetPick?.();
  });

  return {
    setActive,
    setReplayChrome,
    sync,
    updateWin,
    destroy() {
      if (fitRaf) {
        cancelAnimationFrame(fitRaf);
        fitRaf = 0;
      }
      resizeObserver?.disconnect();
      restorePlayButton();
      chrome.remove();
      root.classList.remove('bet-ui-desktop-active');
    },
  };
}

function createBuyButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bet-ui-desktop__buy-btn';
  button.dataset.betUiPart = 'buy';
  button.setAttribute('aria-label', 'Buy bonus');
  button.textContent = '';
  return button;
}

/**
 * @param {string} part
 * @param {string} label
 * @param {string} icon
 */
function createIconButton(part, label, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `bet-ui-desktop__icon-btn bet-ui-desktop__icon-btn--${part}${part === 'auto' ? ' suki-autoplay-btn' : ''}`;
  button.dataset.betUiPart = part;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span class="bet-ui-desktop__icon${part === 'auto' ? ' suki-autoplay-btn__icon' : ''}" aria-hidden="true">${icon}</span>`;
  return button;
}

/**
 * @param {string} part
 * @param {string} label
 * @param {string} glyph
 */
function createStepButton(part, label, glyph) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `bet-ui-desktop__bet-step bet-ui-desktop__bet-step--${part}`;
  button.dataset.betUiPart = part;
  button.setAttribute('aria-label', label);
  button.textContent = glyph;
  return button;
}

/**
 * Bet amount picker — label comes from game copy (Bet / Play in social mode).
 */
function createBetPickButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bet-ui-desktop__stat bet-ui-desktop__stat--bet bet-ui-desktop__bet-pick';
  button.dataset.betUiPart = 'bet';

  const labelEl = document.createElement('span');
  labelEl.className = 'bet-ui-desktop__stat-label';
  labelEl.textContent = 'Bet';

  const valueEl = document.createElement('span');
  valueEl.className = 'bet-ui-desktop__stat-value';
  valueEl.textContent = '—';

  button.append(labelEl, valueEl);
  return { root: button, button, labelEl, valueEl };
}

/**
 * @param {string} part
 * @param {string} label
 */
function createStatBlock(part, label) {
  const root = document.createElement('div');
  root.className = `bet-ui-desktop__stat bet-ui-desktop__stat--${part}`;
  root.dataset.betUiPart = part;

  const labelEl = document.createElement('span');
  labelEl.className = 'bet-ui-desktop__stat-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'bet-ui-desktop__stat-value';
  valueEl.textContent = '—';

  root.append(labelEl, valueEl);
  return { root, labelEl, valueEl };
}
