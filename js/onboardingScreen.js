/**
 * On-boarding screen — desktop triptych or mobile single-frame with side navigation.
 */

import { BET_UI_VARIANT, MOBILE_SCREEN_IDS, resolveBetUiVariant } from './betUiVariant.js';
import { mountOnboardingSpine } from './pixi/onboardingSpine.js';

const ONBOARDING_PREV_CHEVRON_SRC = 'assets/ui/previous_chevron.svg';
const ONBOARDING_NEXT_CHEVRON_SRC = 'assets/ui/next_chevron.svg';

/**
 * @param {string} className
 * @param {string} ariaLabel
 * @param {string} src
 */
function createOnboardingChevronButton(className, ariaLabel, src) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('aria-label', ariaLabel);

  const icon = document.createElement('img');
  icon.className = 'suki-game-onboarding-side-btn__icon';
  icon.src = src;
  icon.alt = '';
  icon.setAttribute('aria-hidden', 'true');
  icon.draggable = false;

  button.appendChild(icon);
  return button;
}

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

export const ONBOARDING_HINT_MOBILE = 'TAP ANYWHERE TO PLAY';
export const ONBOARDING_HINT_DESKTOP = 'CLICK ANYWHERE TO PLAY';

/**
 * @param {HTMLElement | null | undefined} shell
 * @param {string | undefined} [override]
 */
export function resolveOnboardingContinueHint(shell, override) {
  if (override) return override;
  return resolveBetUiVariant(shell) === BET_UI_VARIANT.MOBILE
    ? ONBOARDING_HINT_MOBILE
    : ONBOARDING_HINT_DESKTOP;
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
 * @param {() => void} [options.onGestureUnlock] Synchronous user-gesture hook (e.g. iOS Web Audio unlock) — runs before teardown.
 * @param {boolean} [options.skip]
 */
export function createOnboardingScreen(options) {
  const {
    shell,
    frames: framesOverride,
    socialCasino = false,
    continueHint,
    onContinue,
    onGestureUnlock,
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

  const carouselStage = document.createElement('div');
  carouselStage.className = 'suki-game-onboarding-carousel-stage';

  const prevBtn = createOnboardingChevronButton(
    'suki-game-onboarding-side-btn suki-game-onboarding-side-btn--prev',
    'Previous',
    ONBOARDING_PREV_CHEVRON_SRC,
  );

  const carouselSpineHost = document.createElement('div');
  carouselSpineHost.className = 'suki-game-onboarding-spine-host';

  const nextBtn = createOnboardingChevronButton(
    'suki-game-onboarding-side-btn suki-game-onboarding-side-btn--next',
    'Next',
    ONBOARDING_NEXT_CHEVRON_SRC,
  );

  carouselStage.append(prevBtn, carouselSpineHost, nextBtn);

  const carouselCopy = document.createElement('div');
  carouselCopy.className = 'suki-game-onboarding-copy suki-game-onboarding-carousel-copy';

  const carouselHeader = document.createElement('h2');
  carouselHeader.className = 'suki-game-onboarding-header';

  const carouselText = document.createElement('p');
  carouselText.className = 'suki-game-onboarding-text suki-game-onboarding-carousel-text';

  carouselCopy.append(carouselHeader, carouselText);
  carousel.append(carouselStage, carouselCopy);

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

  const hint = document.createElement('p');
  hint.className = 'suki-game-onboarding-hint';

  function syncContinueHint() {
    hint.textContent = resolveOnboardingContinueHint(shell, continueHint);
  }

  syncContinueHint();

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
    prevBtn.removeEventListener('pointerdown', onSideNavPointerDown);
    nextBtn.removeEventListener('pointerdown', onSideNavPointerDown);
    prevBtn.removeEventListener('click', onPrevClick);
    nextBtn.removeEventListener('click', onNextClick);
    clearSpineMounts();
    overlay.remove();
    shell.classList.remove('suki-onboarding-active');
  }

  function dismiss() {
    if (dismissed) return;
    dismissed = true;
    onGestureUnlock?.();
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

  function onSideNavPointerDown(event) {
    event.stopPropagation();
  }

  function onPrevClick(event) {
    event.stopPropagation();
    if (prevBtn.disabled) return;
    setCarouselIndex(carouselIndex - 1);
  }

  function onNextClick(event) {
    event.stopPropagation();
    if (nextBtn.disabled) return;
    setCarouselIndex(carouselIndex + 1);
  }

  overlay.addEventListener('pointerdown', onOverlayPointerDown);
  overlay.addEventListener('keydown', onOverlayKeyDown);
  prevBtn.addEventListener('pointerdown', onSideNavPointerDown);
  nextBtn.addEventListener('pointerdown', onSideNavPointerDown);
  prevBtn.addEventListener('click', onPrevClick);
  nextBtn.addEventListener('click', onNextClick);

  const layoutObserver = new MutationObserver(() => {
    window.clearTimeout(layoutDebounceId);
    layoutDebounceId = window.setTimeout(() => {
      syncContinueHint();
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
