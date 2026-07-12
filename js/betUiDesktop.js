/**
 * Desktop bet UI — bottom chrome bar (menu, stats, stepper, spin, autoplay).
 */

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

  const bar = document.createElement('div');
  bar.className = 'bet-ui-desktop__bar';

  const menuBtn = createIconButton('menu', 'Menu', '☰');

  const stats = document.createElement('div');
  stats.className = 'bet-ui-desktop__stats';

  const balanceStat = createStatBlock('balance', 'Balance');
  const winStat = createStatBlock('win', 'Win');
  winStat.root.classList.add('bet-ui-desktop__stat--center');
  winStat.valueEl.classList.add('bet-ui-desktop__stat-value--win');
  winStat.valueEl.textContent = '';
  const betPickBtn = createBetPickButton();

  stats.append(balanceStat.root);

  const controls = document.createElement('div');
  controls.className = 'bet-ui-desktop__controls';

  const playCluster = document.createElement('div');
  playCluster.className = 'bet-ui-desktop__play-cluster';

  const stepper = document.createElement('div');
  stepper.className = 'bet-ui-desktop__stepper';
  const betUpBtn = createStepButton('up', 'Increase bet', '+');
  const betDownBtn = createStepButton('down', 'Decrease bet', '−');
  stepper.append(betUpBtn, betDownBtn);

  const spinSlot = document.createElement('div');
  spinSlot.className = 'bet-ui-desktop__spin';

  playCluster.append(betPickBtn.root, stepper, spinSlot);

  const autoCluster = document.createElement('div');
  autoCluster.className = 'bet-ui-desktop__auto-cluster';
  const autoBtn = createIconButton('auto', 'Autoplay', '⟳');
  const autoProgress = document.createElement('span');
  autoProgress.className = 'bet-ui-desktop__auto-progress';
  autoProgress.hidden = true;
  autoCluster.append(autoBtn, autoProgress);

  controls.append(playCluster, autoCluster);
  bar.append(menuBtn, stats, winStat.root, controls);
  chrome.append(bar);
  stakeShell.appendChild(chrome);

  const statValueEls = [balanceStat.valueEl, winStat.valueEl, betPickBtn.valueEl];
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => fitAllStatValues())
    : null;

  for (const stat of [balanceStat, winStat, betPickBtn]) {
    resizeObserver?.observe(stat.root);
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
    playButton.classList.remove('bet-ui-desktop__play');
  }

  function setActive(desktop) {
    active = desktop;
    chrome.hidden = !desktop;
    root.classList.toggle('bet-ui-desktop-active', desktop);

    if (desktop) {
      spinSlot.appendChild(playButton);
      playButton.classList.add('bet-ui-desktop__play');
      playButton.setAttribute('aria-label', 'Spin');
      requestAnimationFrame(() => fitAllStatValues());
    } else {
      restorePlayButton();
    }
  }

  function fitStatValue(valueEl) {
    valueEl.style.fontSize = '';
    const max = parseFloat(getComputedStyle(valueEl).fontSize) || 15;
    const min = Math.max(8, max * 0.45);
    let size = max;
    valueEl.style.fontSize = `${size}px`;

    while (size > min && valueEl.scrollWidth > valueEl.clientWidth + 1) {
      size -= 0.5;
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
    const progress = handlers.getAutoplayProgress?.() ?? { current: 0, total: 0 };
    const iconEl = autoBtn.querySelector('.bet-ui-desktop__icon');

    autoBtn.classList.toggle('bet-ui-desktop__icon-btn--stop', autoplayActive);
    if (iconEl) {
      iconEl.textContent = autoplayActive ? '■' : '⟳';
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
      resizeObserver?.disconnect();
      restorePlayButton();
      chrome.remove();
      root.classList.remove('bet-ui-desktop-active');
    },
  };
}

/**
 * @param {string} part
 * @param {string} label
 * @param {string} icon
 */
function createIconButton(part, label, icon) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `bet-ui-desktop__icon-btn bet-ui-desktop__icon-btn--${part}`;
  button.dataset.betUiPart = part;
  button.setAttribute('aria-label', label);
  button.innerHTML = `<span class="bet-ui-desktop__icon" aria-hidden="true">${icon}</span>`;
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
