/** Autoplay confirm modal — Reflecting Pool layout (overrides engine registration). */

export const AUTOPLAY_CONFIRM_MODAL_ID = 'suki-autoplay-confirm';
export const AUTOPLAY_ROUND_OPTIONS = [5, 10, 25, 50, 100, 250, 500, 999];

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/client/suki/modalHost.js').createModalHost>} modalHost
 * @param {object} options
 * @param {() => number} options.getPlayCost
 * @param {() => number} [options.getBalance]
 * @param {(rounds: number) => void} options.onConfirm
 * @param {HTMLElement | null} [options.shell]
 * @param {number} [options.defaultRounds]
 */
export function registerAutoplayConfirm(modalHost, options) {
  const {
    getPlayCost,
    getBalance = () => 0,
    onConfirm,
    shell = null,
    defaultRounds = 100,
  } = options;

  let selectedRounds = defaultRounds;

  function canAfford() {
    return getBalance() >= getPlayCost();
  }

  function renderBody(body) {
    shell?.classList.add('suki-autoplay-modal-open');

    body.innerHTML = '';
    body.classList.add('suki-autoplay-confirm-body');

    const roundsBlock = document.createElement('div');
    roundsBlock.className = 'suki-autoplay-rounds';

    const roundsLabel = document.createElement('span');
    roundsLabel.className = 'suki-autoplay-rounds-label';
    roundsLabel.textContent = 'ROUNDS';

    const roundsRow = document.createElement('div');
    roundsRow.className = 'suki-autoplay-rounds-options';
    roundsRow.setAttribute('role', 'group');
    roundsRow.setAttribute('aria-label', 'ROUNDS');

    const actions = document.createElement('div');
    actions.className = 'suki-autoplay-actions';

    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'suki-autoplay-start';
    startBtn.textContent = 'START AUTOPLAY';

    function syncPresetButtons() {
      for (const chip of roundsRow.querySelectorAll('.suki-autoplay-round-btn')) {
        const chipRounds = Number(chip.dataset.rounds);
        chip.classList.toggle('active', chipRounds === selectedRounds);
      }
    }

    function syncStartButton() {
      startBtn.disabled = !canAfford();
    }

    function selectPresetRounds(rounds) {
      selectedRounds = rounds;
      syncPresetButtons();
      syncStartButton();
    }

    for (const rounds of AUTOPLAY_ROUND_OPTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suki-autoplay-round-btn';
      btn.dataset.rounds = String(rounds);
      btn.textContent = String(rounds);
      btn.addEventListener('click', () => selectPresetRounds(rounds));
      roundsRow.appendChild(btn);
    }

    startBtn.addEventListener('click', () => {
      if (!canAfford()) return;
      modalHost.close();
      onConfirm(selectedRounds);
    });

    roundsBlock.append(roundsLabel, roundsRow);
    actions.append(startBtn);
    body.append(roundsBlock, actions);

    selectPresetRounds(
      AUTOPLAY_ROUND_OPTIONS.includes(defaultRounds) ? defaultRounds : 100,
    );
  }

  modalHost.register(AUTOPLAY_CONFIRM_MODAL_ID, {
    title: 'AUTOPLAY',
    render: renderBody,
  });

  return {
    open() {
      selectedRounds = AUTOPLAY_ROUND_OPTIONS.includes(defaultRounds) ? defaultRounds : 100;
      modalHost.open(AUTOPLAY_CONFIRM_MODAL_ID);
    },
    close() {
      modalHost.close();
    },
  };
}
