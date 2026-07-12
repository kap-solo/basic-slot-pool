/**
 * Bet stepper — minus / play / plus row around the main bet button.
 */

/**
 * @param {HTMLButtonElement} playButton
 * @param {{ onStepDown: () => void, onStepUp: () => void, syncState?: (buttons: { downButton: HTMLButtonElement, upButton: HTMLButtonElement }) => void }} handlers
 */
export function mountBetStepper(playButton, { onStepDown, onStepUp, syncState }) {
  const row = document.createElement('div');
  row.className = 'suki-bet-play-row';

  const downButton = document.createElement('button');
  downButton.type = 'button';
  downButton.className = 'suki-bet-step suki-bet-step--down';
  downButton.textContent = '-';
  downButton.setAttribute('aria-label', 'Decrease bet');

  const upButton = document.createElement('button');
  upButton.type = 'button';
  upButton.className = 'suki-bet-step suki-bet-step--up';
  upButton.textContent = '+';
  upButton.setAttribute('aria-label', 'Increase bet');

  const parent = playButton.parentNode;
  if (!parent) {
    return { downButton, upButton, sync() {} };
  }

  parent.insertBefore(row, playButton);
  row.append(downButton, playButton, upButton);

  downButton.addEventListener('click', () => onStepDown());
  upButton.addEventListener('click', () => onStepUp());

  return {
    downButton,
    upButton,
    sync() {
      syncState?.({ downButton, upButton });
    },
  };
}
