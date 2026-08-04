/**
 * Bet level picker — scrollable 3-column grid inside the Suki modal host.
 */

/**
 * @param {object} options
 * @param {ReturnType<import('@kap-solo/suki-engine/client/suki/modalHost.js').createModalHost>} options.modalHost
 * @param {HTMLElement | null} [options.shell]
 * @param {() => string} options.getTitle
 * @param {() => number[]} options.getLevels
 * @param {() => number} options.getCurrentBet
 * @param {(level: number) => void} options.setBet
 * @param {(level: number) => string} options.formatLevelAmount
 * @param {() => boolean} options.getCanOpen
 */
export function createBetPicker({
  modalHost,
  shell = null,
  getTitle,
  getLevels,
  getCurrentBet,
  setBet,
  formatLevelAmount,
  getCanOpen,
}) {
  const PICKER_ID = 'bet-picker';

  function renderBody(body) {
    shell?.classList.add('suki-bet-picker-modal-open');

    body.innerHTML = '';
    body.classList.add('suki-bet-picker-body');

    const card = document.createElement('div');
    card.className = 'suki-bet-picker-card';

    const title = document.createElement('h2');
    title.className = 'suki-bet-picker-title';
    title.textContent = getTitle();

    const levelsBlock = document.createElement('div');
    levelsBlock.className = 'suki-bet-picker-levels';

    const levelsLabel = document.createElement('span');
    levelsLabel.className = 'suki-bet-picker-levels-label';
    levelsLabel.textContent = 'SELECT AMOUNT';

    const grid = document.createElement('div');
    grid.className = 'bet-picker-grid';
    grid.setAttribute('role', 'listbox');
    grid.setAttribute('aria-label', getTitle());

    const levels = [...getLevels()].sort((a, b) => a - b);
    const current = getCurrentBet();

    for (const level of levels) {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'bet-picker-option';
      option.dataset.betLevel = String(level);
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', level === current ? 'true' : 'false');
      if (level === current) {
        option.classList.add('is-active');
      }
      option.textContent = formatLevelAmount(level);
      option.addEventListener('click', () => {
        setBet(level);
        modalHost.close();
      });
      grid.appendChild(option);
    }

    levelsBlock.append(levelsLabel, grid);
    card.append(title, levelsBlock);
    body.append(card);
  }

  function open() {
    if (!getCanOpen()) return false;
    modalHost.register(PICKER_ID, {
      title: '',
      render: renderBody,
    });
    modalHost.open(PICKER_ID);
    return true;
  }

  function closeIfOpen() {
    if (modalHost.getOpenId?.() === PICKER_ID) {
      modalHost.close();
    }
  }

  return { open, closeIfOpen };
}
