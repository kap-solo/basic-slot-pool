/**
 * Free-spins feature chrome — counter overlay + intro/end banners.
 */

import { TIMING } from './pixi/timing.js';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.stageEl — slot stage root
 */
export function createFeatureChrome({ stageEl }) {
  const root = document.createElement('div');
  root.className = 'feature-chrome';
  root.hidden = true;
  root.setAttribute('aria-live', 'polite');

  const intro = document.createElement('div');
  intro.className = 'feature-chrome__intro';
  intro.hidden = true;
  intro.innerHTML = `
    <p class="feature-chrome__eyebrow">Free spins</p>
    <p class="feature-chrome__title">8 free spins</p>
    <p class="feature-chrome__sub">3 scatters on the board</p>
    <button type="button" class="feature-chrome__continue">Start free spins</button>
    <p class="feature-chrome__continue-hint">Tap anywhere to continue</p>
  `;

  const counter = document.createElement('div');
  counter.className = 'feature-chrome__counter';
  counter.hidden = true;
  counter.innerHTML = `
    <span class="feature-chrome__counter-label">Free spins remaining</span>
    <span class="feature-chrome__counter-value">
      <span class="feature-chrome__spin-remaining">8</span>
    </span>
  `;

  const endBanner = document.createElement('div');
  endBanner.className = 'feature-chrome__end';
  endBanner.hidden = true;

  root.append(intro, counter, endBanner);
  stageEl.appendChild(root);

  const spinRemainingEl = counter.querySelector('.feature-chrome__spin-remaining');
  const continueBtn = intro.querySelector('.feature-chrome__continue');

  let introTimer = null;
  let endTimer = null;
  let counterTimer = null;
  /** @type {{ cleanup: () => void } | null} */
  let pendingContinue = null;
  let active = false;
  let spinTotal = 8;

  function clearTimers() {
    if (introTimer) {
      clearTimeout(introTimer);
      introTimer = null;
    }
    if (endTimer) {
      clearTimeout(endTimer);
      endTimer = null;
    }
  }

  function cancelPendingContinue() {
    if (!pendingContinue) return;
    pendingContinue.cleanup();
    pendingContinue = null;
    root.classList.remove('feature-chrome--awaiting-continue');
  }

  function reset() {
    clearTimers();
    cancelPendingContinue();
    active = false;
    root.hidden = true;
    intro.hidden = true;
    counter.hidden = true;
    endBanner.hidden = true;
    endBanner.textContent = '';
  }

  /**
   * @param {boolean} animate
   */
  function showShell(animate) {
    root.hidden = false;
    if (!animate) return;
  }

  function setRemaining(remaining, { pulse = false } = {}) {
    spinRemainingEl.textContent = String(Math.max(0, remaining));
    if (!pulse) return;
    counter.classList.remove('feature-chrome__counter--pulse');
    void counter.offsetWidth;
    counter.classList.add('feature-chrome__counter--pulse');
  }

  /** Remaining spins not yet used — includes the spin currently in progress. */
  function remainingForSpin(current) {
    return spinTotal - current + 1;
  }

  function waitForUserContinue() {
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
        root.classList.remove('feature-chrome--awaiting-continue');
        resolve();
      };

      const cleanup = () => {
        root.removeEventListener('click', onContinue);
        continueBtn?.removeEventListener('click', onContinue);
        document.removeEventListener('keydown', onContinue);
      };

      pendingContinue = { cleanup };
      root.classList.add('feature-chrome--awaiting-continue');
      root.addEventListener('click', onContinue);
      continueBtn?.addEventListener('click', onContinue);
      document.addEventListener('keydown', onContinue);
      continueBtn?.focus({ preventScroll: true });
    });
  }

  /**
   * @param {object} event
   * @param {{ animate?: boolean }} [opts]
   */
  async function onEnterBonus(event, { animate = true } = {}) {
    clearTimers();
    cancelPendingContinue();
    active = true;
    showShell(animate);
    intro.hidden = false;
    counter.hidden = true;
    endBanner.hidden = true;

    const total = event.total ?? 8;
    intro.querySelector('.feature-chrome__title').textContent = `${total} free spins`;
    intro.querySelector('.feature-chrome__sub').textContent =
      event.scatters != null && event.scatters > 0
        ? `${event.scatters} scatters on the board`
        : event.source === 'bb' || event.source === 'buy'
          ? 'Feature activated'
          : 'Scatter trigger';

    if (!animate) {
      counter.hidden = false;
      setRemaining(total);
      return;
    }

    await waitForUserContinue();
    intro.hidden = true;
    counter.hidden = false;
    setRemaining(total);
  }

  /**
   * @param {object} event
   * @param {{ animate?: boolean }} [opts]
   */
  async function onUpdateFreeSpin(event, { animate = true } = {}) {
    spinTotal = event.total ?? spinTotal;
    if (!active) {
      active = true;
      showShell(animate);
      counter.hidden = false;
      intro.hidden = true;
      endBanner.hidden = true;
    }
    if (!animate) {
      setRemaining(remainingForSpin(event.current ?? 1));
    }
  }

  /**
   * Drop remaining count when the free-spin reel animation begins (not on updateFreeSpin).
   * Count includes the active spin — first spin still shows the full award (e.g. 8).
   *
   * @param {object} opts
   * @param {number} opts.current — freeSpin index from gameReveal
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
      setRemaining(remainingForSpin(current), { pulse: animate });
    };
    if (!animate) {
      apply();
      return;
    }
    counterTimer = setTimeout(apply, TIMING.freeSpinCounterDelayMs);
  }

  /**
   * @param {object} event
   * @param {{ animate?: boolean, formatBookWin?: (amountCentiMult: number) => string }} [opts]
   */
  async function onFreeSpinEnd(event, { animate = true, formatBookWin = null } = {}) {
    counter.hidden = true;
    endBanner.hidden = false;
    const amountDisplay =
      event.amount != null && formatBookWin ? formatBookWin(event.amount) : '';
    endBanner.textContent = amountDisplay
      ? `Feature win ${amountDisplay}`
      : 'Free spins complete';

    if (!animate) return;

    await new Promise((resolve) => {
      endTimer = setTimeout(resolve, 1200);
    });
    reset();
  }

  return {
    root,
    reset,
    onEnterBonus,
    onUpdateFreeSpin,
    onFreeSpinStart,
    onFreeSpinEnd,
    isActive: () => active,
  };
}
