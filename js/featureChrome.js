/**
 * Free-spins feature chrome — counter overlay + intro/end banners.
 */

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
    <span class="feature-chrome__counter-label">Free spin</span>
    <span class="feature-chrome__counter-value">
      <span class="feature-chrome__spin-current">0</span>
      <span class="feature-chrome__spin-sep">/</span>
      <span class="feature-chrome__spin-total">8</span>
    </span>
  `;

  const endBanner = document.createElement('div');
  endBanner.className = 'feature-chrome__end';
  endBanner.hidden = true;

  root.append(intro, counter, endBanner);
  stageEl.appendChild(root);

  const spinCurrentEl = counter.querySelector('.feature-chrome__spin-current');
  const spinTotalEl = counter.querySelector('.feature-chrome__spin-total');
  const continueBtn = intro.querySelector('.feature-chrome__continue');

  let introTimer = null;
  let endTimer = null;
  /** @type {{ cleanup: () => void } | null} */
  let pendingContinue = null;
  let active = false;

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
      event.source === 'buy'
        ? 'Bonus buy'
        : event.scatters != null
          ? `${event.scatters} scatters on the board`
          : 'Scatter trigger';

    if (!animate) return;

    await waitForUserContinue();
    intro.hidden = true;
  }

  /**
   * @param {object} event
   * @param {{ animate?: boolean }} [opts]
   */
  async function onUpdateFreeSpin(event, { animate = true } = {}) {
    if (!active) {
      active = true;
      showShell(animate);
      counter.hidden = false;
      intro.hidden = true;
      endBanner.hidden = true;
    }
    spinTotalEl.textContent = String(event.total ?? 8);
    spinCurrentEl.textContent = String(event.current ?? 0);
    if (!animate) return;
    counter.classList.remove('feature-chrome__counter--pulse');
    void counter.offsetWidth;
    counter.classList.add('feature-chrome__counter--pulse');
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
    onFreeSpinEnd,
    isActive: () => active,
  };
}
