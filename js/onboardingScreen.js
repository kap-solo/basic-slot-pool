/**
 * On-boarding screen — desktop triptych or mobile single-frame with side navigation.
 */

import { MAX_CASCADE_LADDER } from './cluster.js';
import { FREE_SPINS_AWARDED, SCATTER_TRIGGER_COUNT } from './config.js';
import { BET_UI_VARIANT, MOBILE_SCREEN_IDS, resolveBetUiVariant } from './betUiVariant.js';
import { mountOnboardingSpine } from './pixi/onboardingSpine.js';

const ONBOARDING_PREV_CHEVRON_SRC = 'assets/ui/previous_chevron.svg';
const ONBOARDING_NEXT_CHEVRON_SRC = 'assets/ui/next_chevron.svg';
const ONBOARDING_GAME_LOGO_SRC = 'assets/ui/game_logo.webp';

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

/**
 * @param {HTMLElement} el
 * @param {string} header
 */
function setOnboardingHeader(el, header) {
  el.replaceChildren();
  const space = header.indexOf(' ');
  const line1 = space === -1 ? header : header.slice(0, space);
  const line2 = space === -1 ? '' : header.slice(space + 1);

  const first = document.createElement('span');
  first.className = 'suki-game-onboarding-header__line';
  first.textContent = line1;
  el.appendChild(first);

  if (line2) {
    const second = document.createElement('span');
    second.className = 'suki-game-onboarding-header__line';
    second.textContent = line2;
    el.appendChild(second);
  }
}

/** Placeholder copy — real-money / Stake. */
export const ONBOARDING_FRAMES = [
  {
    header: 'CLUSTER CASCADES',
    body: 'Connect 5 or more matching symbols. Winning symbols disappear and new symbols drop in — wins can chain in a single spin.',
    spine: 'fr1',
  },
  {
    header: 'MULTIPLIER LADDER',
    body: `Each cascade climbs the multiplier ladder up to ×${MAX_CASCADE_LADDER}, boosting your payout.`,
    spine: 'fr2',
  },
  {
    header: 'FREE SPINS',
    body: `Land ${SCATTER_TRIGGER_COUNT} or more Scatter symbols to trigger ${FREE_SPINS_AWARDED} Free Spins. Every spin brings fresh cluster cascades and multipliers up to ×${MAX_CASCADE_LADDER}.`,
    spine: 'fr3',
  },
];

/** Social casino copy — Win → Earn, bet → play amount. */
export const ONBOARDING_FRAMES_SOCIAL = [
  {
    header: 'CLUSTER CASCADES',
    body: 'Connect 5 or more matching symbols. Matched symbols disappear and new symbols drop in — earns can chain in a single spin.',
    spine: 'fr1',
  },
  {
    header: 'MULTIPLIER LADDER',
    body: `Each cascade climbs the multiplier ladder up to ×${MAX_CASCADE_LADDER}, boosting your earn.`,
    spine: 'fr2',
  },
  {
    header: 'FREE SPINS',
    body: `Land ${SCATTER_TRIGGER_COUNT} or more Scatter symbols to award ${FREE_SPINS_AWARDED} Free Spins. Every spin brings fresh cluster cascades and multipliers up to ×${MAX_CASCADE_LADDER}.`,
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

/** Raster paths for onboarding UI — warmed during session preloader. */
export const ONBOARDING_PRELOAD_IMAGE_ASSETS = [
  ONBOARDING_PREV_CHEVRON_SRC,
  ONBOARDING_NEXT_CHEVRON_SRC,
  'assets/desktop_bg_onboarding.jpg',
  'assets/mobile_bg_LRG_onboarding.jpg',
  'assets/mobile_bg_REG_onboarding.jpg',
];

/**
 * Onboarding background JPG for the current shell — mirrors `css/onboarding.css` selectors.
 *
 * @param {HTMLElement | null | undefined} shell
 */
export function resolveOnboardingBgSrc(shell) {
  if (!shell) return 'assets/desktop_bg_onboarding.jpg';

  const screen = shell.dataset.sukiScreen || '';
  if (screen === 'popout-s' || shell.classList.contains('suki-viewport-popout-s')) {
    return 'assets/desktop_bg_onboarding.jpg';
  }

  if (resolveBetUiVariant(shell) !== BET_UI_VARIANT.MOBILE) {
    return 'assets/desktop_bg_onboarding.jpg';
  }

  const portraitFamily = shell.dataset.sukiPortraitFamily || '';
  if (screen === 'mobile-l' || portraitFamily === 'mobile-l') {
    return 'assets/mobile_bg_LRG_onboarding.jpg';
  }
  if (screen === 'mobile-m' || screen === 'mobile-s' || portraitFamily === 'mobile-ms') {
    return 'assets/mobile_bg_REG_onboarding.jpg';
  }

  const orientation = shell.dataset.sukiOrientation || '';
  if (
    orientation === 'portrait' &&
    !portraitFamily &&
    screen !== 'mobile-m' &&
    screen !== 'mobile-s'
  ) {
    return 'assets/mobile_bg_LRG_onboarding.jpg';
  }

  return 'assets/mobile_bg_REG_onboarding.jpg';
}

/**
 * @param {string} src
 * @returns {Promise<void>}
 */
function ensureOnboardingBgDecoded(src) {
  return new Promise((resolve) => {
    const img = new Image();
    const finish = () => {
      void img.decode?.().then(resolve, resolve);
    };
    img.addEventListener('load', finish, { once: true });
    img.addEventListener('error', finish, { once: true });
    img.src = src;
    if (img.complete) finish();
  });
}

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
 * Carousel for phones, popout-s, and mobile bet UI — grid on desktop/laptop/popout-l
 * and any large landscape shell using desktop bet chrome (including dev window resize).
 *
 * @param {HTMLElement | null | undefined} shell
 */
export function isOnboardingCarouselLayout(shell) {
  if (!shell) return true;

  const screen = shell.dataset.sukiScreen || '';

  if (screen === 'desktop' || screen === 'laptop' || screen === 'popout-l') {
    return false;
  }

  if (screen === 'popout-s' || shell.classList.contains('suki-viewport-popout-s')) {
    return true;
  }

  if (MOBILE_SCREEN_IDS.has(screen)) {
    return true;
  }

  return resolveBetUiVariant(shell) === BET_UI_VARIANT.MOBILE;
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
  /** @type {Map<import('./pixi/onboardingSpine.js').OnboardingSpineId, { layer: HTMLElement, mount: (typeof spineMounts)[number] }>} */
  const carouselSpineLayers = new Map();
  /** @type {Set<import('./pixi/onboardingSpine.js').OnboardingSpineId>} */
  const carouselSpinesStarted = new Set();
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
    carouselSpineLayers.clear();
    carouselSpinesStarted.clear();
    carouselSpineHost.replaceChildren();
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

  const continueBtn = document.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'suki-game-onboarding-continue';
  continueBtn.setAttribute('aria-label', 'Continue to game');

  const content = document.createElement('div');
  content.className = 'suki-game-onboarding-content';

  const grid = document.createElement('div');
  grid.className = 'suki-game-onboarding-grid';
  grid.hidden = true;

  const carousel = document.createElement('div');
  carousel.className = 'suki-game-onboarding-carousel';
  carousel.hidden = true;

  const carouselLogo = document.createElement('div');
  carouselLogo.className = 'suki-game-onboarding-logo';

  const carouselLogoImg = document.createElement('img');
  carouselLogoImg.className = 'suki-game-onboarding-logo__img';
  carouselLogoImg.src = ONBOARDING_GAME_LOGO_SRC;
  carouselLogoImg.alt = '';
  carouselLogoImg.decoding = 'async';
  carouselLogoImg.draggable = false;
  carouselLogo.append(carouselLogoImg);

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
    setOnboardingHeader(header, frame.header);

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

  content.append(grid, carouselLogo, carousel);
  overlay.append(bg, continueBtn, content, hint);
  shell.appendChild(overlay);
  shell.classList.add('suki-onboarding-active');
  overlay.classList.add('suki-game-onboarding--pending-bg');
  const bgReady = ensureOnboardingBgDecoded(resolveOnboardingBgSrc(shell)).then(() => {
    overlay.classList.remove('suki-game-onboarding--pending-bg');
    overlay.classList.add('suki-game-onboarding--bg-ready');
  });

  function isCarousel() {
    return isOnboardingCarouselLayout(shell);
  }

  function syncCarouselUi() {
    const frame = frames[carouselIndex];
    setOnboardingHeader(carouselHeader, frame?.header ?? '');
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
      syncCarouselSpineState();
      void queueLayoutWork(() => settleSpineMounts());
    }
  }

  async function mountSpineHosts(entries) {
    /** @type {typeof spineMounts} */
    const mounted = [];
    await Promise.all(
      entries.map(async ({ host, spine = 'fr1', autoplay = true }) => {
        try {
          const mount = await mountOnboardingSpine(host, { spine, autoplay });
          mounted.push(mount);
        } catch (err) {
          console.warn('[Basic Slot] Onboarding Spine unavailable.', err);
        }
      }),
    );
    return mounted;
  }

  function syncCarouselSpineState() {
    const activeSpine = frames[carouselIndex]?.spine ?? 'fr1';
    for (const [spineId, { layer, mount }] of carouselSpineLayers) {
      layer.classList.toggle('is-active', spineId === activeSpine);
      if (spineId === activeSpine && !carouselSpinesStarted.has(spineId)) {
        mount.play?.();
        carouselSpinesStarted.add(spineId);
      }
    }
  }

  async function ensureCarouselSpines() {
    /** @type {import('./pixi/onboardingSpine.js').OnboardingSpineId[]} */
    const spineIds = [...new Set(frames.map((frame) => frame.spine ?? 'fr1'))];
    const activeSpine = frames[carouselIndex]?.spine ?? 'fr1';
    /** @type {typeof spineMounts} */
    const newMounts = [];
    const pending = spineIds
      .filter((spineId) => !carouselSpineLayers.has(spineId))
      .map(async (spineId) => {
        const layer = document.createElement('div');
        layer.className = 'suki-game-onboarding-spine-layer';
        carouselSpineHost.appendChild(layer);
        const mounted = await mountSpineHosts([{
          host: layer,
          spine: spineId,
          autoplay: spineId === activeSpine,
        }]);
        const mount = mounted[0];
        if (!mount) {
          layer.remove();
          return;
        }
        carouselSpineLayers.set(spineId, { layer, mount });
        if (spineId === activeSpine) {
          carouselSpinesStarted.add(spineId);
        }
        newMounts.push(mount);
      });
    await Promise.all(pending);
    syncCarouselSpineState();
    return newMounts;
  }

  function queueLayoutWork(work) {
    layoutQueue = layoutQueue
      .then(work)
      .catch((err) => {
        console.warn('[Basic Slot] Onboarding layout failed.', err);
      });
    return layoutQueue;
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
      mounted = await ensureCarouselSpines();
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
      carouselSpineLayers.clear();
      carouselSpineHost.replaceChildren();
      mountedLayoutMode = null;
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
    continueBtn.removeEventListener('click', onContinueClick);
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

  function onContinueClick() {
    if (dismissed) return;
    // Always unlock on continue — iOS rejects pointerdown; a prior side-nav pointerdown must not skip this.
    onGestureUnlock?.();
    dismiss();
  }

  function onPrevClick(event) {
    event.stopPropagation();
    if (prevBtn.disabled) return;
    onGestureUnlock?.();
    setCarouselIndex(carouselIndex - 1);
  }

  function onNextClick(event) {
    event.stopPropagation();
    if (nextBtn.disabled) return;
    onGestureUnlock?.();
    setCarouselIndex(carouselIndex + 1);
  }

  continueBtn.addEventListener('click', onContinueClick);
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
    ready: bgReady,
    destroy() {
      if (dismissed) return;
      dismissed = true;
      teardown();
    },
  };
}
