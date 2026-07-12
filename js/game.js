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

const betUi = createBetUi({
  root: document.getElementById('bet-ui-root'),
  showModeRow: false,
});

let balance = 0;
let bet = DEFAULT_BET;
/** @type {number[]} */
let betOptions = [...BET_OPTIONS];
let spinning = false;
let autoplaying = false;
let animationSpeed = 1;
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
  return `Bet ${fmtBalance(playCostDisplay())}`;
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

function syncHud() {
  balanceEl.textContent = replayMode ? '—' : fmtBalance(balance);
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
}

function isBoardPresenting() {
  return slotBoard?.isPresenting?.() ?? false;
}

function flushRoundSettledUI() {
  if (!pendingRoundSettled) return;
  const { round, result } = pendingRoundSettled;
  pendingRoundSettled = null;

  const payout = apiToDisplay(result.payoutApi);
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
    screenPreview: { root: shellEl },
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
      syncHud();
      setMessage(copyTerm('setBetPrompt'));
    },
    onAuthRound: handleAuthRoundOutcome,
    onSyncDevTools: () => {
      syncDevControlsVisibility();
    },
  },
  onJurisdictionChange: () => {
    gameMenu.refresh();
    syncControls();
    syncHud();
  },
  replay: { start: bootstrapReplay },
});

const { controls, lifecycle, applyAuthConfig, syncDevTools } = game;

gameMenu.bind({ game });
registerGameModals({
  modalHost,
  recentResults,
  game,
  formatCurrency: (amount) => game.formatCurrency(amount),
  formatWin: (amount) => game.formatWin(amount),
});

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
    gameMenu.close();
    modalHost.close();
  },
  modalHost,
  getCopyTerm: copyTerm,
  formatCurrency: (amount) => game.formatCurrency(amount),
  onPlay: onSpin,
  onTurbo: () => {
    animationSpeed = 3;
  },
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

async function runAutoplay(roundCount) {
  if (spinning || autoplaying || !controls.canAutoplay) return;
  if (!game.rgsReady || balance < playCostDisplay()) return;

  slotBoard?.cancelPresentation?.();
  if (slotBoard?.waitUntilIdle) {
    await slotBoard.waitUntilIdle();
  }

  autoplaying = true;
  syncControls();
  let count = 0;
  try {
    for (let i = 0; i < roundCount; i += 1) {
      if (balance < playCostDisplay()) {
        setMessage(`${copyTerm('autoplayStopped')} ${count} spins.`);
        break;
      }
      setMessage(copyTerm('autoplayProgress', { current: i + 1, total: roundCount }));
      await lifecycle.executeDrop({ animate: false });
      if (slotBoard?.fadeOutCascadeLadder) {
        await slotBoard.fadeOutCascadeLadder();
      }
      flushRoundSettledUI();
      syncHud();
      count += 1;
    }
    if (count === roundCount) {
      setMessage(copyTerm('autoplayComplete', { count: roundCount }));
    }
  } catch (err) {
    console.error(err);
    setMessage(messageForRgsCode(String(err.message)));
  } finally {
    autoplaying = false;
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
syncHud();
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
