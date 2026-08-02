/**
 * Free-spins feature chrome — full-screen intro, counter overlay, end banner.
 */

import { SCATTER_TRIGGER_COUNT } from './config.js';
import { mountFeatureIntroSpine, mountFeatureEndSpine } from './pixi/featureIntroSpine.js';
import { TIMING } from './pixi/timing.js';

/**
 * @param {number} count
 */
function scatterIntroLine(count) {
  const n = count ?? SCATTER_TRIGGER_COUNT;
  return `${n} SCATTER${n === 1 ? '' : 'S'} ON THE BOARD`;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.shellEl — `.suki-stake-shell` (full-screen scrim)
 * @param {HTMLElement} opts.stageEl — `#slot-stage` (cabinet-centred intro stack)
 * @param {() => void} [opts.onIntroSpineStart] — fired when intro Spine animation begins
 * @param {() => void} [opts.onBonusRoundStart] — fired when intro ends and free spins begin
 */
export function createFeatureChrome({ shellEl, stageEl, onIntroSpineStart, onBonusRoundStart }) {
  const scrim = document.createElement('div');
  scrim.className = 'feature-chrome__scrim';
  scrim.hidden = true;
  scrim.setAttribute('aria-hidden', 'true');

  const intro = document.createElement('div');
  intro.className = 'feature-chrome__intro';
  intro.hidden = true;
  intro.innerHTML = `
    <div class="feature-chrome__intro-stack">
      <p class="feature-chrome__scatter-label"></p>
      <div class="feature-chrome__spine-host" aria-hidden="true"></div>
      <p class="feature-chrome__tap-label">TAP ANYWHERE TO CONTINUE</p>
    </div>
  `;

  const counter = document.createElement('div');
  counter.className = 'feature-chrome__counter';
  counter.hidden = true;
  counter.setAttribute('aria-live', 'polite');
  counter.innerHTML = `
    <span class="feature-chrome__counter-value" aria-label="Free spin 1 of 8">
      <span class="feature-chrome__spin-label">FREE SPIN&nbsp;&nbsp;</span><span class="feature-chrome__spin-current">1</span><span class="feature-chrome__spin-sep"> / </span><span class="feature-chrome__spin-total">8</span>
    </span>
  `;

  const endOverlay = document.createElement('div');
  endOverlay.className = 'feature-chrome__end';
  endOverlay.hidden = true;
  endOverlay.innerHTML = `
    <div class="feature-chrome__end-stack">
      <div class="feature-chrome__spine-host feature-chrome__spine-host--end">
        <div class="feature-chrome__end-text" aria-hidden="true">
          <span class="feature-chrome__end-label"></span>
          <span class="feature-chrome__end-amount"></span>
        </div>
      </div>
      <p class="feature-chrome__tap-label">TAP ANYWHERE TO CONTINUE</p>
    </div>
  `;

  shellEl.appendChild(scrim);
  shellEl.appendChild(intro);
  shellEl.appendChild(counter);
  shellEl.appendChild(endOverlay);

  const scatterLabelEl = intro.querySelector('.feature-chrome__scatter-label');
  const spineHostEl = intro.querySelector('.feature-chrome__spine-host');
  const endSpineHostEl = endOverlay.querySelector('.feature-chrome__spine-host--end');
  const endTextEl = endOverlay.querySelector('.feature-chrome__end-text');
  const endLabelEl = endOverlay.querySelector('.feature-chrome__end-label');
  const endAmountEl = endOverlay.querySelector('.feature-chrome__end-amount');
  const spinCurrentEl = counter.querySelector('.feature-chrome__spin-current');
  const spinTotalEl = counter.querySelector('.feature-chrome__spin-total');
  const counterValueEl = counter.querySelector('.feature-chrome__counter-value');

  let counterTimer = null;
  /** @type {{ cleanup: () => void } | null} */
  let pendingContinue = null;
  /** @type {{ destroy: () => void, relayout?: () => void } | null} */
  let introSpineMount = null;
  /** @type {Promise<{ destroy: () => void } | null> | null} */
  let introSpineLoad = null;
  /** @type {{ destroy: () => void, syncText?: () => void } | null} */
  let endSpineMount = null;
  /** @type {Promise<{ destroy: () => void, syncText?: () => void } | null> | null} */
  let endSpineLoad = null;
  let active = false;
  let spinTotal = 8;

  /** @type {(() => void) | null} */
  let onIntroResize = null;
  /** @type {(() => void) | null} */
  let onCounterResize = null;

  /** @type {(() => void) | null} */
  let onEndResize = null;

  function gameCoreEl() {
    return shellEl.querySelector('.suki-game-core');
  }

  function overlayAnchorRect() {
    const shellRect = shellEl.getBoundingClientRect();
    const boardEl = stageEl.querySelector('#slot-board');
    const anchorEl =
      shellEl.dataset.betUiVariant === 'mobile' && boardEl ? boardEl : stageEl;
    const anchorRect = anchorEl.getBoundingClientRect();
    return { shellRect, anchorRect };
  }

  function syncIntroPosition() {
    const { shellRect, anchorRect } = overlayAnchorRect();
    intro.style.top = `${anchorRect.top - shellRect.top}px`;
    intro.style.left = `${anchorRect.left - shellRect.left}px`;
    intro.style.width = `${anchorRect.width}px`;
    intro.style.height = `${anchorRect.height}px`;
    introSpineMount?.relayout?.();
  }

  function syncCounterPosition() {
    const shellRect = shellEl.getBoundingClientRect();
    const stageRect = stageEl.getBoundingClientRect();
    const gameCore = gameCoreEl();
    const variant = shellEl.dataset.betUiVariant;
    const orientation = shellEl.dataset.sukiOrientation;
    const screen = shellEl.dataset.sukiScreen;
    const useLedgerColumn =
      variant === 'desktop' && orientation === 'landscape' && screen !== 'popout-s';

    if (useLedgerColumn && gameCore) {
      const coreRect = gameCore.getBoundingClientRect();
      const coreStyle = getComputedStyle(gameCore);
      const ladderTop = parseFloat(coreStyle.getPropertyValue('--cascade-ladder-top')) || 0;
      const panelLeft = parseFloat(coreStyle.getPropertyValue('--ledger-panel-left'));
      const panelWidth = parseFloat(coreStyle.getPropertyValue('--ledger-panel-width'));

      counter.style.top = `${coreRect.top - shellRect.top + ladderTop}px`;
      counter.style.left = Number.isFinite(panelLeft)
        ? `${coreRect.left - shellRect.left + panelLeft}px`
        : '';
      counter.style.right = 'auto';
      counter.style.width = Number.isFinite(panelWidth) && panelWidth > 0 ? `${panelWidth}px` : '';
      counter.style.minWidth = '0';
      counter.style.transform = 'none';
      return;
    }

    if (screen === 'popout-s' && orientation === 'landscape' && gameCore) {
      const coreRect = gameCore.getBoundingClientRect();
      const ladderTop =
        parseFloat(getComputedStyle(gameCore).getPropertyValue('--cascade-ladder-top')) || 0;
      counter.style.top = `${coreRect.top - shellRect.top + ladderTop}px`;
      counter.style.left = 'auto';
      counter.style.right = `${Math.max(0, shellRect.right - coreRect.right) + 1}px`;
      counter.style.width = 'auto';
      counter.style.minWidth = '4.5rem';
      counter.style.transform = 'none';
      return;
    }

    const insetTop = screen === 'popout-s' ? 6 : 10;
    counter.style.top = `${stageRect.top - shellRect.top + insetTop}px`;
    counter.style.left = `${stageRect.left - shellRect.left + stageRect.width / 2}px`;
    counter.style.right = 'auto';
    counter.style.width = 'auto';
    counter.style.minWidth = '4.5rem';
    counter.style.transform = 'translateX(-50%)';
  }

  function syncEndOverlayPosition() {
    const { shellRect, anchorRect } = overlayAnchorRect();
    endOverlay.style.top = `${anchorRect.top - shellRect.top}px`;
    endOverlay.style.left = `${anchorRect.left - shellRect.left}px`;
    endOverlay.style.width = `${anchorRect.width}px`;
    endOverlay.style.height = `${anchorRect.height}px`;
    endSpineMount?.relayout?.();
    endSpineMount?.syncText?.();
  }

  function bindEndLayoutSync() {
    if (onEndResize) return;
    onEndResize = () => syncEndOverlayPosition();
    window.addEventListener('resize', onEndResize);
    window.visualViewport?.addEventListener('resize', onEndResize);
  }

  function unbindEndLayoutSync() {
    if (!onEndResize) return;
    window.removeEventListener('resize', onEndResize);
    window.visualViewport?.removeEventListener('resize', onEndResize);
    onEndResize = null;
  }

  function bindIntroLayoutSync() {
    if (onIntroResize) return;
    onIntroResize = () => syncIntroPosition();
    window.addEventListener('resize', onIntroResize);
    window.visualViewport?.addEventListener('resize', onIntroResize);
  }

  function unbindIntroLayoutSync() {
    if (!onIntroResize) return;
    window.removeEventListener('resize', onIntroResize);
    window.visualViewport?.removeEventListener('resize', onIntroResize);
    onIntroResize = null;
  }

  function bindCounterLayoutSync() {
    if (onCounterResize) return;
    onCounterResize = () => {
      if (!counter.hidden) syncCounterPosition();
      if (!endOverlay.hidden) syncEndOverlayPosition();
    };
    window.addEventListener('resize', onCounterResize);
    window.visualViewport?.addEventListener('resize', onCounterResize);
  }

  function unbindCounterLayoutSync() {
    if (!onCounterResize) return;
    window.removeEventListener('resize', onCounterResize);
    window.visualViewport?.removeEventListener('resize', onCounterResize);
    onCounterResize = null;
  }

  function clearTimers() {
    if (counterTimer) {
      clearTimeout(counterTimer);
      counterTimer = null;
    }
  }

  function destroyEndSpine() {
    endSpineMount?.destroy();
    endSpineMount = null;
    endSpineLoad = null;
  }

  function destroyIntroSpine() {
    introSpineMount?.destroy();
    introSpineMount = null;
    introSpineLoad = null;
  }

  function hideIntroLayers() {
    scrim.classList.remove('feature-chrome__scrim--active');
    intro.classList.remove('feature-chrome__intro--active');
    shellEl.classList.remove('feature-chrome-shell--intro');
    scrim.hidden = true;
    intro.hidden = true;
    unbindIntroLayoutSync();
  }

  function showCounterPhase() {
    hideIntroLayers();
    destroyIntroSpine();
    shellEl.classList.add('feature-chrome-shell--counter');
    counter.hidden = false;
    endOverlay.hidden = true;
    syncCounterPosition();
    bindCounterLayoutSync();
    requestAnimationFrame(() => {
      if (!counter.hidden) syncCounterPosition();
    });
    onBonusRoundStart?.();
  }

  function cancelPendingContinue() {
    if (!pendingContinue) return;
    pendingContinue.cleanup();
    pendingContinue = null;
    hideIntroLayers();
  }

  function reset() {
    clearTimers();
    cancelPendingContinue();
    destroyIntroSpine();
    destroyEndSpine();
    hideIntroLayers();
    hideEndOverlay();
    unbindCounterLayoutSync();
    active = false;
    scrim.hidden = true;
    intro.hidden = true;
    counter.hidden = true;
    endOverlay.hidden = true;
    if (endLabelEl) endLabelEl.textContent = '';
    if (endAmountEl) endAmountEl.textContent = '';
    shellEl.classList.remove('feature-chrome-shell--intro', 'feature-chrome-shell--counter', 'feature-chrome-shell--end');
  }

  function setSpinProgress(current, total = spinTotal, { pulse = false } = {}) {
    const spin = Math.max(1, Math.min(current, total));
    spinCurrentEl.textContent = String(spin);
    spinTotalEl.textContent = String(total);
    counterValueEl.setAttribute('aria-label', `Free spin ${spin} of ${total}`);
    if (!pulse) return;
    counter.classList.remove('feature-chrome__counter--pulse');
    void counter.offsetWidth;
    counter.classList.add('feature-chrome__counter--pulse');
  }

  async function ensureIntroSpine() {
    if (introSpineMount) return introSpineMount;
    if (!introSpineLoad) {
      introSpineLoad = mountFeatureIntroSpine(spineHostEl, {
        onAnimationStart: () => onIntroSpineStart?.(),
      }).catch((err) => {
        console.warn('[Basic Slot] Feature intro Spine unavailable.', err);
        return null;
      });
    }
    introSpineMount = await introSpineLoad;
    return introSpineMount;
  }

  function showIntroOverlay() {
    syncIntroPosition();
    bindIntroLayoutSync();
    scrim.classList.add('feature-chrome__scrim--active');
    intro.classList.add('feature-chrome__intro--active');
    shellEl.classList.add('feature-chrome-shell--intro');
  }

  function waitForUserContinue(targets) {
    const layers = targets.filter(Boolean);
    return new Promise((resolve) => {
      let settled = false;

      const onContinue = (event) => {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event.type === 'keydown') event.preventDefault();
        finish();
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        pendingContinue = null;
        resolve();
      };

      const cleanup = () => {
        for (const layer of layers) {
          layer.removeEventListener('click', onContinue);
        }
        document.removeEventListener('keydown', onContinue);
      };

      pendingContinue = { cleanup };
      for (const layer of layers) {
        layer.addEventListener('click', onContinue);
      }
      document.addEventListener('keydown', onContinue);
    });
  }

  function showEndOverlay() {
    syncEndOverlayPosition();
    bindEndLayoutSync();
    scrim.hidden = false;
    scrim.classList.add('feature-chrome__scrim--active');
    endOverlay.hidden = false;
    endOverlay.classList.add('feature-chrome__end--active');
    shellEl.classList.add('feature-chrome-shell--end');
  }

  function hideEndOverlay() {
    endOverlay.classList.remove('feature-chrome__end--active');
    shellEl.classList.remove('feature-chrome-shell--end');
    endOverlay.hidden = true;
    unbindEndLayoutSync();
    scrim.classList.remove('feature-chrome__scrim--active');
    scrim.hidden = true;
  }

  async function ensureEndSpine(label, amount) {
    destroyEndSpine();
    if (endLabelEl) endLabelEl.textContent = label;
    if (endAmountEl) endAmountEl.textContent = amount;
    endSpineLoad = mountFeatureEndSpine(endSpineHostEl, endTextEl, { label, amount }).catch((err) => {
      console.warn('[Basic Slot] Feature end Spine unavailable.', err);
      return null;
    });
    endSpineMount = await endSpineLoad;
    endSpineLoad = null;
    return endSpineMount;
  }

  function waitForIntroContinue() {
    return waitForUserContinue([scrim, intro]).then(() => hideIntroLayers());
  }

  /**
   * @param {object} event
   * @param {{ animate?: boolean }} [opts]
   */
  async function onEnterBonus(event, { animate = true } = {}) {
    clearTimers();
    cancelPendingContinue();
    active = true;
    scrim.hidden = false;
    intro.hidden = false;
    counter.hidden = true;
    endOverlay.hidden = true;

    const total = event.total ?? 8;
    spinTotal = total;
    spinTotalEl.textContent = String(total);

    const scatterCount =
      event.scatters != null && event.scatters > 0 ? event.scatters : SCATTER_TRIGGER_COUNT;
    scatterLabelEl.textContent = scatterIntroLine(scatterCount);

    if (!animate) {
      showCounterPhase();
      setSpinProgress(1, total);
      return;
    }

    showIntroOverlay();
    const mount = await ensureIntroSpine();
    if (!mount) onIntroSpineStart?.();
    await waitForIntroContinue();
    showCounterPhase();
    setSpinProgress(1, total);
  }

  /**
   * @param {object} event
   * @param {{ animate?: boolean }} [opts]
   */
  async function onUpdateFreeSpin(event, { animate = true } = {}) {
    spinTotal = event.total ?? spinTotal;
    if (!active) {
      active = true;
      showCounterPhase();
    }
    if (!animate) {
      setSpinProgress(event.current ?? 1, spinTotal);
    }
  }

  /**
   * @param {object} opts
   * @param {number} opts.current
   * @param {boolean} [opts.animate]
   */
  function onFreeSpinStart({ current, animate = true }) {
    if (!active) return;
    if (counterTimer) {
      clearTimeout(counterTimer);
      counterTimer = null;
    }
    const apply = () => {
      counterTimer = null;
      if (counter.hidden) {
        showCounterPhase();
      } else {
        syncCounterPosition();
      }
      setSpinProgress(current, spinTotal, { pulse: animate });
    };
    if (!animate) {
      apply();
      return;
    }
    counterTimer = setTimeout(apply, TIMING.freeSpinCounterDelayMs);
  }

  /**
   * @param {object} event
   * @param {{ animate?: boolean, socialCasino?: boolean, formatBookWin?: (amountCentiMult: number) => string }} [opts]
   */
  async function onFreeSpinEnd(event, { animate = true, socialCasino = false, formatBookWin = null } = {}) {
    counter.hidden = true;
    unbindCounterLayoutSync();
    shellEl.classList.remove('feature-chrome-shell--counter');

    const amountDisplay =
      event.amount != null && formatBookWin ? formatBookWin(event.amount) : '';
    const featureResultLabel = socialCasino ? 'Feature Earn' : 'Feature Win';

    if (!animate) {
      reset();
      return;
    }

    showEndOverlay();
    const mount = await ensureEndSpine(featureResultLabel, amountDisplay || '—');
    if (!mount && endTextEl) {
      endTextEl.style.left = '50%';
      endTextEl.style.top = '50%';
      endTextEl.style.transform = 'translate(-50%, -50%)';
      endTextEl.style.opacity = '1';
    }
    endTextEl?.setAttribute(
      'aria-label',
      amountDisplay ? `${featureResultLabel} ${amountDisplay}` : featureResultLabel,
    );

    await waitForUserContinue([scrim, endOverlay]);
    reset();
  }

  return {
    reset,
    onEnterBonus,
    onUpdateFreeSpin,
    onFreeSpinStart,
    onFreeSpinEnd,
    isActive: () => active,
    inFreeSpins: () => active && intro.hidden,
  };
}
