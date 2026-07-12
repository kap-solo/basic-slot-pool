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
  requestReplay,
  startNewRgsSession,
} from '@kap-solo/suki-engine/client/rgs.js';
import { buildPreloadAssets, wireTemplateAudio } from './audio.js';
import { BET_OPTIONS, DEFAULT_BET, defaultIdleBoard, GAME, GAME_MODES } from './config.js';
import { BUILD_COMMIT } from './build-info.js';
import { winCellsFromClusters, basePayForSymbol, clusterBaseMultiplier } from './cluster.js';
import { mountBetStepper } from './betStepper.js';
import { BET_UI_VARIANT, initBetUiVariant } from './betUiVariant.js';
import { mountMobileBetUi } from './betUiMobile.js';
import { registerGameModals } from './menu.js';
import {
  buildGameSettledResult,
  finalBoardFromRound,
  sortedBookEvents,
} from './round.js';
import {
  animateSlotSpin,
  createSlotBoard,
  describeRoundResult,
} from './slot.js';
import { createDevStatsOverlay } from './devStatsOverlay.js';
import { createMultiplierPanel } from './multiplierPanel.js';
import { presentBlobAfterReveal, planRoundBlobPresentation } from './pixi/performanceBlob.js';
import { ensureSession, loadSession, recordPlay, resetSession, saveSession } from './session.js';

const shellEl = document.querySelector('.suki-stake-shell');
const brandEl = document.querySelector('.suki-brand');
const modalHost = createModalHost({ root: shellEl });
const audioPrefs = createAudioPrefs({ storageKey: `${GAME.id}.audio` });
const gameAudio = createGameAudio({ audioPrefs, autoUnlock: false });
wireTemplateAudio(gameAudio);
const recentResults = createRecentResultsStore({ max: 25 });
const gameMenu = createGameMenu({
  brand: brandEl,
  shell: shellEl,
  modalHost,
  audioPrefs,
});

const balanceEl = document.getElementById('balance');
const messageEl = document.getElementById('message');
const replayBanner = document.getElementById('replay-banner');
const balanceHud = document.getElementById('balance-hud');
const hudDevActions = document.getElementById('hud-dev-actions');
const sessionTimerStat = document.getElementById('session-timer-stat');
const sessionTimerEl = document.getElementById('session-timer');
const slotRoot = document.getElementById('slot-board');
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
let bet = DEFAULT_BET;
/** @type {number[]} */
let betOptions = [...BET_OPTIONS];
let spinning = false;
let autoplaying = false;
let autoplayStopRequested = false;
let autoplayTotalRounds = 0;
let autoplayCurrentRound = 0;
let animationSpeed = 1;
let lastWinDisplay = 0;
const replayMode = isReplayMode();

const devStatsOverlay = createDevStatsOverlay({
  hostEl: shellEl,
  targetRtpPercent: GAME.targetRtpPercent,
  enabled: isDevMode() && !replayMode,
});

/** @type {object | null} */
let replayRound = null;
let lastReplayUrl = '';
/** @type {[number, number][] | null} */
let pendingClusterRemoved = null;
/** @type {{ round: object, result: object } | null} */
let pendingRoundSettled = null;

/** @type {object | null} */
let session = loadSession();

function setMessage(text) {
  messageEl.textContent = text;
}

function fmtBalance(amount) {
  return game.formatCurrency(amount);
}

function fmtWin(amount) {
  return game.formatWin(amount);
}

/**
 * Board win popup for one cluster — ladder line when ×2+.
 * @param {{ symbol: string, size?: number, cells?: [number, number][], baseMultiplier?: number }} cluster
 * @param {number} cascadeMultiplier ladder index from the book (1 = no boost)
 * @returns {{ amount: string, amountFrom: number, amountTo: number, formatAmount: (value: number) => string, cascadeLabel: string | null } | null}
 */
function buildClusterWinPopup(cluster, cascadeMultiplier) {
  const size = cluster.size ?? cluster.cells?.length ?? 0;
  if (size < 1) return null;
  const baseMult = cluster.baseMultiplier ?? clusterBaseMultiplier(cluster.symbol, size);
  const clusterWin = bet * baseMult * cascadeMultiplier;
  if (clusterWin <= 0) return null;
  const amountFrom = bet * basePayForSymbol(cluster.symbol);
  return {
    amount: `+${fmtWin(clusterWin)}`,
    amountFrom,
    amountTo: clusterWin,
    formatAmount: (value) => `+${fmtBalance(value)}`,
    cascadeLabel: cascadeMultiplier > 1 ? `Cascade ×${cascadeMultiplier}` : null,
  };
}

function copyTerm(key, vars) {
  return game.copy.t(key, vars);
}

function playCostDisplay() {
  const baseApi = displayToApi(bet);
  const playApi = game.betModes.playAmountApi(baseApi);
  return apiToDisplay(playApi);
}

function playButtonLabel() {
  if (shellEl?.dataset.betUiVariant === BET_UI_VARIANT.MOBILE) {
    return '';
  }
  return `Bet ${fmtBalance(playCostDisplay())}`;
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
  if (spinning || autoplaying || isBoardPresenting() || replayMode || !game.rgsReady) return;

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

function syncBetStepperState({ downButton, upButton }) {
  const levels = [...betOptions].sort((a, b) => a - b);
  let idx = levels.indexOf(bet);
  if (idx < 0) {
    idx = levels.findIndex((level) => level >= bet);
    if (idx < 0) idx = levels.length - 1;
  }
  const busy = spinning || autoplaying || isBoardPresenting() || !game.rgsReady || replayMode;

  downButton.disabled = busy || idx <= 0;
  upButton.disabled = busy || idx >= levels.length - 1;
}

function mountHudDevControls() {
  const devRow = betUi.elements.testControls;
  if (!hudDevActions || !devRow) return;
  hudDevActions.appendChild(devRow);
}

function seedInitialBoard() {
  if (!slotBoard) return;
  slotBoard.setBoard(defaultIdleBoard());
}

function showStaticRound(round) {
  if (!slotBoard) return;
  multiplierPanel.clearLedger();
  slotBoard.resetCascadeLadder();
  slotBoard.setBoard(finalBoardFromRound(round));
}

async function animateReveal(board) {
  if (!slotBoard) return;
  await animateSlotSpin(slotBoard, board, { speed: animationSpeed });
}

async function presentGameReveal(event, { animate = true, round = null } = {}) {
  if (!slotBoard) return;

  await multiplierPanel.fadeOutLedger();
  slotBoard.resetCascadeLadder();

  const blobPlan = animate && round ? planRoundBlobPresentation(event.board, round) : null;
  const revealBoard = blobPlan?.visualBoard ?? event.board;

  if (animate) {
    await animateReveal(revealBoard);
    if (blobPlan) {
      slotBoard.syncBookColumnData(event.board);
      await presentBlobAfterReveal(slotBoard, event.board, blobPlan, {
        speed: animationSpeed,
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
    for (const cluster of event.clusters ?? []) {
      const popup = buildClusterWinPopup(cluster, cascadeMultiplier);
      multiplierPanel.addLedgerEntry(cluster, cascadeMultiplier, popup?.amount ?? '');
    }
    if (animate) {
      const clusterPresentations = (event.clusters ?? []).map((cluster) => ({
        winCells: winCellsFromClusters([cluster]),
        winPopup: buildClusterWinPopup(cluster, cascadeMultiplier),
      }));
      await slotBoard.animateClusterWin(winCells, {
        speed: animationSpeed,
        clusterPresentations,
        firstCascade: event.cascade === 1,
        cascadeMultiplier,
      });
      gameAudio.playSfx('win');
    } else {
      slotBoard.setCascadeLadderStep(cascadeMultiplier);
      slotBoard.setBoard(slotBoard.getBoard(), { winCells });
    }
    return;
  }

  if (event.type === 'tumble') {
    if (animate) {
      await slotBoard.animateTumble(event.board, {
        fills: event.fills ?? [],
        removed: pendingClusterRemoved ?? [],
        speed: animationSpeed,
      });
    } else {
      slotBoard.setBoard(event.board);
    }
    pendingClusterRemoved = null;
    return;
  }
}

async function playBookPresentation(round, { animate = true } = {}) {
  for (const event of sortedBookEvents(round)) {
    if (event.type === 'finalWin') continue;
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
  if (show) syncDevButtons();
}

function setLastReplayUrl(url) {
  lastReplayUrl = url || '';
  betUi.setLastReplayUrl(lastReplayUrl);
  syncDevButtons();
  syncControls();
}

function syncControls() {
  betUi.sync();
  betStepper?.sync();
  mobileBetUi?.sync();
}

function isBoardPresenting() {
  return slotBoard?.isPresenting?.() ?? false;
}

function flushRoundSettledUI() {
  if (!pendingRoundSettled) return;
  const { round, result } = pendingRoundSettled;
  pendingRoundSettled = null;

  const payout = apiToDisplay(result.payoutApi);
  lastWinDisplay = payout;
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
  setLastReplayUrl(lastReplayUrl);

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
  if (slotBoard?.fadeOutCascadeLadder) {
    await slotBoard.fadeOutCascadeLadder({ speed: animationSpeed });
  }
  flushRoundSettledUI();
  syncControls();
}

async function withSpinLock(fn) {
  spinning = true;
  animationSpeed = 1;
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

const game = createGameBootstrap({
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
      onScreenChange: () => betUiVariant?.refresh(),
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
      setTotalWin: async (event, { animate }) => {
        await presentBookEvent(event, { animate });
      },
      finalWin: async () => {},
    },
    onResumeStatic: (round) => {
      showStaticRound(round);
    },
    onStaticRound: (round) => {
      showStaticRound(round);
    },
    applyBalance: (balanceObj) => {
      balance = apiToDisplay(balanceObj.amount);
      syncHud();
    },
    buildSettledResult: buildGameSettledResult,
    playingMessage: 'Spinning…',
    onRoundSettled: (round, result) => {
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
    },
  },
  ui: {
    setMessage,
    syncHud,
    isBusy: () => spinning || autoplaying || isBoardPresenting(),
    onRgsReady: () => syncControls(),
    onReady: () => {
      seedInitialBoard();
      balanceForDisplay = balance;
      syncHud({ immediate: true });
      setMessage(copyTerm('setBetPrompt'));
    },
    onAuthRound: handleAuthRoundOutcome,
    onSyncDevTools: () => {
      syncDevControlsVisibility();
    },
  },
  onJurisdictionChange: () => {
    disableTurboForGame(game.jurisdiction);
    gameMenu.refresh();
    syncControls();
    syncHud();
  },
  replay: { start: bootstrapReplay },
});

const { controls, lifecycle, applyAuthConfig, syncDevTools } = game;

disableTurboForGame(game.jurisdiction);

gameMenu.bind({ game });
registerGameModals({
  modalHost,
  recentResults,
  game,
  formatCurrency: (amount) => game.formatCurrency(amount),
  formatWin: (amount) => game.formatWin(amount),
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

function positionGameMenuForMobile() {
  if (shellEl?.dataset.betUiVariant !== BET_UI_VARIANT.MOBILE || !gameMenu.isOpen()) return;

  const { popup } = gameMenu.elements;
  if (!popup || !shellEl) return;

  const pad = 8;
  const gap = 8;
  const shellRect = shellEl.getBoundingClientRect();
  const chromeHeight = parseFloat(
    getComputedStyle(shellEl).getPropertyValue('--bet-ui-mobile-chrome-height'),
  ) || 0;
  const maxWidth = Math.min(264, Math.max(120, shellRect.width - pad * 2));
  const maxHeight = Math.floor(Math.max(120, shellRect.height - chromeHeight - gap - pad * 2));

  if (popup.parentNode !== shellEl) {
    shellEl.appendChild(popup);
  }

  popup.style.position = 'absolute';
  popup.style.left = `${pad}px`;
  popup.style.right = 'auto';
  popup.style.top = 'auto';
  popup.style.bottom = `${chromeHeight + gap}px`;
  popup.style.width = `${Math.round(maxWidth)}px`;
  popup.style.maxWidth = `${Math.round(maxWidth)}px`;
  popup.style.maxHeight = `${maxHeight}px`;
  popup.style.zIndex = '9055';
}

function queueMobileGameMenuPosition() {
  requestAnimationFrame(() => {
    positionGameMenuForMobile();
    requestAnimationFrame(() => positionGameMenuForMobile());
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
  if (shellEl?.dataset.betUiVariant === BET_UI_VARIANT.MOBILE) {
    queueMobileGameMenuPosition();
  }
}

window.addEventListener('resize', () => queueMobileGameMenuPosition());

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
  getBusy: () => spinning || autoplaying || isBoardPresenting(),
  getPlaying: () => spinning || isBoardPresenting(),
  getAutoplaying: () => autoplaying,
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

betStepper = mountBetStepper(betUi.elements.dropButton, {
  onStepDown: () => stepBet(-1),
  onStepUp: () => stepBet(1),
  syncState: syncBetStepperState,
});

mobileBetUi = mountMobileBetUi({
  root: betUiRootEl,
  shell: shellEl,
  playButton: betUi.elements.dropButton,
  playRow: betStepper.row,
  handlers: {
    onMenu: () => openGameMenu(),
    onAuto: () => {
      if (autoplaying) {
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
    getBet: () => fmtBalance(playCostDisplay()),
    getWin: () => (replayMode ? '—' : fmtWin(lastWinDisplay)),
    getBusy: () => spinning || autoplaying || isBoardPresenting() || !game.rgsReady || replayMode,
    getAutoplayActive: () => autoplaying,
    getAutoplayProgress: () => ({
      current: autoplayCurrentRound,
      total: autoplayTotalRounds,
    }),
    getAutoEnabled: () => controls.canAutoplay && game.rgsReady && balance >= playCostDisplay(),
    syncStepper: syncBetStepperState,
  },
});

betUiVariant = initBetUiVariant({
  shell: shellEl,
  betUiRoot: betUiRootEl,
  onChange: (variant) => {
    closeGameMenu();
    mobileBetUi?.setActive(variant === BET_UI_VARIANT.MOBILE);
    syncControls();
  },
});

async function onSpin() {
  if (spinning || autoplaying) return;
  if (!game.rgsReady) {
    setMessage(copyTerm('connectingRgs'));
    return;
  }
  const playCost = playCostDisplay();
  if (balance < playCost) {
    setMessage(copyTerm('insufficientBalance'));
    return;
  }

  await withSpinLock(async () => {
    try {
      gameAudio.playSfx('play');
      await lifecycle.executeDrop({ animate: true });
    } catch (err) {
      console.error(err);
      const policy = classifyRgsError(String(err.message));
      if (policy.shouldResumeRound) {
        try {
          const data = await authenticate();
          applyAuthConfig(data);
          if (data.round?.active && data.round.state?.length) {
            await lifecycle.resumeRound(data.round, { meta: data.meta });
            return;
          }
        } catch (resumeErr) {
          console.error(resumeErr);
        }
      }
      setMessage(policy.message);
    }
  });
}

function stopAutoplay() {
  if (!autoplaying) return;
  autoplayStopRequested = true;
  slotBoard?.cancelPresentation?.();
  syncControls();
}

async function runAutoplay(roundCount) {
  if (spinning || autoplaying || !controls.canAutoplay) return;
  if (!game.rgsReady || balance < playCostDisplay()) return;

  autoplayStopRequested = false;
  autoplayTotalRounds = roundCount;
  autoplayCurrentRound = 0;

  slotBoard?.cancelPresentation?.();
  if (slotBoard?.waitUntilIdle) {
    await slotBoard.waitUntilIdle();
  }

  autoplaying = true;
  syncControls();
  try {
    for (let i = 0; i < roundCount; i += 1) {
      if (autoplayStopRequested) {
        setMessage(`${copyTerm('autoplayStopped')} ${autoplayCurrentRound} spins.`);
        break;
      }

      const playCost = playCostDisplay();
      if (balance < playCost) {
        setMessage(`${copyTerm('autoplayStopped')} ${autoplayCurrentRound} spins.`);
        break;
      }

      autoplayCurrentRound = i + 1;
      lastWinDisplay = 0;
      balance = Math.max(0, balance - playCost);
      syncHud();
      syncControls();

      await withSpinLock(async () => {
        gameAudio.playSfx('play');
        await lifecycle.executeDrop({ animate: true });
      });

      if (autoplayStopRequested) {
        setMessage(`${copyTerm('autoplayStopped')} ${autoplayCurrentRound} spins.`);
        break;
      }
    }
    if (autoplayCurrentRound === roundCount && !autoplayStopRequested) {
      setMessage(copyTerm('autoplayComplete', { count: roundCount }));
    }
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message)));
  } finally {
    autoplaying = false;
    autoplayStopRequested = false;
    autoplayTotalRounds = 0;
    autoplayCurrentRound = 0;
    syncControls();
  }
}

function setPlayModeUi() {
  replayBanner.hidden = true;
  betUi.setView('play');
  balanceHud.hidden = false;
}

function setReplayModeUi() {
  replayBanner.hidden = false;
  betUi.setView('replay');
  balanceHud.hidden = true;
  setLastReplayUrl('');
}

async function playReplayAnimation(round) {
  spinning = true;
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
    setMessage('Replay complete.');
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
    game.setRgsReady(true);
    syncControls();
    syncHud();
    await playReplayAnimation(replayRound);
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message)));
  }
}

function handleAuthRoundOutcome(authOutcome) {
  if (authOutcome.status === 'resumed') {
    setMessage('Round resumed.');
  } else if (authOutcome.status === 'completed' && authOutcome.result) {
    setMessage('Last completed round restored.');
  }
}

async function onNewSession() {
  startNewRgsSession();
  game.sessionTimer?.reset();
  devStatsOverlay.reset();
  session = resetSession();
  lastReplayUrl = '';
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

async function initSlotStage() {
  slotBoard = await createSlotBoard(slotRoot);
  seedInitialBoard();
}

async function startGame() {
  await initSlotStage();
  await game.start();
}

function revealGameShell() {
  shellEl?.classList.remove('suki-shell-booting');
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
    onContinue: () => {
      revealGameShell();
      gameAudio.unlock();
    },
  });
  attachPreloaderCommitLabel();
}
