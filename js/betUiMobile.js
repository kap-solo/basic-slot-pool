/**
 * Mobile bet UI — action row (menu, autoplay, spin) + info row (balance, bet, win).
 */

/**
 * @param {object} options
 * @param {HTMLElement} options.root — `#bet-ui-root`
 * @param {HTMLElement} options.shell — `.suki-stake-shell`
 * @param {HTMLButtonElement} options.playButton — main spin / play control
 * @param {HTMLElement | null} [options.playRow] — desktop stepper row to restore play into
 * @param {object} options.handlers
 * @param {() => void} options.handlers.onMenu
 * @param {() => void} options.handlers.onAuto
 * @param {() => boolean} [options.handlers.getAutoplayActive]
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
export function mountMobileBetUi({
  root,
  shell: stakeShell,
  playButton,
  playRow = null,
  handlers,
}) {
  const chrome = document.createElement('div');
  chrome.className = 'bet-ui-mobile-chrome';
  chrome.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'bet-ui-mobile__actions';

  const actionsStart = document.createElement('div');
  actionsStart.className = 'bet-ui-mobile__actions-start';

  const menuBtn = createIconButton('menu', 'Menu', '☰');
  const autoCluster = document.createElement('div');
  autoCluster.className = 'bet-ui-mobile__auto-cluster';
  const autoBtn = createIconButton('auto', 'Autoplay', '');
  const autoProgress = document.createElement('span');
  autoProgress.className = 'bet-ui-mobile__auto-progress';
  autoProgress.hidden = true;
  autoCluster.append(autoBtn, autoProgress);

  const spinCluster = document.createElement('div');
  spinCluster.className = 'bet-ui-mobile__spin-cluster';

  const playCluster = document.createElement('div');
  playCluster.className = 'bet-ui-mobile__play-cluster';

  const betDownBtn = createActionStepButton('down', 'Decrease bet', '−');
  const spinSlot = document.createElement('div');
  spinSlot.className = 'bet-ui-mobile__spin';
  const betUpBtn = createActionStepButton('up', 'Increase bet', '+');

  playCluster.append(betDownBtn, spinSlot, betUpBtn);
  spinCluster.append(autoCluster, playCluster);

  actionsStart.append(menuBtn);
  actions.append(actionsStart, spinCluster);

  const actionsEnd = document.createElement('div');
  actionsEnd.className = 'bet-ui-mobile__actions-end';
  const buyBtn = createBuyButton();
  actionsEnd.append(buyBtn);
  actions.append(actionsEnd);

  const info = document.createElement('div');
  info.className = 'bet-ui-mobile__info';

  const infoBar = document.createElement('div');
  infoBar.className = 'bet-ui-mobile__info-bar';

  const balanceStat = createStatBlock('balance', 'Balance');
  const betPickBtn = createBetPickButton();

  const winStat = createStatBlock('win', 'Win');
  winStat.valueEl.classList.add('bet-ui-mobile__stat-value--win');
  winStat.valueEl.textContent = '';

  infoBar.append(balanceStat.root, betPickBtn.root, winStat.root);
  info.append(infoBar);
  chrome.append(actions, info);
  stakeShell.appendChild(chrome);

  const statValueEls = [balanceStat.valueEl, betPickBtn.valueEl, winStat.valueEl];
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

  for (const el of [infoBar, balanceStat.root, betPickBtn.root, betPickBtn.valueEl, winStat.root, playCluster]) {
    resizeObserver?.observe(el);
  }

  let active = false;

  function restorePlayButton() {
    if (!playRow || playButton.parentNode === playRow) return;
    const upButton = playRow.querySelector('.suki-bet-step--up');
    if (upButton) {
      playRow.insertBefore(playButton, upButton);
    } else {
      playRow.appendChild(playButton);
    }
    playButton.classList.remove('bet-ui-mobile__play');
  }

  function setActive(mobile) {
    active = mobile;
    chrome.hidden = !mobile;
    root.classList.toggle('bet-ui-mobile-active', mobile);

    if (mobile) {
      spinSlot.appendChild(playButton);
      playButton.classList.add('bet-ui-mobile__play');
      playButton.setAttribute('aria-label', 'Spin');
      sync();
      requestAnimationFrame(() => fitAllStatValues());
    } else {
      restorePlayButton();
    }
  }

  function fitStatValue(valueEl) {
    valueEl.style.fontSize = '';
    const max = parseFloat(getComputedStyle(valueEl).fontSize) || 15;
    const min = Math.max(5, max * 0.32);
    let size = max;
    valueEl.style.fontSize = `${size}px`;

    const fitWidth = Math.max(
      1,
      valueEl.clientWidth
        || valueEl.parentElement?.clientWidth
        || valueEl.getBoundingClientRect().width,
    );

    while (size > min && valueEl.scrollWidth > fitWidth + 1) {
      size -= 0.25;
      valueEl.style.fontSize = `${size}px`;
    }
  }

  function fitAllStatValues() {
    if (!active) return;
    for (const valueEl of statValueEls) {
      fitStatValue(valueEl);
    }
  }

  function updateWin({ text, visible, settled = false, hiding = false }) {
    if (!active) return;

    winStat.valueEl.textContent = text;
    winStat.valueEl.classList.toggle('is-visible', visible);
    winStat.valueEl.classList.toggle('is-settled', settled);
    winStat.valueEl.classList.toggle('is-hiding', hiding);
    fitStatValue(winStat.valueEl);
    requestAnimationFrame(() => fitStatValue(winStat.valueEl));
  }

  function sync() {
    if (!active) return;

    balanceStat.valueEl.textContent = handlers.getBalance();
    betPickBtn.labelEl.textContent = handlers.getBetLabel?.() ?? 'Bet';
    betPickBtn.valueEl.textContent = handlers.getBet();
    winStat.labelEl.textContent = handlers.getWinLabel?.() ?? 'Win';
    fitAllStatValues();
    requestAnimationFrame(() => fitAllStatValues());

    const busy = handlers.getBusy();
    const canPickBet = handlers.getCanPickBet?.() ?? !busy;
    betUpBtn.disabled = busy;
    betDownBtn.disabled = busy;
    betPickBtn.button.disabled = !canPickBet;

    const autoplayActive = handlers.getAutoplayActive?.() ?? false;
    const autoVisible = handlers.getAutoVisible?.() ?? true;
    autoCluster.hidden = !autoVisible;

    const progress = handlers.getAutoplayProgress?.() ?? { current: 0, total: 0 };
    const iconEl = autoBtn.querySelector('.bet-ui-mobile__icon');

    autoBtn.classList.toggle('bet-ui-mobile__icon-btn--stop', autoplayActive);
    if (iconEl) {
      iconEl.textContent = autoplayActive ? '■' : '';
    }
    autoBtn.setAttribute('aria-label', autoplayActive ? 'Stop autoplay' : 'Autoplay');

    if (autoplayActive && progress.total > 0) {
      autoProgress.hidden = false;
      autoProgress.textContent = `${progress.current} / ${progress.total}`;
    } else {
      autoProgress.hidden = true;
      autoProgress.textContent = '';
    }

    autoBtn.disabled = autoplayActive ? false : (!handlers.getAutoEnabled() || busy);

    buyBtn.disabled = busy || !(handlers.getBuyEnabled?.() ?? false);
    buyBtn.textContent = 'Buy';

    handlers.syncStepper?.({ downButton: betDownBtn, upButton: betUpBtn });
  }

  menuBtn.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  menuBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    handlers.onMenu();
  });
  autoBtn.addEventListener('click', () => handlers.onAuto());
  buyBtn.addEventListener('click', () => handlers.onBuy?.());
  betUpBtn.addEventListener('click', () => handlers.onStepUp());
  betDownBtn.addEventListener('click', () => handlers.onStepDown());
  betPickBtn.button.addEventListener('click', () => {
    if (betPickBtn.button.disabled) return;
    handlers.onBetPick?.();
  });

  return {
    setActive,
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
      root.classList.remove('bet-ui-mobile-active');
    },
  };
}

function createBuyButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bet-ui-mobile__buy-btn';
  button.dataset.betUiPart = 'buy';
  button.setAttribute('aria-label', 'Buy bonus');
  button.textContent = 'Buy';
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
  button.className = `bet-ui-mobile__icon-btn bet-ui-mobile__icon-btn--${part}`;
  button.dataset.betUiPart = part;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span class="bet-ui-mobile__icon" aria-hidden="true">${icon}</span>`;
  return button;
}

/**
 * @param {string} part
 * @param {string} label
 * @param {string} glyph
 */
function createActionStepButton(part, label, glyph) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `bet-ui-mobile__action-step bet-ui-mobile__action-step--${part}`;
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
  button.className = 'bet-ui-mobile__stat bet-ui-mobile__stat--bet bet-ui-mobile__bet-pick';
  button.dataset.betUiPart = 'bet';

  const labelEl = document.createElement('span');
  labelEl.className = 'bet-ui-mobile__stat-label';
  labelEl.textContent = 'Bet';

  const valueEl = document.createElement('span');
  valueEl.className = 'bet-ui-mobile__stat-value';
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
  root.className = `bet-ui-mobile__stat bet-ui-mobile__stat--${part}`;
  root.dataset.betUiPart = part;

  const labelEl = document.createElement('span');
  labelEl.className = 'bet-ui-mobile__stat-label';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'bet-ui-mobile__stat-value';
  valueEl.textContent = '—';

  root.append(labelEl, valueEl);
  return { root, labelEl, valueEl };
}
