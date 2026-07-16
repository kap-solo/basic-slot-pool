/** Static PNG until a Spine character asset is wired in. */
export const CHARACTER_PLACEHOLDER_SRC = 'assets/character.png';

/**
 * Mount the flank character placeholder. Replace this host with Spine later.
 * @param {HTMLElement | null | undefined} host
 */
export function mountCharacterPlaceholder(host) {
  if (!host || host.dataset.characterMount) return;

  const img = document.createElement('img');
  img.className = 'character-host__placeholder';
  img.src = CHARACTER_PLACEHOLDER_SRC;
  img.alt = '';
  img.decoding = 'async';
  host.appendChild(img);
  host.dataset.characterMount = 'placeholder';
}
