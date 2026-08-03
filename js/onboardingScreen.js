/**
 * Industry-standard on-boarding screen — feature carousel / triptych, then tap to play.
 */

import { MOBILE_SCREEN_IDS } from './betUiVariant.js';
import { mountOnboardingSpine } from './pixi/onboardingSpine.js';

/** @typedef {{ header: string, body: string, spine?: import('./pixi/onboardingSpine.js').OnboardingSpineId }} OnboardingFrame */

/** Placeholder copy — real-money / Stake. */
export const ONBOARDING_FRAMES = [
  {
    header: 'CLUSTER CASCADES',
    body: 'Match five or more symbols. Winners cascade away for consecutive wins.',
    spine: 'fr1',
  },
  {
    header: 'MULTIPLIER LADDER',
    body: 'Each cascade climbs the multiplier ladder and boosts your payout.',
    spine: 'fr1',
  },
  {
    header: 'FREE SPINS',
    body: 'Land scatters for free spins with enhanced multipliers. Set your bet and spin.',
    spine: 'fr3',
  },
];

/** Social casino copy — Win → Earn, bet → play amount. */
export const ONBOARDING_FRAMES_SOCIAL = [
  {
    header: 'CLUSTER CASCADES',
    body: 'Match five or more symbols. Winners cascade for consecutive earns.',
    spine: 'fr1',
  },
  {
    header: 'MULTIPLIER LADDER',
    body: 'Each cascade climbs the multiplier ladder and boosts your earn.',
    spine: 'fr1',
  },
  {
    header: 'FREE SPINS',
    body: 'Land scatters for free spins with enhanced multipliers. Set your play amount and spin.',
    spine: 'fr3',
  },
];

/**
 * @param {boolean} [socialCasino]
 * @returns {OnboardingFrame[]}
 */
export function resolveOnboardingFrames(socialCasino = false) {
  return socialCasino ? ONBOARDING_FRAMES_SOCIAL : ONBOARDING_FRAMES;
}

/**
 * @param {HTMLElement | null | undefined} shell
 */
export function isOnboardingCarouselLayout(shell) {
  if (!shell) return true;
  const screen = shell.dataset.sukiScreen || '';
  if (screen === 'popout-s') return true;
  if (MOBILE_SCREEN_IDS.has(screen)) return true;
  return shell.dataset.betUiVariant === 'mobile';
}

/**
 * @param {object} options
 * @param {HTMLElement} options.shell
 * @param {OnboardingFrame[]} [options.frames]
 * @param {boolean} [options.socialCasino]
 * @param {string} [options.continueHint]
 * @param {() => void} [options.onContinue]
 * @param {boolean} [options.skip]
 */
export function createOnboardingScreen(options) {
  const {
    shell,
    frames: framesOverride,
    socialCasino = false,
    continueHint = 'Press anywhere to continue',
    onContinue,
    skip = false,
  } = options;

  const frames = framesOverride ?? resolveOnboardingFrames(socialCasino);

  if (typeof document === 'undefined' || !shell || skip) {
    onContinue?.();
    return { destroy() {} };
  }

  let dismissed = false;
  let carouselIndex = 0;
  /** @type {Array<{ host: HTMLElement, relayout?: () => void, settleLayout?: () => Promise<void>, destroy: () => void }>} */
  const spineMounts = [];
  /** @type {'carousel' | 'grid' | null} */
  let mountedLayoutMode = null;
  let layoutGeneration = 0;
  let layoutDebounceId = 0;
  /** @type {Promise<void>} */
  let layoutQueue = Promise.resolve();

  function clearSpineMounts() {
    for (const mount of spineMounts) {
      mount.destroy();
    }
    spineMounts.length = 0;
  }

  async function settleSpineMounts() {
    await Promise.all(spineMounts.map((mount) => mount.settleLayout?.() ?? Promise.resolve()));
  }

  const overlay = document.createElement('div');
  overlay.className = 'suki-game-onboarding';
  overlay.setAttribute('tabindex', '0');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Game introduction');

  const bg = document.createElement('div');
  bg.className = 'suki-game-onboarding-bg';
  bg.setAttribute('aria-hidden', 'true');

  const content = document.createElement('div');
  content.className = 'suki-game-onboarding-content';

  const grid = document.createElement('div');
  grid.className = 'suki-game-onboarding-grid';
  grid.hidden = true;

  const carousel = document.createElement('div');
  carousel.className = 'suki-game-onboarding-carousel';
  carousel.hidden = true;

  const carouselSpineHost = document.createElement('div');
  carouselSpineHost.className = 'suki-game-onboarding-spine-host';

  const carouselCopy = document.createElement('div');
  carouselCopy.className = 'suki-game-onboarding-copy suki-game-onboarding-carousel-copy';

  const carouselHeader = document.createElement('h2');
  carouselHeader.className = 'suki-game-onboarding-header';

  const carouselText = document.createElement('p');
  carouselText.className = 'suki-game-onboarding-text suki-game-onboarding-carousel-text';

  carouselCopy.append(carouselHeader, carouselText);

  const nav = document.createElement('div');
  nav.className = 'suki-game-onboarding-nav';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'suki-game-onboarding-nav-btn suki-game-onboarding-nav-btn--prev';
  prevBtn.setAttribute('aria-label', 'Previous');
  prevBtn.textContent = '‹';

  const dotsEl = document.createElement('div');
  dotsEl.className = 'suki-game-onboarding-dots';
  dotsEl.setAttribute('role', 'tablist');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'suki-game-onboarding-nav-btn suki-game-onboarding-nav-btn--next';
  nextBtn.setAttribute('aria-label', 'Next');
  nextBtn.textContent = '›';

  nav.append(prevBtn, dotsEl, nextBtn);
  carousel.append(carouselSpineHost, carouselCopy, nav);

  /** @type {HTMLElement[]} */
  const gridSpineHosts = [];

  for (const frame of frames) {
    const panel = document.createElement('article');
    panel.className = 'suki-game-onboarding-panel';

    const spineHost = document.createElement('div');
    spineHost.className = 'suki-game-onboarding-spine-host';
    gridSpineHosts.push(spineHost);

    const copy = document.createElement('div');
    copy.className = 'suki-game-onboarding-copy';

    const header = document.createElement('h2');
    header.className = 'suki-game-onboarding-header';
    header.textContent = frame.header;

    const text = document.createElement('p');
    text.className = 'suki-game-onboarding-text';
    text.textContent = frame.body;

    copy.append(header, text);
    panel.append(spineHost, copy);
    grid.appendChild(panel);
  }

  for (let i = 0; i < frames.length; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'suki-game-onboarding-dot';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', `Slide ${i + 1} of ${frames.length}`);
    dotsEl.appendChild(dot);
  }

  const hint = document.createElement('p');
  hint.className = 'suki-game-onboarding-hint';
  hint.textContent = continueHint;

  content.append(grid, carousel);
  overlay.append(bg, content, hint);
  shell.appendChild(overlay);
  shell.classList.add('suki-onboarding-active');

  function isCarousel() {
    return isOnboardingCarouselLayout(shell);
  }

  function syncCarouselUi() {
    const frame = frames[carouselIndex];
    carouselHeader.textContent = frame?.header ?? '';
    carouselText.textContent = frame?.body ?? '';
    prevBtn.disabled = carouselIndex <= 0;
    nextBtn.disabled = carouselIndex >= frames.length - 1;
    const dots = dotsEl.querySelectorAll('.suki-game-onboarding-dot');
    dots.forEach((dot, index) => {
      dot.classList.toggle('is-active', index === carouselIndex);
      dot.setAttribute('aria-selected', index === carouselIndex ? 'true' : 'false');
    });
  }

  function setCarouselIndex(index) {
    const clamped = Math.max(0, Math.min(frames.length - 1, index));
    if (clamped === carouselIndex) {
      syncCarouselUi();
      return;
    }
    carouselIndex = clamped;
    syncCarouselUi();
    if (isCarousel()) {
      void queueLayoutWork(() => remountCarouselSpine());
    }
  }

  async function mountSpineHosts(entries) {
    /** @type {typeof spineMounts} */
    const mounted = [];
    await Promise.all(
      entries.map(async ({ host, spine = 'fr1' }) => {
        try {
          const mount = await mountOnboardingSpine(host, { spine });
          mounted.push(mount);
        } catch (err) {
          console.warn('[Basic Slot] Onboarding Spine unavailable.', err);
        }
      }),
    );
    return mounted;
  }

  function destroySpineMountsForHost(host) {
    const keep = [];
    for (const mount of spineMounts) {
      if (mount.host === host) {
        mount.destroy();
      } else {
        keep.push(mount);
      }
    }
    spineMounts.length = 0;
    spineMounts.push(...keep);
  }

  function queueLayoutWork(work) {
    layoutQueue = layoutQueue
      .then(work)
      .catch((err) => {
        console.warn('[Basic Slot] Onboarding layout failed.', err);
      });
    return layoutQueue;
  }

  async function remountCarouselSpine() {
    destroySpineMountsForHost(carouselSpineHost);
    const frame = frames[carouselIndex];
    const mounted = await mountSpineHosts([{
      host: carouselSpineHost,
      spine: frame?.spine ?? 'fr1',
    }]);
    spineMounts.push(...mounted);
    await settleSpineMounts();
  }

  async function applyLayoutBody() {
    const generation = ++layoutGeneration;
    const carouselMode = isCarousel();
    const layoutMode = carouselMode ? 'carousel' : 'grid';
    grid.hidden = carouselMode;
    carousel.hidden = !carouselMode;

    if (mountedLayoutMode === layoutMode && spineMounts.length > 0) {
      for (const mount of spineMounts) {
        mount.relayout?.();
      }
      await settleSpineMounts();
      return;
    }

    clearSpineMounts();
    mountedLayoutMode = layoutMode;

    /** @type {typeof spineMounts} */
    let mounted = [];
    if (carouselMode) {
      syncCarouselUi();
      mounted = await mountSpineHosts([{
        host: carouselSpineHost,
        spine: frames[carouselIndex]?.spine ?? 'fr1',
      }]);
    } else {
      mounted = await mountSpineHosts(
        gridSpineHosts.map((host, index) => ({
          host,
          spine: frames[index]?.spine ?? 'fr1',
        })),
      );
    }

    if (generation !== layoutGeneration || dismissed) {
      for (const mount of mounted) {
        mount.destroy();
      }
      return;
    }

    spineMounts.push(...mounted);
    await settleSpineMounts();
  }

  function applyLayout() {
    return queueLayoutWork(() => applyLayoutBody());
  }

  function teardown() {
    layoutGeneration += 1;
    window.clearTimeout(layoutDebounceId);
    layoutObserver.disconnect();
    window.removeEventListener('resize', onResize);
    viewport?.removeEventListener('resize', onResize);
    overlay.removeEventListener('pointerdown', onOverlayPointerDown);
    overlay.removeEventListener('keydown', onOverlayKeyDown);
    nav.removeEventListener('pointerdown', onNavPointerDown);
    prevBtn.removeEventListener('click', onPrevClick);
    nextBtn.removeEventListener('click', onNextClick);
    clearSpineMounts();
    overlay.remove();
    shell.classList.remove('suki-onboarding-active');
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    teardown();
    onContinue?.();
  }

  function onOverlayPointerDown(event) {
    dismiss();
    event.preventDefault();
  }

  function onOverlayKeyDown(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dismiss();
    }
  }

  function onNavPointerDown(event) {
    event.stopPropagation();
  }

  function onPrevClick(event) {
    event.stopPropagation();
    setCarouselIndex(carouselIndex - 1);
  }

  function onNextClick(event) {
    event.stopPropagation();
    setCarouselIndex(carouselIndex + 1);
  }

  overlay.addEventListener('pointerdown', onOverlayPointerDown);
  overlay.addEventListener('keydown', onOverlayKeyDown);
  nav.addEventListener('pointerdown', onNavPointerDown);
  prevBtn.addEventListener('click', onPrevClick);
  nextBtn.addEventListener('click', onNextClick);

  const layoutObserver = new MutationObserver(() => {
    window.clearTimeout(layoutDebounceId);
    layoutDebounceId = window.setTimeout(() => {
      void applyLayout();
    }, 80);
  });
  layoutObserver.observe(shell, {
    attributes: true,
    attributeFilter: ['data-suki-orientation', 'data-suki-screen', 'data-bet-ui-variant', 'data-suki-portrait-family'],
  });

  const onResize = () => {
    void queueLayoutWork(async () => {
      for (const mount of spineMounts) {
        mount.relayout?.();
      }
      await settleSpineMounts();
    });
  };
  window.addEventListener('resize', onResize);
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', onResize);

  void applyLayout();

  return {
    destroy() {
      if (dismissed) return;
      dismissed = true;
      teardown();
    },
  };
}
