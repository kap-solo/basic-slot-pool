/**
 * Bet level picker — scrollable 3-column grid inside the Suki modal host.
 */

/**
 * @param {object} options
 * @param {ReturnType<import('@kap-solo/suki-engine/client/rgs.js').createModalHost>} options.modalHost
 * @param {() => string} options.getTitle
 * @param {() => number[]} options.getLevels
 * @param {() => number} options.getCurrentBet
 * @param {(level: number) => void} options.setBet
 * @param {(level: number) => string} options.formatLevelAmount
 * @param {() => boolean} options.getCanOpen
 */
export function createBetPicker({
  modalHost,
  getTitle,
  getLevels,
  getCurrentBet,
  setBet,
  formatLevelAmount,
  getCanOpen,
}) {
  const PICKER_ID = 'bet-picker';

  function renderBody(body) {
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

    body.appendChild(grid);
  }

  function open() {
    if (!getCanOpen()) return false;
    modalHost.register(PICKER_ID, {
      title: getTitle(),
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
