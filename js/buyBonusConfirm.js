/** Buy Bonus confirm modal — Reflecting Pool layout (overrides engine registration). */

export const BUY_BONUS_CONFIRM_MODAL_ID = 'suki-buy-bonus-confirm';

const BUY_BONUS_BACKDROP_SRC = 'assets/ui/warning-tape.png';
const BUY_BONUS_BADGE_SRC = 'assets/ui/b_bonus_badge.png';
const GET_BONUS_BADGE_SRC = 'assets/ui/g_bonus_badge.png';

function removeModalBackdrop(shell) {
  shell?.querySelector('.suki-buy-bonus-backdrop')?.remove();
}

function mountModalBackdrop(shell) {
  if (!shell) return;
  const overlay = shell.querySelector('.suki-modal-overlay');
  if (!overlay) return;

  removeModalBackdrop(shell);

  const backdrop = document.createElement('div');
  backdrop.className = 'suki-buy-bonus-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');

  const img = document.createElement('img');
  img.className = 'suki-buy-bonus-backdrop__img';
  img.src = BUY_BONUS_BACKDROP_SRC;
  img.alt = '';
  img.decoding = 'async';
  backdrop.appendChild(img);

  const stage = overlay.querySelector('.suki-modal-stage');
  if (stage) {
    overlay.insertBefore(backdrop, stage);
  } else {
    overlay.appendChild(backdrop);
  }
}

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/client/suki/modalHost.js').createModalHost>} modalHost
 * @param {object} options
 * @param {(key: string, vars?: Record<string, string | number>) => string} options.t
 * @param {() => number} options.getBuyCost
 * @param {() => number} options.getCostMultiplier
 * @param {(amount: number) => string} [options.formatCurrency]
 * @param {() => boolean} [options.getCanConfirm]
 * @param {() => string} [options.getFeatureDetail]
 * @param {() => number} [options.getFreeSpinsAwarded]
 * @param {() => boolean} [options.getSocialCasino]
 * @param {() => void} options.onConfirm
 * @param {() => void} [options.onDismiss]
 * @param {HTMLElement | null} [options.shell]
 */
export function registerBuyBonusConfirm(modalHost, options) {
  const {
    t,
    getBuyCost,
    getCostMultiplier,
    formatCurrency = (amount) => String(amount),
    getCanConfirm = () => true,
    getFeatureDetail = null,
    getFreeSpinsAwarded = () => 8,
    getSocialCasino = () => false,
    onConfirm,
    onDismiss = () => {},
    shell = null,
  } = options;

  /** @type {(() => void) | null} */
  let syncUi = null;

  function clearSyncUi() {
    syncUi = null;
  }

  function teardownModalChrome() {
    shell?.classList.remove('suki-buy-bonus-modal-open');
    removeModalBackdrop(shell);
    clearSyncUi();
  }

  function dismissIfBuyWasOpen(wasBuyOpen) {
    if (!wasBuyOpen) return;
    teardownModalChrome();
    onDismiss();
  }

  function wasBuyModalOpen() {
    return shell?.classList.contains('suki-buy-bonus-modal-open')
      || modalHost.getOpenId?.() === BUY_BONUS_CONFIRM_MODAL_ID;
  }

  function badgeSrc() {
    return getSocialCasino() ? GET_BONUS_BADGE_SRC : BUY_BONUS_BADGE_SRC;
  }

  function headlineText() {
    return `${getFreeSpinsAwarded()} FREE SPINS`;
  }

  function costLabelText() {
    return `Cost: ${getCostMultiplier()}x Bet`;
  }

  function footnoteText() {
    return getFeatureDetail?.() ?? t('buyConfirmFootnote');
  }

  function renderBody(body) {
    shell?.classList.add('suki-buy-bonus-modal-open');
    mountModalBackdrop(shell);

    body.innerHTML = '';
    body.classList.add('suki-buy-bonus-confirm-body');

    const stack = document.createElement('div');
    stack.className = 'suki-buy-bonus-stack';

    const card = document.createElement('div');
    card.className = 'suki-buy-bonus-card';

    const badge = document.createElement('img');
    badge.className = 'suki-buy-bonus-badge';
    badge.src = badgeSrc();
    badge.alt = '';
    badge.decoding = 'async';

    const headline = document.createElement('p');
    headline.className = 'suki-buy-bonus-headline';
    headline.textContent = headlineText();

    const costLabel = document.createElement('p');
    costLabel.className = 'suki-buy-bonus-cost-label';
    costLabel.textContent = costLabelText();

    const purchase = document.createElement('div');
    purchase.className = 'suki-buy-bonus-purchase';

    const price = document.createElement('p');
    price.className = 'suki-buy-bonus-price';
    price.textContent = formatCurrency(getBuyCost());

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'suki-buy-confirm';
    confirmBtn.textContent = t('buyPlayButton');
    confirmBtn.addEventListener('click', () => {
      if (!getCanConfirm()) return;
      modalHost.close();
      onConfirm();
    });

    const footnote = document.createElement('p');
    footnote.className = 'suki-buy-bonus-footnote';
    footnote.textContent = footnoteText();

    purchase.append(price, confirmBtn);
    card.append(headline, costLabel, purchase, footnote);
    stack.append(badge, card);
    body.append(stack);

    syncUi = () => {
      price.textContent = formatCurrency(getBuyCost());
      confirmBtn.disabled = !getCanConfirm();
    };
    syncUi();
  }

  modalHost.register(BUY_BONUS_CONFIRM_MODAL_ID, {
    title: '',
    render: renderBody,
  });

  if (!modalHost.__reflectingPoolBuyBonusChrome) {
    modalHost.__reflectingPoolBuyBonusChrome = true;
    const baseOpen = modalHost.open.bind(modalHost);

    modalHost.open = (id) => {
      if (String(id) !== BUY_BONUS_CONFIRM_MODAL_ID) {
        dismissIfBuyWasOpen(wasBuyModalOpen());
      }
      baseOpen(id);
    };
  }

  return {
    open() {
      modalHost.open(BUY_BONUS_CONFIRM_MODAL_ID);
    },
    close() {
      modalHost.close();
    },
    sync() {
      syncUi?.();
    },
    isOpen() {
      return wasBuyModalOpen();
    },
    clearSyncUi,
  };
}
