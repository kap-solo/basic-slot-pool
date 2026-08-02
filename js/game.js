/**
 * Basic Slot — 5×5 cluster base mode on Suki Engine.
 */

import { apiToDisplay, displayToApi } from '@kap-solo/suki-engine/client/money.js';
import {
  authenticate,
  applyAuthBetConfig,
  buildReplayUrl,
  classifyRgsError,
  createAudioPrefs,
  createBetUi,
  createGameAudio,
  createGameBootstrap,
  createGameMenu,
  createGamePreloader,
  createModalHost,
  createRecentResultsStore,
  getReplayParams,
  getSessionID,
  isReplayMode,
  isDevMode,
  messageForRgsCode,
  modeButtonLabel,
  play,
  endRound,
  requestReplay,
  roundPayoutMultiplier,
  registerBuyBonusConfirm,
  startNewRgsSession,
  createAutoplayController,
  createAutoplayPanelPolicy,
  attachBetChromeResync,
  applyInferredStakeScreen,
  patchStakeLayoutForProduction,
} from '@kap-solo/suki-engine/client/rgs.js';
import {
  buildPreloadAssets,
  createBackgroundMusicLoop,
  createCascadeAudio,
  createClusterStepAudio,
  createGreenSquareAudio,
  createReelSpinAudio,
  createSpinClickAudio,
  resumeGameSfxContext,
  wireTemplateAudio,
} from './audio.js';
import { initCharacter } from './character.js';
import { initGameBackground } from './gameBackground.js';
import {
  BET_OPTIONS,
  DEFAULT_BET,
  randomIdleBoard,
  GAME,
  GAME_MODES,
  BUY_MODE_COST,
  BB_MODE,
  FREE_SPINS_AWARDED,
} from './config.js';
import { BUILD_COMMIT } from './build-info.js';
import { winCellsFromClusters, basePayForSymbol, clusterBaseMultiplier, quantizeWinMult } from './cluster.js';
import { mountBetStepper } from './betStepper.js';
import { registerAutoplayConfirm } from './autoplayConfirm.js';
import { applyModalCloseChrome } from './modalCloseChrome.js';
import {
  mountSpinButtonGraphic,
  playSpinButtonSpin,
  removeOrphanPlayHitWraps,
} from './spinButtonGraphic.js';
import { BET_UI_VARIANT, initBetUiVariant } from './betUiVariant.js';
import { showDevTools } from '@kap-solo/suki-engine/client/suki/environment.js';
import { DEFAULT_GAME_MENU_ITEMS } from '@kap-solo/suki-engine/client/suki/gameMenu.js';
import { mountMobileBetUi } from './betUiMobile.js';
import { mountDesktopBetUi } from './betUiDesktop.js';
import { registerGameModals, openGameInfoModal } from './menu.js';
import {
  buildGameSettledResult,
  bookCentiMultToDisplayWin,
  bookCentiMultToPayoutApi,
  boardForResumeSnapshot,
  finalBoardFromRound,
  isFeatureRoundActive,
  sortedBookEvents,
} from './round.js';
import {
  animateSlotSpin,
  createSlotBoard,
  describeRoundResult,
  formatMult,
} from './slot.js';
import { createDevStatsOverlay } from './devStatsOverlay.js';
import { createMultiplierPanel } from './multiplierPanel.js';
import { presentBlobAfterReveal, planRoundBlobPresentation } from './pixi/performanceBlob.js';
import { setLedgerSpineRegistry } from './pixi/ledgerSpineIcon.js';
import { loadSpineSymbolRegistry } from './pixi/spineAssets.js';
import { TIMING } from './pixi/timing.js';
import { ensureSession, loadSession, recordPlay, resetSession, saveSession } from './session.js';
import { mountPlayerNotice, showPlayerNotice } from './playerNotice.js';
import { createBetPicker } from './betPicker.js';
import { createDevToolbar } from './devToolbar.js';
import { createFeatureChrome } from './featureChrome.js';
import { createReplayStartModal } from './replayStartModal.js';
import { SAMPLE_FEATURE_BOOK } from './featureSampleBook.js';

const shellEl = document.querySelector('.suki-stake-shell');
mountPlayerNotice(shellEl);

/** @type {HTMLButtonElement | null} */
let playAffordBlocker = null;
const brandEl = document.querySelector('.suki-brand');
const modalHost = createModalHost({ root: shellEl });
applyModalCloseChrome(modalHost, shellEl);
const replayStartModal = createReplayStartModal(shellEl);
const audioPrefs = createAudioPrefs({ storageKey: `${GAME.id}.audio` });
const gameAudio = createGameAudio({ audioPrefs, autoUnlock: false });
wireTemplateAudio(gameAudio);
const backgroundMusic = createBackgroundMusicLoop(audioPrefs);
backgroundMusic.prime();
const reelSpinAudio = createReelSpinAudio(audioPrefs);
const spinClickAudio = createSpinClickAudio(audioPrefs);
const greenSquareAudio = createGreenSquareAudio(audioPrefs);
const cascadeAudio = createCascadeAudio(audioPrefs);
const clusterStepAudio = createClusterStepAudio(audioPrefs);

function primeGameSfx() {
  spinClickAudio.prime();
  reelSpinAudio.prime();
  greenSquareAudio.prime();
  cascadeAudio.prime();
  clusterStepAudio.prime();
}

let gameSfxPrimed = false;

function unlockGameAudio() {
  gameAudio.unlock();
  void backgroundMusic.unlock();
  resumeGameSfxContext(audioPrefs);
  if (!gameSfxPrimed) {
    gameSfxPrimed = true;
    primeGameSfx();
  }
}

/** Blob / cluster SFX fire outside the spin gesture — always pass unlock. */
const greenSquareSfx = {
  play: (unlock) => greenSquareAudio.play(unlock ?? unlockGameAudio),
  durationMs: () => greenSquareAudio.durationMs(),
};

function startCascadeMotionAudio() {
  cascadeAudio.start(unlockGameAudio);
}

const recentResults = createRecentResultsStore({ max: 25 });
const gameMenu = createGameMenu({
  brand: brandEl,
  shell: shellEl,
  modalHost,
  audioPrefs,
  items: DEFAULT_GAME_MENU_ITEMS.filter(
    (item) => item.id !== 'stats' && item.id !== 'recent-results',
  ).map((item) => {
    if (item.id === 'how-to-play') {
      return {
        ...item,
        type: 'action',
        action: () => openGameInfoModal(modalHost, 'how-to-play'),
      };
    }
    if (item.id === 'paytable') {
      return {
        ...item,
        type: 'action',
        action: () => openGameInfoModal(modalHost, 'paytable'),
      };
    }
    return item;
  }),
});

const balanceEl = document.getElementById('balance');
const messageEl = document.getElementById('message');
const replayBanner = document.getElementById('replay-banner');
const balanceHud = document.getElementById('balance-hud');
const hudDevActions = document.getElementById('hud-dev-actions');
const sessionTimerStat = document.getElementById('session-timer-stat');
const sessionTimerEl = document.getElementById('session-timer');
const slotRoot = document.getElementById('slot-board');
const slotStageEl = document.getElementById('slot-stage');
const gameCoreEl = document.querySelector('.suki-game-core');
const balanceLabelEl = document.getElementById('balance-label');
const replayNoteEl = document.getElementById('replay-note');
const multiplierPanel = createMultiplierPanel({
  panelEl: document.getElementById('multiplier-panel'),
  ledgerEl: document.getElementById('multiplier-ledger'),
});

document.getElementById('game-title').hidden = true;
document.getElementById('game-subtitle').hidden = true;

/** @type {Awaited<ReturnType<typeof createSlotBoard>> | null} */
let slotBoard = null;
/** @type {ReturnType<typeof createFeatureChrome> | null} */
let featureChrome = null;
/** @type {ReturnType<typeof initCharacter> | null} */
let characterUi = null;
let gameBackground = null;
/** Skip random idle board after auth resume. */
let skipNextSeedBoard = false;
/** Active round still settling on the RGS. */
let activeRoundPending = false;
/** Auth bootstrap resumed an active round this load. */
let resumedActiveRound = false;
/** Active-round auth resume waiting for preloader dismiss. */
let pendingAuthResume = null;
/** @type {string[][] | null} */
let idleBoardSeed = null;

const betUiRootEl = document.getElementById('bet-ui-root');

const betUi = createBetUi({
  root: betUiRootEl,
  showModeRow: false,
});

/** @type {ReturnType<typeof initBetUiVariant> | null} */
let betUiVariant = null;

let balance = 0;
/** Balance value currently painted in the HUD / mobile stat (may tween toward `balance`). */
let balanceForDisplay = 0;
/** @type {number | null} */
let balanceAnimRaf = null;

function cancelBalanceAnimation() {
  if (balanceAnimRaf != null) {
    cancelAnimationFrame(balanceAnimRaf);
    balanceAnimRaf = null;
  }
}

function updateBalanceUi() {
  balanceEl.textContent = replayMode ? '—' : fmtBalance(balanceForDisplay);
  mobileBetUi?.sync();
  desktopBetUi?.sync();
}

function animateBalanceIncrease(from, to) {
  cancelBalanceAnimation();
  const delta = to - from;
  if (delta <= 0) {
    balanceForDisplay = to;
    updateBalanceUi();
    return;
  }

  const start = performance.now();
  const duration = Math.min(1000, Math.max(400, 350 + Math.sqrt(delta) * 80));

  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - t) ** 3;
    balanceForDisplay = from + delta * eased;
    updateBalanceUi();
    if (t < 1) {
      balanceAnimRaf = requestAnimationFrame(tick);
    } else {
      balanceForDisplay = to;
      updateBalanceUi();
      balanceAnimRaf = null;
    }
  }

  balanceAnimRaf = requestAnimationFrame(tick);
}

function syncHud({ immediate = false } = {}) {
  if (replayMode) {
    cancelBalanceAnimation();
    balanceForDisplay = balance;
    updateBalanceUi();
    return;
  }

  const target = balance;
  if (immediate || target < balanceForDisplay - 0.0005) {
    cancelBalanceAnimation();
    balanceForDisplay = target;
    updateBalanceUi();
    return;
  }

  if (target > balanceForDisplay + 0.0005) {
    animateBalanceIncrease(balanceForDisplay, target);
    return;
  }

  balanceForDisplay = target;
  updateBalanceUi();
}

function cancelWinUiAnimations() {
  if (winAnimRaf != null) {
    cancelAnimationFrame(winAnimRaf);
    winAnimRaf = null;
  }
  if (winFadeTimer != null) {
    clearTimeout(winFadeTimer);
    winFadeTimer = null;
  }
}

function winDisplayText() {
  if (winFadingOut) return fmtWin(winForDisplay);
  if ((winUiVisible || winAnimRaf != null) && winForDisplay > 0.0005) {
    return winAnimRaf != null ? fmtBalance(winForDisplay) : fmtWin(winForDisplay);
  }
  return '';
}

function updateWinUi() {
  const payload = {
    text: winDisplayText(),
    visible: winUiVisible || winFadingOut,
    settled: winUiSettled && (winUiVisible || winFadingOut),
    hiding: winFadingOut,
  };
  mobileBetUi?.updateWin?.(payload);
  desktopBetUi?.updateWin?.(payload);
}

function hideWinDisplay({ immediate = false } = {}) {
  cancelWinUiAnimations();
  lastWinPayout = 0;

  if (immediate || (!winUiVisible && !winFadingOut)) {
    winUiVisible = false;
    winFadingOut = false;
    winUiSettled = false;
    winForDisplay = 0;
    updateWinUi();
    return;
  }

  winUiVisible = false;
  winFadingOut = true;
  updateWinUi();

  winFadeTimer = window.setTimeout(() => {
    winFadingOut = false;
    winUiSettled = false;
    winForDisplay = 0;
    winFadeTimer = null;
    updateWinUi();
  }, WIN_FADE_MS);
}

function animateWinTo(target, generation = winSpinGeneration) {
  return new Promise((resolve) => {
    if (generation !== winSpinGeneration) {
      resolve();
      return;
    }

    cancelWinUiAnimations();
    const from = winForDisplay;
    const delta = target - from;

    if (Math.abs(delta) <= 0.0005) {
      winForDisplay = target;
      lastWinPayout = target;
      winUiVisible = target > 0.0005;
      updateWinUi();
      resolve();
      return;
    }

    winFadingOut = false;
    if (from <= 0.0005) {
      winUiVisible = false;
    }

    const start = performance.now();
    const duration = Math.min(500, Math.max(260, 220 + Math.sqrt(Math.abs(delta)) * 50));

    function tick(now) {
      if (generation !== winSpinGeneration) {
        winAnimRaf = null;
        resolve();
        return;
      }

      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      winForDisplay = from + delta * eased;
      if (!winUiVisible && winForDisplay > 0.0005) {
        winUiVisible = true;
      }
      updateWinUi();

      if (t < 1) {
        winAnimRaf = requestAnimationFrame(tick);
      } else {
        winForDisplay = target;
        lastWinPayout = target;
        winAnimRaf = null;
        updateWinUi();
        resolve();
      }
    }

    winAnimRaf = requestAnimationFrame(tick);
  });
}

function incrementWinDisplay(delta) {
  if (delta <= 0.0005) return Promise.resolve();
  const generation = winSpinGeneration;
  const target = winForDisplay + delta;
  winIncrementChain = winIncrementChain.then(() => animateWinTo(target, generation));
  return winIncrementChain;
}

async function runClusterWinIncrements(amounts, { delayMs = 0 } = {}) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  for (const amount of amounts) {
    await incrementWinDisplay(amount);
  }
}

/** Wait until board win popups finish fade-in before ticking the HUD win stat. */
function clusterHudWinDelayMs({ firstCascade, speed = 1 }) {
  const leadMs = firstCascade ? TIMING.firstCascadeLeadMs : TIMING.cascadeLeadMs;
  const popupStartMs = TIMING.cascadeDimInMs * 0.5;
  const popupFadeInMs = TIMING.cascadeWinPopupMs * 0.12;
  return Math.round((leadMs + popupStartMs + popupFadeInMs) / speed);
}

function finalizeWinDisplay(payout) {
  if (payout <= 0.0005) {
    hideWinDisplay();
    return;
  }

  cancelWinUiAnimations();
  lastWinPayout = payout;
  winFadingOut = false;
  winForDisplay = payout;
  winUiVisible = true;
  winUiSettled = true;
  updateWinUi();
}

function prepareWinForSpin({ preserveDisplay = false } = {}) {
  winSpinGeneration += 1;
  winIncrementChain = Promise.resolve();
  if (!preserveDisplay) {
    hideWinDisplay();
  }
}

let bet = DEFAULT_BET;
/** @type {number[]} */
let betOptions = [...BET_OPTIONS];
let spinning = false;
/** @type {ReturnType<typeof createAutoplayController> | null} */
let autoplaySession = null;
/** @type {ReturnType<typeof createAutoplayPanelPolicy> | null} */
let autoplayPanelPolicy = null;
let animationSpeed = 1;
/** Authoritative payout from the last settled round. */
let lastWinPayout = 0;
/** Win value painted in the mobile stat (may tween toward `lastWinPayout`). */
let winForDisplay = 0;
let winUiVisible = false;
let winUiSettled = false;
let winFadingOut = false;
/** @type {number | null} */
let winAnimRaf = null;
/** @type {number | null} */
let winFadeTimer = null;
let winSpinGeneration = 0;
/** @type {Promise<void>} */
let winIncrementChain = Promise.resolve();

const WIN_FADE_MS = 240;

const replayMode = isReplayMode();

const devStatsOverlay = createDevStatsOverlay({
  hostEl: shellEl,
  targetRtpPercent: GAME.targetRtpPercent,
  enabled: isDevMode() && !replayMode,
});

/** @type {ReturnType<typeof createDevToolbar> | null} */
let devToolbar = null;

/** @type {object | null} */
let replayRound = null;
let lastReplayUrl = '';
let lastReplayEventId = '';
/** @type {[number, number][] | null} */
let pendingClusterRemoved = null;
/** @type {{ round: object, result: object } | null} */
let pendingRoundSettled = null;

/** @type {object | null} */
let session = loadSession();

function setMessage(text) {
  messageEl.textContent = text;
}

function showInsufficientBalance() {
  showPlayerNotice(copyTerm('insufficientBalance'));
}

function canAffordPlay() {
  return balance >= playCostDisplay();
}

function ensurePlayHitWrap() {
  const btn = betUi.elements.dropButton;
  if (!btn?.parentNode) return null;
  removeOrphanPlayHitWraps();
  if (btn.parentElement?.classList.contains('play-hit-wrap')) {
    return btn.parentElement;
  }
  const wrap = document.createElement('div');
  wrap.className = 'play-hit-wrap';
  btn.parentNode.insertBefore(wrap, btn);
  wrap.appendChild(btn);
  mountSpinButtonGraphic(wrap);
  return wrap;
}

function isAutoplaying() {
  return autoplaySession?.active ?? false;
}

function syncPlayAffordBlocker() {
  const wrap = ensurePlayHitWrap();
  if (!wrap) return;

  const showBlocker = game.rgsReady
    && !replayMode
    && !spinning
    && !isAutoplaying()
    && !canAffordPlay()
    && betUi.elements.dropButton.disabled;

  if (showBlocker) {
    if (!playAffordBlocker) {
      playAffordBlocker = document.createElement('button');
      playAffordBlocker.type = 'button';
      playAffordBlocker.className = 'play-afford-blocker';
      playAffordBlocker.setAttribute('aria-label', 'Insufficient balance');
      playAffordBlocker.addEventListener('click', showInsufficientBalance);
      wrap.appendChild(playAffordBlocker);
    }
    playAffordBlocker.hidden = false;
  } else if (playAffordBlocker) {
    playAffordBlocker.hidden = true;
  }
  mountSpinButtonGraphic(wrap);
}

function fmtBalance(amount) {
  return game.formatCurrency(amount);
}

function fmtWin(amount) {
  return game.formatWin(amount);
}

/** Snap display-currency amounts to Stake API units (avoids float drift in splits). */
function quantizeDisplayAmount(amount) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return apiToDisplay(Math.round(displayToApi(amount)));
}

/** Per-cluster ledger / popup label — 2 dp, illustrative split (not full RGS precision). */
function formatLedgerWin(amount) {
  return `+${fmtBalance(quantizeDisplayAmount(amount))}`;
}

/**
 * Board win popup for one cluster — ladder line when ×2+.
 * @param {{ symbol: string, size?: number, cells?: [number, number][], baseMultiplier?: number }} cluster
 * @param {number} cascadeMultiplier ladder index from the book (1 = no boost)
 * @param {number | null} [displayAmount] — settled win for this cluster (book-quantized share)
 * @returns {{ amount: string, amountFrom: number, amountTo: number, formatAmount: (value: number) => string, cascadeLabel: string | null } | null}
 */
function buildClusterWinPopup(cluster, cascadeMultiplier, displayAmount = null) {
  const size = cluster.size ?? cluster.cells?.length ?? 0;
  if (size < 1) return null;
  const baseMult = cluster.baseMultiplier ?? clusterBaseMultiplier(cluster.symbol, size);
  const rawWin = displayAmount ?? (bet * baseMult * cascadeMultiplier);
  const clusterWin = quantizeDisplayAmount(rawWin);
  if (clusterWin <= 0.0005) return null;
  const amountFrom = quantizeDisplayAmount(Math.min(
    clusterWin,
    bet * basePayForSymbol(cluster.symbol) * cascadeMultiplier,
  ));
  return {
    amount: formatLedgerWin(clusterWin),
    amountFrom,
    amountTo: clusterWin,
    formatAmount: (value) => formatLedgerWin(value),
    cascadeLabel: cascadeMultiplier > 1 ? `Cascade ×${cascadeMultiplier}` : null,
  };
}

/**
 * Per-cluster HUD amounts for one cascade step — shares the book's quantized stepMultiplier.
 * @param {object} event clusterWin book event
 * @returns {number[]} display-currency amounts per cluster
 */
function clusterHudWinAmounts(event) {
  const cascadeMultiplier = event.cascadeMultiplier ?? 1;
  const clusters = event.clusters ?? [];
  if (!clusters.length) return [];

  let stepMult = event.stepMultiplier;
  if (stepMult == null) {
    let raw = 0;
    for (const cluster of clusters) {
      const size = cluster.size ?? cluster.cells?.length ?? 0;
      const baseMult = cluster.baseMultiplier ?? clusterBaseMultiplier(cluster.symbol, size);
      raw += baseMult * cascadeMultiplier;
    }
    stepMult = quantizeWinMult(raw);
  }
  if (stepMult <= 0) return [];

  const stepWinApi = Math.round(displayToApi(bet) * stepMult);
  if (stepWinApi <= 0) return [];

  if (clusters.length === 1) {
    return [apiToDisplay(stepWinApi)];
  }

  const weights = clusters.map((cluster) => {
    const size = cluster.size ?? cluster.cells?.length ?? 0;
    const baseMult = cluster.baseMultiplier ?? clusterBaseMultiplier(cluster.symbol, size);
    return baseMult * cascadeMultiplier;
  });
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) return [apiToDisplay(stepWinApi)];

  /** @type {number[]} */
  const amounts = [];
  let allocatedApi = 0;
  for (let i = 0; i < clusters.length; i += 1) {
    if (i === clusters.length - 1) {
      amounts.push(apiToDisplay(stepWinApi - allocatedApi));
      continue;
    }
    const shareApi = Math.round(stepWinApi * (weights[i] / weightSum));
    amounts.push(apiToDisplay(shareApi));
    allocatedApi += shareApi;
  }
  return amounts;
}

function copyTerm(key, vars) {
  if (game?.copy?.socialCasino) {
    if (key === 'buyConfirmTitle' || key === 'buyPlayButton') return 'Get Bonus';
    if (key === 'buyConfirmFeatureDetail') {
      return `${FREE_SPINS_AWARDED} free spins are awarded. Earnings during the feature are awarded to your balance when the round ends.`;
    }
  }
  return game?.copy?.t(key, vars) ?? key;
}

/** HUD win stat — Win (real) / Earn (social); Total Win during free spins. */
function winStatLabel() {
  if (featureChrome?.inFreeSpins?.()) {
    return game.copy.socialCasino ? 'Total Earn' : 'Total Win';
  }
  const term = copyTerm('win');
  if (term !== 'win') return term;
  return game.copy.socialCasino ? 'Earn' : 'Win';
}

function refreshWinStatLabel() {
  mobileBetUi?.sync();
  desktopBetUi?.sync();
}

/** Base bet shown in the HUD — always 1× tier, not feature debit. */
function baseBetDisplay() {
  return bet;
}

/** Cost of one base-mode spin (same as base bet). */
function playCostDisplay() {
  return baseBetDisplay();
}

function playCostForBet(level) {
  return level;
}

function buyCostDisplay() {
  return apiToDisplay(Math.round(displayToApi(bet) * BUY_MODE_COST));
}

function canBuyBonus() {
  return (
    !replayMode
    && game.rgsReady
    && game.betModes.canBuyFeature()
    && game.betModes.canSelectMode(BB_MODE)
    && !spinning
    && !isAutoplaying()
    && !isBoardPresenting()
    && balance >= buyCostDisplay()
  );
}

function buyButtonLabel() {
  if (game.copy.socialCasino) return 'Get Bonus';
  return `Buy ${BUY_MODE_COST}×`;
}

function canPickBet() {
  return !spinning && !isAutoplaying() && !isBoardPresenting() && !replayMode && game.rgsReady;
}

function playButtonLabel() {
  if (
    shellEl?.dataset.betUiVariant === BET_UI_VARIANT.MOBILE
    || shellEl?.dataset.betUiVariant === BET_UI_VARIANT.DESKTOP
  ) {
    return '';
  }
  return `${copyTerm('bet')} ${fmtBalance(playCostDisplay())}`;
}

/** This game does not use turbo / fast-play. */
function disableTurboForGame(jurisdiction) {
  jurisdiction.state.disabledTurbo = true;
  jurisdiction.state.disabledSuperTurbo = true;
}

/** Keep wager on an authenticate tier (display units). */
function snapBetToLevel(amount) {
  const levels = [...betOptions].sort((a, b) => a - b);
  if (!levels.length) return amount;

  if (levels.includes(amount)) return amount;

  let best = levels[0];
  let bestDistance = Math.abs(amount - best);
  for (const level of levels) {
    const distance = Math.abs(amount - level);
    if (distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * @param {number} direction -1 = lower level, +1 = higher level
 */
function stepBet(direction) {
  if (spinning || isAutoplaying() || isBoardPresenting() || replayMode || !game.rgsReady) return;

  const levels = [...betOptions].sort((a, b) => a - b);
  if (!levels.length) return;

  let idx = levels.indexOf(bet);
  if (idx < 0) {
    idx = levels.findIndex((level) => level >= bet);
    if (idx < 0) idx = levels.length - 1;
  }

  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= levels.length || nextIdx === idx) return;

  bet = levels[nextIdx];
  betUi.renderBetLevels();
  syncHud();
  syncControls();
}

/** @type {ReturnType<typeof mountBetStepper> | null} */
let betStepper = null;
/** @type {ReturnType<typeof mountMobileBetUi> | null} */
let mobileBetUi = null;
/** @type {ReturnType<typeof mountDesktopBetUi> | null} */
let desktopBetUi = null;

function syncBetStepperState({ downButton, upButton }) {
  const levels = [...betOptions].sort((a, b) => a - b);
  let idx = levels.indexOf(bet);
  if (idx < 0) {
    idx = levels.findIndex((level) => level >= bet);
    if (idx < 0) idx = levels.length - 1;
  }
  const busy = spinning || isAutoplaying() || isBoardPresenting() || !game.rgsReady || replayMode;

  downButton.disabled = busy || idx <= 0;
  upButton.disabled = busy || idx >= levels.length - 1;
}

function mountHudDevControls() {
  const devRow = betUi.elements.testControls;
  if (!hudDevActions || !devRow) return;
  hudDevActions.appendChild(devRow);
}

function syncDevToolbar() {
  const show = isDevMode() && !replayMode;
  devToolbar?.sync({
    visible: show,
    disabled: spinning || isAutoplaying() || isBoardPresenting(),
    replayReady: Boolean(lastReplayUrl),
    spinId: lastReplayEventId,
    socialCasino: game?.copy?.socialCasino ?? false,
  });
}

function applySocialModeRefresh() {
  game.syncCopy();
  syncHud();
  mobileBetUi?.sync();
  desktopBetUi?.sync();
  refreshWinStatLabel();
  gameMenu.refresh();
  syncDevToolbar();
}

function seedInitialBoard() {
  if (!slotBoard) return;
  idleBoardSeed ??= randomIdleBoard();
  slotBoard.setBoard(idleBoardSeed);
}

function resetFeaturePresentation() {
  featureChrome?.reset();
  slotBoard?.setClusterOutlineBonusMode(false);
  void characterUi?.setBonusMode(false, { animate: false });
  void gameBackground?.setBonusMode(false, { animate: false });
  backgroundMusic.setBonusMode(false, { animate: false });
}

/** True once any free-spin gameReveal has been reached (intro finished). */
function freeSpinsHaveStarted(events) {
  return events.some((event) => event.type === 'gameReveal' && event.freeSpin != null);
}

/** Sum feature cluster-win HUD amounts already reported in completed events. */
function featureWinTotalFromCompleted(completed, round) {
  if (!round || !completed?.length) return 0;
  const enterBonusIndex =
    sortedBookEvents(round).find((event) => event.type === 'enterBonus')?.index ?? Infinity;
  let total = 0;
  for (const event of completed) {
    if (event.index <= enterBonusIndex || event.type !== 'clusterWin') continue;
    for (const amount of clusterHudWinAmounts(event)) {
      total += amount;
    }
  }
  return total;
}

function restoreFeatureWinDisplay(completed, round) {
  const total = featureWinTotalFromCompleted(completed, round);
  if (total > 0.0005) {
    finalizeWinDisplay(total);
  } else {
    hideWinDisplay({ immediate: true });
  }
  refreshWinStatLabel();
}

async function restoreFeatureFromCompleted(completed, round = null) {
  if (!featureChrome) return;
  const bookEvents = round ? sortedBookEvents(round) : [];
  const enterBonus = bookEvents.find((event) => event.type === 'enterBonus');
  const completedEvents = [...(completed ?? [])].sort((a, b) => a.index - b.index);
  if (
    enterBonus &&
    isFeatureRoundActive(round, completedEvents) &&
    !completedEvents.some((event) => event.type === 'enterBonus')
  ) {
    await presentFeatureEvent(enterBonus, { animate: false });
  }
  for (const event of completedEvents) {
    if (event.type === 'enterBonus' || event.type === 'updateFreeSpin' || event.type === 'freeSpinEnd') {
      await presentFeatureEvent(event, { animate: false });
    }
  }
}

async function showStaticRound(round, completed = null) {
  if (!slotBoard) return;
  const events = completed ?? sortedBookEvents(round);
  const board = boardForResumeSnapshot(round, events);
  if (isFeatureRoundActive(round, events)) {
    await restoreFeatureFromCompleted(events, round);
    restoreFeatureWinDisplay(events, round);
    if (freeSpinsHaveStarted(events)) {
      await Promise.all([
        characterUi?.setBonusMode(true, { animate: false }),
        gameBackground?.setBonusMode(true, { animate: false }),
      ]);
      backgroundMusic.setBonusMode(true, { animate: false });
      slotBoard.setClusterOutlineBonusMode(true);
    }
  } else {
    resetFeaturePresentation();
  }
  multiplierPanel.clearLedger();
  slotBoard.resetCascadeLadder();
  slotBoard.setBoard(board);
}

async function animateReveal(board) {
  if (!slotBoard) return;
  await animateSlotSpin(slotBoard, board, {
    speed: animationSpeed,
    onMotionStart: () => reelSpinAudio.start(unlockGameAudio),
  });
}

async function presentGameReveal(event, { animate = true, round = null } = {}) {
  if (!slotBoard) return;

  await multiplierPanel.fadeOutLedger();
  slotBoard.resetCascadeLadder();

  const blobPlan =
    animate && round ? planRoundBlobPresentation(event.board, round, event) : null;
  const revealBoard = blobPlan?.visualBoard ?? event.board;

  if (event.freeSpin != null && featureChrome?.isActive()) {
    featureChrome.onFreeSpinStart({
      current: event.freeSpin,
      animate,
    });
    if (event.freeSpin === 1) {
      await Promise.all([
        characterUi?.setBonusMode(true, { animate }),
        gameBackground?.setBonusMode(true, { animate }),
      ]);
      backgroundMusic.setBonusMode(true, { animate });
      slotBoard.setClusterOutlineBonusMode(true);
    }
  }

  if (animate) {
    await animateReveal(revealBoard);
    if (blobPlan) {
      slotBoard.syncBookColumnData(event.board);
      await presentBlobAfterReveal(slotBoard, event.board, blobPlan, {
        speed: animationSpeed,
        blobDissolve: greenSquareSfx,
      });
    }
  } else {
    slotBoard.setBoard(event.board);
  }
}

async function presentBookEvent(event, { animate = true, round = null } = {}) {
  if (!slotBoard) return;

  if (event.type === 'gameReveal') {
    await presentGameReveal(event, { animate, round });
    return;
  }

  if (event.type === 'clusterWin') {
    const winCells = winCellsFromClusters(event.clusters);
    const cascadeMultiplier = event.cascadeMultiplier ?? 1;
    pendingClusterRemoved = event.removed ?? [];
    const clusterAmounts = clusterHudWinAmounts(event);
    for (let i = 0; i < (event.clusters ?? []).length; i += 1) {
      const cluster = event.clusters[i];
      const popup = buildClusterWinPopup(cluster, cascadeMultiplier, clusterAmounts[i] ?? null);
      multiplierPanel.addLedgerEntry(cluster, cascadeMultiplier, popup?.amount ?? '');
    }
    if (animate) {
      const clusterPresentations = (event.clusters ?? []).map((cluster, index) => ({
        winCells: winCellsFromClusters([cluster]),
        winPopup: buildClusterWinPopup(cluster, cascadeMultiplier, clusterAmounts[index] ?? null),
      }));
      const hudPromise = runClusterWinIncrements(clusterAmounts, {
        delayMs: clusterHudWinDelayMs({
          firstCascade: event.cascade === 1,
          speed: animationSpeed,
        }),
      });
      await slotBoard.animateClusterWin(winCells, {
        speed: animationSpeed,
        clusterPresentations,
        firstCascade: event.cascade === 1,
        cascadeStep: event.cascade ?? cascadeMultiplier,
        cascadeMultiplier,
        blobCoverAudio: greenSquareSfx,
      });
      await hudPromise;
      gameAudio.playSfx('win');
    } else {
      slotBoard.setCascadeLadderStep(cascadeMultiplier);
      slotBoard.setBoard(slotBoard.getBoard(), { winCells });
      for (const amount of clusterAmounts) {
        winForDisplay += amount;
      }
      if (winForDisplay > 0.0005) {
        lastWinPayout = winForDisplay;
        winUiVisible = true;
        updateWinUi();
      }
    }
    return;
  }

  if (event.type === 'tumble') {
    if (animate) {
      const removed = pendingClusterRemoved?.length
        ? pendingClusterRemoved
        : (event.removed ?? []);
      await slotBoard.animateTumble(event.board, {
        fills: event.fills ?? [],
        removed,
        speed: animationSpeed,
      });
    } else {
      slotBoard.setBoard(event.board);
    }
    pendingClusterRemoved = null;
    return;
  }
}

async function presentFeatureEvent(event, { animate = true } = {}) {
  if (!featureChrome) return;

  if (event.type === 'enterBonus') {
    await featureChrome.onEnterBonus(event, { animate });
    refreshWinStatLabel();
    return;
  }
  if (event.type === 'updateFreeSpin') {
    await featureChrome.onUpdateFreeSpin(event, { animate });
    refreshWinStatLabel();
    return;
  }
  if (event.type === 'freeSpinEnd') {
    await featureChrome.onFreeSpinEnd(event, {
      animate,
      socialCasino: game.copy.socialCasino,
      formatBookWin: (amountCentiMult) => fmtWin(bookCentiMultToDisplayWin(amountCentiMult, bet)),
    });
    await Promise.all([
      characterUi?.setBonusMode(false, { animate }),
      gameBackground?.setBonusMode(false, { animate }),
    ]);
    backgroundMusic.setBonusMode(false, { animate });
    slotBoard?.setClusterOutlineBonusMode(false);
    refreshWinStatLabel();
  }
}

async function playBookPresentation(round, { animate = true } = {}) {
  for (const event of sortedBookEvents(round)) {
    if (event.type === 'finalWin' || event.type === 'setTotalWin') continue;
    if (event.type === 'enterBonus' || event.type === 'updateFreeSpin' || event.type === 'freeSpinEnd') {
      await presentFeatureEvent(event, { animate });
      continue;
    }
    await presentBookEvent(event, { animate, round });
  }
}

function buildHandReplayUrl({ event, amountApi, mode, lang }) {
  const url = new URL(
    buildReplayUrl({
      event,
      amountApi,
      mode,
      lang,
    }),
  );
  const current = new URLSearchParams(window.location.search);
  if (current.get('dev') === 'true') {
    url.searchParams.set('dev', 'true');
  }
  return url.toString();
}

function syncDevButtons() {
  if (replayMode || !isDevMode()) return;

  const { autoplay, newSession, copyReplay } = betUi.elements;

  if (autoplay) {
    autoplay.hidden = false;
    autoplay.textContent = 'Auto';
    autoplay.title = 'Autoplay 100 spins';
  }

  if (newSession) {
    newSession.hidden = false;
    newSession.textContent = 'New';
    newSession.title = 'Start a new session';
  }

  if (copyReplay) {
    copyReplay.hidden = false;
    copyReplay.textContent = 'Copy';
    copyReplay.title = lastReplayUrl
      ? 'Copy a replay URL for the last completed hand'
      : 'Play a hand first — then copy its replay URL';
  }
}

/** Dev row is pool-only tooling — visible strictly with ?dev=true. */
function syncDevControlsVisibility() {
  const show = isDevMode() && !replayMode;
  if (hudDevActions) {
    hudDevActions.hidden = !show;
  }
  if (betUi.elements.testControls) {
    betUi.elements.testControls.hidden = !show;
  }
  syncDevToolbar();
  if (show) syncDevButtons();
}

function setLastReplayUrl(url, eventId = '') {
  lastReplayUrl = url || '';
  lastReplayEventId = eventId || (url ? new URL(url).searchParams.get('event') || '' : '');
  betUi.setLastReplayUrl(lastReplayUrl);
  syncDevButtons();
  syncControls();
}

function syncControls() {
  betUi.sync();
  betStepper?.sync();
  mobileBetUi?.sync();
  desktopBetUi?.sync();
  updateWinUi();
  syncPlayAffordBlocker();
  syncDevToolbar();
  if (!canPickBet()) {
    betPicker.closeIfOpen();
  }
}

function isBoardPresenting() {
  return slotBoard?.isPresenting?.() ?? false;
}

function flushRoundSettledUI() {
  if (!pendingRoundSettled) return;
  const { round, result } = pendingRoundSettled;
  pendingRoundSettled = null;

  const payout = apiToDisplay(result.payoutApi);
  finalizeWinDisplay(payout);
  const debitDisplay = apiToDisplay(round.amount);
  session = ensureSession(session);
  recordPlay(session, { payout, multiplier: result.multiplier });
  saveSession(session);
  syncHud();

  const replayEvent = result.replayEvent || `${getSessionID()}-${round.roundID}`;
  lastReplayUrl = buildHandReplayUrl({
    event: replayEvent,
    amountApi: round.amount,
    mode: game.betModes.replayModeKey(),
    lang: game.copy.lang,
  });
  setLastReplayUrl(lastReplayUrl, replayEvent);

  const summary = describeRoundResult(round);

  recentResults.push({
    data: {
      summary,
      multiplier: result.multiplier,
      payout,
    },
  });

  devStatsOverlay.recordRound({
    wager: debitDisplay,
    payout,
    multiplier: result.multiplier,
  });

  if (result.multiplier > 0) {
    gameAudio.playSfx('win');
  } else if (payout < debitDisplay) {
    gameAudio.playSfx('lose');
  }
}

async function finishPresentation() {
  if (slotBoard?.waitUntilIdle) {
    await slotBoard.waitUntilIdle();
  }
  // Ladder crossfade is cosmetic — run in background so quick re-spins are not gated.
  if (slotBoard?.fadeOutCascadeLadder) {
    void slotBoard.fadeOutCascadeLadder({ speed: animationSpeed });
  }
  flushRoundSettledUI();
  syncControls();
}

async function withSpinLock(fn, { resetFeature = false, preserveWinDisplay = false } = {}) {
  spinning = true;
  animationSpeed = 1;
  prepareWinForSpin({ preserveDisplay: preserveWinDisplay });
  if (resetFeature) resetFeaturePresentation();
  refreshWinStatLabel();
  slotBoard?.pulseCabinet();
  spinClickAudio.play(unlockGameAudio);
  syncControls();
  try {
    return await fn();
  } finally {
    await finishPresentation();
    spinning = false;
    animationSpeed = 1;
    syncControls();
  }
}

let game;
game = createGameBootstrap({
  suki: {
    gameId: GAME.id,
    replayVersion: GAME.replayVersion,
    sessionStorageKey: 'basicSlotPool.rgsSessionID',
  },
  shell: {
    elements: {
      testControls: betUi.elements.testControls,
      copyReplay: betUi.elements.copyReplay,
      autoplay: betUi.elements.autoplay,
      newSession: betUi.elements.newSession,
      sessionTimer: sessionTimerEl,
      sessionTimerContainer: sessionTimerStat,
      balanceLabel: balanceLabelEl,
      replayNote: replayNoteEl,
      dropButton: betUi.elements.dropButton,
    },
    screenPreview: {
      root: shellEl,
      onScreenChange: () => {
        requestAnimationFrame(() => {
          betUiVariant?.refresh();
        });
      },
    },
  },
  lifecycle: {
    handlers: {
      gameReveal: async (event, ctx) => {
        await presentBookEvent(event, { animate: ctx.animate, round: ctx.round });
      },
      clusterWin: async (event, { animate }) => {
        await presentBookEvent(event, { animate });
      },
      tumble: async (event, { animate }) => {
        await presentBookEvent(event, { animate });
      },
      enterBonus: async (event, { animate }) => {
        await presentFeatureEvent(event, { animate });
      },
      updateFreeSpin: async (event, { animate }) => {
        await presentFeatureEvent(event, { animate });
      },
      freeSpinEnd: async (event, { animate }) => {
        await presentFeatureEvent(event, { animate });
      },
      setTotalWin: async (event, { animate }) => {
        await presentBookEvent(event, { animate });
      },
      finalWin: async () => {},
    },
    onResumeStatic: async (round, completed) => {
      skipNextSeedBoard = true;
      resumedActiveRound = true;
      activeRoundPending = Boolean(round?.active);
      await showStaticRound(round, completed);
    },
    onStaticRound: async (round) => {
      await showStaticRound(round);
    },
    applyBalance: (balanceObj) => {
      balance = apiToDisplay(balanceObj.amount);
      syncHud();
    },
    buildSettledResult: buildGameSettledResult,
    playingMessage: 'Spinning…',
    onRoundSettled: (round, result) => {
      activeRoundPending = false;
      pendingRoundSettled = { round, result };
    },
    setMessage,
    getBetApi: () => displayToApi(bet),
    setBetFromApi: () => {
      // Bet is player-controlled via the stepper. Lifecycle sync from round.amount
      // can clamp unrelated API values onto the highest tier (e.g. $10). Resume and
      // active-round overrides are applied in auth.onConfigured instead.
    },
  },
  auth: {
    defaultBetDisplay: DEFAULT_BET,
    gameModes: GAME_MODES,
    copyOverrides: {
      setBetPrompt: 'Press Spin to play.',
    },
    onConfigured(auth) {
      if (auth.balanceDisplay != null) {
        balance = auth.balanceDisplay;
        balanceForDisplay = balance;
      }
      const prevBet = bet;
      applyAuthBetConfig(auth, {
        betUi,
        getBet: () => bet,
        setBet: (value) => { bet = value; },
        getBetOptions: () => betOptions,
        setBetOptions: (levels) => { betOptions = levels; },
      });
      // Keep stepper selection across background re-auth; active-round resume still wins.
      if (!auth.usesActiveRoundBet && betOptions.includes(prevBet)) {
        bet = prevBet;
        betUi.renderBetLevels();
      } else {
        bet = snapBetToLevel(bet);
      }
      syncControls();
      autoplayPanelPolicy?.sync();
    },
  },
  ui: {
    setMessage,
    syncHud,
    onBalanceRefresh: () => {
      if (document.visibilityState === 'visible' && balanceAnimRaf == null) {
        syncControls();
      }
    },
    isBusy: () => spinning || isAutoplaying() || isBoardPresenting(),
    onRgsReady: () => syncControls(),
    onReady: () => {
      if (!skipNextSeedBoard) seedInitialBoard();
      const wasResumed = resumedActiveRound;
      skipNextSeedBoard = false;
      resumedActiveRound = false;
      balanceForDisplay = balance;
      syncHud({ immediate: true });
      if (!wasResumed) {
        setMessage(copyTerm('setBetPrompt'));
      }
    },
    onAuthRound: handleAuthRoundOutcome,
    onSyncDevTools: () => {
      syncDevControlsVisibility();
    },
  },
  onJurisdictionChange: () => {
    disableTurboForGame(game?.jurisdiction);
    autoplayPanelPolicy?.sync();
    gameMenu.refresh();
    syncControls();
    syncHud();
  },
  replay: { start: bootstrapReplay },
});

const { controls, lifecycle, applyAuthConfig, syncDevTools } = game;

devToolbar = createDevToolbar({
  shellEl,
  onFeature: () => {
    playDevFeatureSample();
  },
  onReplay: () => {
    onCopyReplayLink();
  },
  getSocialCasino: () => game.copy.socialCasino,
  getJurisdictionState: () => game.jurisdiction.state,
  onSocialCasinoChange: () => {
    applySocialModeRefresh();
  },
});
syncDevToolbar();

autoplayPanelPolicy = createAutoplayPanelPolicy({
  getCanAutoplay: () => controls.canAutoplay,
  getReplayMode: () => replayMode,
});
autoplayPanelPolicy.sync();

autoplaySession = createAutoplayController({
  canStart: () => !spinning
    && !autoplaySession?.active
    && controls.canAutoplay
    && game.rgsReady
    && balance >= playCostDisplay(),
  prepareStart: async () => {
    slotBoard?.cancelPresentation?.();
    if (slotBoard?.waitUntilIdle) {
      await slotBoard.waitUntilIdle();
    }
  },
  runSpin: async () => {
    await withSpinLock(async () => {
      activeRoundPending = true;
      await lifecycle.executeDrop({ animate: true });
    }, { resetFeature: true });
  },
  getPlayCost: playCostDisplay,
  getBalance: () => balance,
  onDebit: (cost) => {
    balance = Math.max(0, balance - cost);
    syncHud();
  },
  onSync: () => syncControls(),
  setMessage,
  t: (key, vars) => copyTerm(key, vars),
});

async function syncActiveRoundFromAuth() {
  const data = await authenticate();
  applyAuthConfig(data);
  return data;
}

async function forceEndActiveRound() {
  const endRes = await endRound();
  if (endRes.balance?.amount != null) {
    balance = apiToDisplay(endRes.balance.amount);
    syncHud();
  }
  activeRoundPending = false;
  resetFeaturePresentation();
}

/** Close any still-open RGS round after presentation-only resume gaps. */
async function ensureActiveRoundClosed() {
  const data = await syncActiveRoundFromAuth();
  if (!data.round?.active || !data.round.state?.length) {
    activeRoundPending = false;
    return data;
  }
  await forceEndActiveRound();
  return syncActiveRoundFromAuth();
}

async function resumeOpenRoundFromAuth(data) {
  skipNextSeedBoard = true;
  await lifecycle.resumeRound(data.round, {
    meta: { lastEvent: data.meta?.lastEvent },
    lastEvent: data.meta?.lastEvent ?? null,
  });
  await ensureActiveRoundClosed();
}

async function resumeActiveRoundFromAuth(authOutcome) {
  if (!authOutcome?.deferred || !activeRoundPending) return;
  await withSpinLock(async () => {
    if (!activeRoundPending) return;
    try {
      const data = await syncActiveRoundFromAuth();
      if (!data.round?.active || !data.round.state?.length) {
        activeRoundPending = false;
        return;
      }
      await resumeOpenRoundFromAuth(data);
    } catch (err) {
      console.error(err);
      const policy = classifyRgsError(String(err.message));
      setMessage(policy.message);
      try {
        await ensureActiveRoundClosed();
      } catch (settleErr) {
        console.error(settleErr);
      }
    }
  }, { resetFeature: false, preserveWinDisplay: true });
}

function onStakeScreenInferred() {
  betUiVariant?.refresh();
  slotBoard?.resize?.();
}

function resyncBetChromeLayout() {
  game.stakeLayout?.refresh();
  onStakeScreenInferred();
  syncControls();
}

attachBetChromeResync({
  onResync: resyncBetChromeLayout,
  onVisible: () => {
    void backgroundMusic.sync();
    resumeGameSfxContext(audioPrefs);
  },
});

patchStakeLayoutForProduction(shellEl, game.stakeLayout, onStakeScreenInferred);

disableTurboForGame(game.jurisdiction);

modalHost.bind({ game });
gameMenu.bind({ game });
registerGameModals({
  modalHost,
  recentResults,
  game,
  formatCurrency: (amount) => game.formatCurrency(amount),
  formatWin: (amount) => game.formatWin(amount),
});

const betPicker = createBetPicker({
  modalHost,
  getTitle: () => copyTerm('betAmount'),
  getLevels: () => betOptions,
  getCurrentBet: () => bet,
  setBet: (level) => {
    bet = level;
    betUi.renderBetLevels();
    syncHud();
    syncControls();
  },
  formatLevelAmount: (level) => fmtBalance(playCostForBet(level)),
  getCanOpen: canPickBet,
});

const buyBonusConfirm = registerBuyBonusConfirm(modalHost, {
  t: copyTerm,
  getBuyCost: buyCostDisplay,
  getBaseBet: () => bet,
  getCostMultiplier: () => BUY_MODE_COST,
  formatCurrency: (amount) => game.formatCurrency(amount),
  getCanConfirm: () => canBuyBonus(),
  onConfirm: () => executeBuyBonus(),
});

function clearPopupPositionStyles(popup) {
  if (!popup) return;
  for (const prop of ['position', 'top', 'left', 'right', 'bottom', 'width', 'maxWidth', 'maxHeight', 'zIndex']) {
    popup.style[prop] = '';
  }
}

function resetGameMenuAnchorStyles() {
  const { wrap, popup } = gameMenu.elements;
  if (!wrap || !popup) return;
  if (shellEl && popup.parentNode === shellEl) {
    wrap.appendChild(popup);
  }
  clearPopupPositionStyles(popup);
  wrap.style.position = '';
  wrap.style.top = '';
  wrap.style.left = '';
  wrap.style.right = '';
  wrap.style.bottom = '';
}

function chromeHeightCssVar() {
  const variant = shellEl?.dataset.betUiVariant;
  if (variant === BET_UI_VARIANT.MOBILE) return '--bet-ui-mobile-chrome-height';
  if (variant === BET_UI_VARIANT.DESKTOP) return '--bet-ui-desktop-chrome-height';
  return null;
}

function chromeInsetPx(property, shellWidth) {
  if (!shellEl) return 8;
  const raw = getComputedStyle(shellEl).getPropertyValue(property).trim();
  if (!raw) return 8;
  if (raw.endsWith('%')) {
    return Math.round(shellWidth * (parseFloat(raw) / 100));
  }
  return Math.round(parseFloat(raw)) || 8;
}

function positionGameMenuForChrome() {
  const cssVar = chromeHeightCssVar();
  if (!cssVar || !gameMenu.isOpen()) return;

  const { popup } = gameMenu.elements;
  if (!popup || !shellEl) return;

  const gap = 8;
  const shellRect = shellEl.getBoundingClientRect();
  const isDesktop = shellEl?.dataset.betUiVariant === BET_UI_VARIANT.DESKTOP;
  const leftPad = isDesktop
    ? chromeInsetPx('--bet-ui-desktop-inset-inline-start', shellRect.width)
    : 8;
  const rightPad = isDesktop
    ? chromeInsetPx('--bet-ui-desktop-inset-inline-end', shellRect.width)
    : 8;
  const chromeHeight = parseFloat(getComputedStyle(shellEl).getPropertyValue(cssVar)) || 0;
  const isPopoutS = shellEl?.dataset.sukiScreen === 'popout-s';
  const widthCap = isPopoutS ? 360 : 264;
  const minWidth = isPopoutS ? 180 : 120;
  const maxWidth = Math.min(widthCap, Math.max(minWidth, shellRect.width - leftPad - rightPad));
  const maxHeight = Math.floor(
    Math.max(isPopoutS ? 96 : 120, shellRect.height - chromeHeight - gap - (isPopoutS ? gap : leftPad)),
  );

  if (popup.parentNode !== shellEl) {
    shellEl.appendChild(popup);
  }

  popup.style.position = 'absolute';
  popup.style.left = `${leftPad}px`;
  popup.style.right = 'auto';
  popup.style.top = 'auto';
  popup.style.bottom = `${chromeHeight + gap}px`;
  popup.style.width = `${Math.round(maxWidth)}px`;
  popup.style.maxWidth = `${Math.round(maxWidth)}px`;
  popup.style.maxHeight = `${maxHeight}px`;
  popup.style.zIndex = '9055';
}

function queueGameMenuPosition() {
  requestAnimationFrame(() => {
    positionGameMenuForChrome();
    requestAnimationFrame(() => positionGameMenuForChrome());
  });
}

function closeGameMenu() {
  gameMenu.close();
  resetGameMenuAnchorStyles();
}

function openGameMenu() {
  if (gameMenu.isOpen()) {
    closeGameMenu();
    return;
  }
  gameMenu.refresh();
  gameMenu.setOpen(true);
  if (shellEl?.dataset.betUiVariant === BET_UI_VARIANT.MOBILE
    || shellEl?.dataset.betUiVariant === BET_UI_VARIANT.DESKTOP) {
    queueGameMenuPosition();
  }
}

window.addEventListener('resize', () => queueGameMenuPosition());

betUi.bind({
  game,
  replayMode,
  getBet: () => bet,
  setBet: (value) => {
    bet = value;
  },
  getBetOptions: () => betOptions,
  setBetOptions: (levels) => {
    betOptions = levels;
  },
  getBusy: () => spinning || isAutoplaying() || isBoardPresenting(),
  getPlaying: () => spinning || isBoardPresenting(),
  getAutoplaying: () => isAutoplaying(),
  getPlayLabel: playButtonLabel,
  getPlayCost: playCostDisplay,
  getBalance: () => balance,
  onBetChange: () => {
    syncHud();
    syncControls();
  },
  onDismissOverlays: () => {
    closeGameMenu();
    modalHost.close();
  },
  modalHost,
  getCopyTerm: copyTerm,
  formatCurrency: (amount) => game.formatCurrency(amount),
  onPlay: onSpin,
  onTurbo: () => {},
  onAutoplay: runAutoplay,
  onNewSession: onNewSession,
  onCopyReplay: onCopyReplayLink,
  onReplayAgain: () => {
    if (replayRound && !spinning) playReplayAnimation(replayRound);
  },
});

registerAutoplayConfirm(modalHost, {
  getPlayCost: playCostDisplay,
  getBalance: () => balance,
  onConfirm: runAutoplay,
  shell: shellEl,
});

betStepper = mountBetStepper(betUi.elements.dropButton, {
  onStepDown: () => stepBet(-1),
  onStepUp: () => stepBet(1),
  syncState: syncBetStepperState,
});
ensurePlayHitWrap();

const betChromeHandlers = {
  onMenu: () => openGameMenu(),
  onAuto: () => {
    if (isAutoplaying()) {
      stopAutoplay();
      return;
    }
    if (betUi.elements.autoplay) {
      betUi.elements.autoplay.click();
      return;
    }
    runAutoplay(100);
  },
  onStepUp: () => stepBet(1),
  onStepDown: () => stepBet(-1),
  getBalance: () => (replayMode ? '—' : fmtBalance(balanceForDisplay)),
  getBet: () => fmtBalance(baseBetDisplay()),
  getBetLabel: () => copyTerm('bet'),
  getWinLabel: winStatLabel,
  getBusy: () => spinning || isAutoplaying() || isBoardPresenting() || !game.rgsReady || replayMode,
  getCanPickBet: canPickBet,
  onBetPick: () => {
    closeGameMenu();
    betPicker.open();
  },
  getAutoplayActive: () => isAutoplaying(),
  getAutoplayStopPending: () => autoplaySession?.stopRequested ?? false,
  getAutoplayStopLabel: () => autoplaySession?.stopLabel ?? 'Stopping…',
  getAutoplayProgress: () => autoplaySession?.progress ?? { current: 0, total: 0 },
  getAutoEnabled: () => controls.canAutoplay && game.rgsReady && balance >= playCostDisplay(),
  getAutoVisible: () => autoplayPanelPolicy?.isPanelVisible({
    autoplaying: isAutoplaying(),
    replayMode,
  }) ?? true,
  onBuy: () => onBuyBonus(),
  getBuyEnabled: () => canBuyBonus(),
  getBuyLabel: () => buyButtonLabel(),
  getSocialCasino: () => game.copy.socialCasino,
  syncStepper: syncBetStepperState,
};

mobileBetUi = mountMobileBetUi({
  root: betUiRootEl,
  shell: shellEl,
  playButton: betUi.elements.dropButton,
  playRow: betStepper.row,
  handlers: betChromeHandlers,
});

desktopBetUi = mountDesktopBetUi({
  root: betUiRootEl,
  shell: shellEl,
  playButton: betUi.elements.dropButton,
  playRow: betStepper.row,
  handlers: betChromeHandlers,
});

updateWinUi();

betUiVariant = initBetUiVariant({
  shell: shellEl,
  betUiRoot: betUiRootEl,
  onChange: (variant) => {
    closeGameMenu();
    if (variant === BET_UI_VARIANT.MOBILE) {
      desktopBetUi?.setActive(false);
      mobileBetUi?.setActive(true);
    } else {
      mobileBetUi?.setActive(false);
      desktopBetUi?.setActive(true);
    }
    if (replayMode) {
      syncReplayBetChrome(true);
    }
    syncControls();
  },
  onLayoutRefresh: () => {
    syncControls();
    queueGameMenuPosition();
  },
});

characterUi = initCharacter({
  host: document.getElementById('character-host'),
  shell: shellEl,
});

gameBackground = initGameBackground({
  host: document.querySelector('.suki-bg-landscape'),
  shell: shellEl,
});

async function onBuyBonus() {
  if (spinning || isAutoplaying() || replayMode) return;
  if (!game.rgsReady) {
    setMessage(copyTerm('connectingRgs'));
    return;
  }
  const buyCost = buyCostDisplay();
  if (balance < buyCost) {
    showInsufficientBalance();
    return;
  }
  if (!canBuyBonus()) return;
  closeGameMenu();
  buyBonusConfirm.open();
}

async function executeBuyBonus() {
  await withSpinLock(async () => {
    try {
      const baseBetApi = displayToApi(bet);
      // Stake RGS debits base bet × mode cost — send base only (cost 20 comes from math index).
      const playRes = await play({ amountApi: baseBetApi, mode: 'BB' });
      if (playRes.balance?.amount != null) {
        balance = apiToDisplay(playRes.balance.amount);
        syncHud();
      }
      activeRoundPending = true;
      await lifecycle.completeRound(playRes.round, { animate: true });
    } catch (err) {
      console.error(err);
      const policy = classifyRgsError(String(err.message));
      setMessage(policy.message);
      if (String(err.message) === 'ERR_IPB') {
        showPlayerNotice(policy.message);
      }
    }
  }, { resetFeature: true });
}

async function onSpin() {
  if (spinning || isAutoplaying()) return;
  if (!game.rgsReady) {
    setMessage(copyTerm('connectingRgs'));
    return;
  }
  const playCost = playCostDisplay();
  if (balance < playCost) {
    showInsufficientBalance();
    return;
  }

  const resumeActiveRound = activeRoundPending;

  playSpinButtonSpin(ensurePlayHitWrap());

  await withSpinLock(async () => {
    try {
      const data = await syncActiveRoundFromAuth();
      if (data.round?.active && data.round.state?.length) {
        await resumeOpenRoundFromAuth(data);
        return;
      }
      activeRoundPending = false;
      await lifecycle.executeDrop({ animate: true });
    } catch (err) {
      console.error(err);
      const policy = classifyRgsError(String(err.message));
      if (policy.shouldResumeRound) {
        try {
          const data = await syncActiveRoundFromAuth();
          if (data.round?.active && data.round.state?.length) {
            await resumeOpenRoundFromAuth(data);
            return;
          }
        } catch (resumeErr) {
          console.error(resumeErr);
        }
      }
      setMessage(policy.message);
      if (String(err.message) === 'ERR_IPB') {
        showPlayerNotice(policy.message);
      }
    }
  }, { resetFeature: !resumeActiveRound, preserveWinDisplay: resumeActiveRound });
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/** Stake compliance — spacebar mirrors the play/bet button (incl. jurisdiction gate). */
window.addEventListener('keydown', (e) => {
  if (replayMode || !controls.canSpacebar) return;
  if (e.code !== 'Space' || e.repeat) return;
  if (isTypingTarget(e.target)) return;
  if (isAutoplaying() || !game.rgsReady) return;

  const playing = spinning || isBoardPresenting();
  const busy = spinning || isAutoplaying() || isBoardPresenting();

  if (playing && controls.canTurbo) {
    e.preventDefault();
    closeGameMenu();
    modalHost.close();
    return;
  }

  if (!busy) {
    e.preventDefault();
    closeGameMenu();
    modalHost.close();
    onSpin();
  }
});

function stopAutoplay() {
  autoplaySession?.stop();
}

async function runAutoplay(roundCount) {
  if (!game.rgsReady || balance < playCostDisplay()) return;
  try {
    await autoplaySession?.run(roundCount);
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message)));
  }
}

function setPlayModeUi() {
  replayBanner.hidden = true;
  betUi.setView('play');
  balanceHud.hidden = false;
  syncReplayBetChrome(false);
}

function syncReplayBetChrome(active = replayMode) {
  desktopBetUi?.setReplayChrome?.(active, { disclaimer: copyTerm('replayDisclaimer') });
  mobileBetUi?.setReplayChrome?.(active);
}

function applyReplayRoundBet(round) {
  const baseBetApi = game.betModes.baseBetApiFromPlayAmount(round.amount, round.mode);
  bet = snapBetToLevel(apiToDisplay(baseBetApi));
}

function replayModeLabelForRound(round) {
  const norm = String(round?.mode ?? '').trim().toUpperCase();
  const mode = game.betModes.modes.find((entry) => entry.rgsMode === norm)
    ?? game.betModes.getActiveMode();
  return modeButtonLabel(mode, copyTerm).toUpperCase();
}

function replayTotalWinLabel() {
  return game.copy.socialCasino ? 'Total Earn' : 'Total Win';
}

function replayStartButtonLabel(again) {
  if (again) {
    const label = copyTerm('replayAgain');
    return `▶ ${label.charAt(0).toUpperCase()}${label.slice(1)}`;
  }
  return '▶ Start Replay';
}

function buildReplayStartDetails(round, { again = false } = {}) {
  const baseBetApi = game.betModes.baseBetApiFromPlayAmount(round.amount, round.mode);
  const costMultiplier = Math.max(1, round.amount / Math.max(1, baseBetApi));
  const payoutMultiplier = roundPayoutMultiplier(round);
  return {
    badgeLabel: copyTerm('replayModeTitle'),
    modeLabel: replayModeLabelForRound(round),
    rowLabels: {
      mode: copyTerm('playModeLabel'),
      baseBet: copyTerm('baseBetLabel'),
      costMultiplier: copyTerm('costMultiplierLabel'),
      totalPlayCost: copyTerm('buyConfirmTotalLabel'),
      payoutMultiplier: copyTerm('payoutMultiplierLabel'),
      totalWin: replayTotalWinLabel(),
    },
    baseBet: fmtBalance(apiToDisplay(baseBetApi)),
    costMultiplier: replayStartModal.formatCostMultiplier(costMultiplier),
    totalBetCost: fmtBalance(apiToDisplay(round.amount)),
    payoutMultiplier: formatMult(payoutMultiplier),
    totalWin: fmtWin(apiToDisplay(round.payout ?? 0)),
    footnote: copyTerm('replayDisclaimer'),
    startLabel: replayStartButtonLabel(again),
  };
}

async function promptReplaySummary(round, { again = false } = {}) {
  hideWinDisplay({ immediate: true });
  await replayStartModal.open(buildReplayStartDetails(round, { again }));
}

async function runReplayLoop(round) {
  await promptReplaySummary(round, { again: false });
  for (;;) {
    setMessage(copyTerm('replayingRound'));
    await playReplayAnimation(round);
    setMessage('Replay complete.');
    await promptReplaySummary(round, { again: true });
  }
}

function setReplayModeUi() {
  replayBanner.hidden = false;
  if (replayNoteEl) {
    replayNoteEl.textContent = copyTerm('replayDisclaimer');
  }
  betUi.setView('replay');
  balanceHud.hidden = true;
  setLastReplayUrl('');
  syncReplayBetChrome(true);
}

async function playReplayAnimation(round) {
  resetFeaturePresentation();
  characterUi?.relayout?.();
  spinning = true;
  prepareWinForSpin();
  syncControls();
  try {
    await playBookPresentation(round, { animate: true });
    pendingRoundSettled = {
      round,
      result: {
        payoutApi: round.payout,
        multiplier: round.payoutMultiplier ?? 0,
        replayEvent: null,
      },
    };
  } finally {
    await finishPresentation();
    spinning = false;
    syncControls();
  }
}

async function bootstrapReplay() {
  setReplayModeUi();
  const params = getReplayParams();
  if (!params.event) {
    setMessage('Replay URL missing event parameter.');
    return;
  }
  setMessage(copyTerm('loadingReplay'));
  try {
    const data = await requestReplay({
      game: params.game,
      version: params.version,
      mode: params.mode,
      event: params.event,
      amountApi: params.amountApi,
    });
    replayRound = data.round;
    applyReplayRoundBet(replayRound);
    game.setRgsReady(true);
    syncControls();
    syncHud();
    await runReplayLoop(replayRound);
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message)));
  }
}

function handleAuthRoundOutcome(authOutcome) {
  if (authOutcome.status === 'resumed') {
    skipNextSeedBoard = true;
    resumedActiveRound = true;
    setMessage('Round resumed.');
    if (authOutcome.deferred) {
      pendingAuthResume = authOutcome;
    }
  } else if (authOutcome.status === 'completed' && authOutcome.result) {
    setMessage('Last completed round restored.');
  }
}

function onPreloaderContinue() {
  revealGameShell();
  unlockGameAudio();
  if (!pendingAuthResume) return;
  const authOutcome = pendingAuthResume;
  pendingAuthResume = null;
  void resumeActiveRoundFromAuth(authOutcome);
}

async function onNewSession() {
  startNewRgsSession();
  game.sessionTimer?.reset();
  devStatsOverlay.reset();
  session = resetSession();
  lastReplayUrl = '';
  lastReplayEventId = '';
  setLastReplayUrl('');
  setMessage('New session — reconnecting…');
  game.start();
}

async function onCopyReplayLink() {
  if (!lastReplayUrl) {
    setMessage('No completed hand yet — spin first, then copy the replay URL.');
    return;
  }
  try {
    await navigator.clipboard.writeText(lastReplayUrl);
    const params = new URL(lastReplayUrl).searchParams;
    const event = params.get('event') || 'hand';
    setMessage(`Replay URL copied (${event}). Open in a new tab to replay.`);
  } catch {
    setMessage(lastReplayUrl);
  }
}

async function playDevFeatureSample() {
  if (spinning || isAutoplaying() || replayMode || !slotBoard) return;

  await withSpinLock(async () => {
    activeRoundPending = true;
    const book = SAMPLE_FEATURE_BOOK;
    const amountApi = displayToApi(bet);
    const payoutMultiplier = book.payoutMultiplier / 100;
    const round = {
      roundID: `dev-feature-${Date.now()}`,
      amount: amountApi,
      payout: bookCentiMultToPayoutApi(book.payoutMultiplier, amountApi),
      payoutMultiplier,
      mode: 'BASE',
      state: book.events,
      active: false,
    };

    setMessage('Playing sample feature book…');
    await playBookPresentation(round, { animate: true });

    pendingRoundSettled = {
      round,
      result: {
        ...buildGameSettledResult(round),
        replayEvent: null,
        round,
      },
    };
  }, { resetFeature: true });
}

/** @param {import('./slot.js').ClusterHighlightEvent} event */
function onClusterHighlight(event) {
  clusterStepAudio.play(event.cascadeStep, unlockGameAudio);
}

async function initSlotStage() {
  applyInferredStakeScreen(shellEl, onStakeScreenInferred);
  slotBoard = await createSlotBoard(slotRoot);
  slotBoard.setPostSpinMotionAudio(startCascadeMotionAudio);
  slotBoard.setClusterHighlightAudio(onClusterHighlight);
  setLedgerSpineRegistry(await loadSpineSymbolRegistry());
  if (gameCoreEl && !featureChrome) {
    featureChrome = createFeatureChrome({
      stageEl: gameCoreEl,
    });
  }
}

async function startGame() {
  await initSlotStage();
  characterUi?.relayout?.();
  await game.start();
}

function revealGameShell() {
  shellEl?.classList.remove('suki-shell-booting');
  requestAnimationFrame(() => {
    characterUi?.relayout?.();
  });
}

function attachPreloaderCommitLabel() {
  const overlay = shellEl.querySelector('.suki-game-preloader');
  if (!overlay || overlay.querySelector('.game-preloader-commit')) return;

  const commitEl = document.createElement('span');
  commitEl.className = 'game-preloader-commit';
  commitEl.textContent = BUILD_COMMIT;
  commitEl.setAttribute('aria-hidden', 'true');
  overlay.appendChild(commitEl);
}

betUi.renderBetLevels();
mountHudDevControls();
balanceForDisplay = balance;
syncHud({ immediate: true });
syncDevControlsVisibility();
syncDevTools();
syncControls();

if (replayMode) {
  revealGameShell();
  setReplayModeUi();
  startGame();
  document.addEventListener('pointerdown', () => unlockGameAudio(), { once: true });
} else {
  setPlayModeUi();
  createGamePreloader({
    shell: shellEl,
    subtitle: GAME.title,
    hint: 'Tap anywhere to play',
    connectingHint: copyTerm('connectingRgs'),
    assets: buildPreloadAssets(),
    gate: () => game.checkRgsGate(),
    bootstrap: () => startGame(),
    onContinue: onPreloaderContinue,
  });
  attachPreloaderCommitLabel();
}
