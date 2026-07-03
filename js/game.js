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
  messageForRgsCode,
  requestReplay,
  startNewRgsSession,
} from '@kap-solo/suki-engine/client/rgs.js';
import { buildPreloadAssets, wireTemplateAudio } from './audio.js';
import { BET_OPTIONS, BUILD_REF, DEFAULT_BET, GAME, GAME_MODES } from './config.js';
import { winCellsFromClusters } from './cluster.js';
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
  formatMult,
} from './slot.js';
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
const betEl = document.getElementById('bet-display');
const resultEl = document.getElementById('last-result');
const messageEl = document.getElementById('message');
const replayBanner = document.getElementById('replay-banner');
const balanceHud = document.getElementById('balance-hud');
const statsEl = document.getElementById('stats');
const complianceDevEl = document.getElementById('compliance-dev');
const sessionTimerStat = document.getElementById('session-timer-stat');
const sessionTimerEl = document.getElementById('session-timer');
const slotRoot = document.getElementById('slot-board');
const buildRefEl = document.getElementById('build-ref');
const balanceLabelEl = document.getElementById('balance-label');
const betLabelEl = document.getElementById('bet-label');
const lastResultLabelEl = document.getElementById('last-result-label');
const sessionBestHudLabelEl = document.getElementById('session-best-hud-label');
const sessionBestHudEl = document.getElementById('session-best-hud');
const replayNoteEl = document.getElementById('replay-note');
const principlesAside = document.querySelector('.principles');

document.getElementById('game-title').textContent = GAME.title;
document.getElementById('game-subtitle').textContent = GAME.subtitle;
if (buildRefEl) buildRefEl.textContent = `Build ${BUILD_REF}`;

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

function copyTerm(key, vars) {
  return game.copy.t(key, vars);
}

function playCostDisplay() {
  const baseApi = displayToApi(bet);
  const playApi = game.betModes.playAmountApi(baseApi);
  return apiToDisplay(playApi);
}

function playButtonLabel() {
  return copyTerm('drop');
}

function formatSessionBestWin() {
  if (!session || session.highestWin <= 0) return '—';
  return `${formatMult(session.highestMultiplier)} (${fmtWin(session.highestWin)})`;
}

function syncSessionBestHud() {
  if (sessionBestHudEl) {
    sessionBestHudEl.textContent = formatSessionBestWin();
  }
}

function syncHud() {
  balanceEl.textContent = replayMode ? '—' : fmtBalance(balance);
  betEl.textContent = fmtBalance(bet);
  const rtpPart = game.controls.showRtp ? ` · target RTP ${GAME.targetRtpPercent}%` : '';
  statsEl.textContent = `${GAME.reels}×${GAME.rows} cluster cascade · base mode only · ${BUILD_REF}${rtpPart}`;
  syncSessionBestHud();
}

function displayRoundResult({ summary, multiplier, payout, profit }) {
  resultEl.textContent = `${summary} → ${fmtWin(payout)}`;
  if (multiplier > 0) {
    if (profit > 0) {
      setMessage(`${copyTerm('won')} ${fmtWin(profit)}.`);
    } else {
      setMessage(`${summary} — ${formatMult(multiplier)} win.`);
    }
  } else if (payout === bet) {
    setMessage(`${summary} — ${copyTerm('stakeReturned')}.`);
  } else {
    setMessage(`${summary} — no win.`);
  }
}

function showStaticRound(round) {
  if (!slotBoard) return;
  slotBoard.setBoard(finalBoardFromRound(round));
}

async function animateReveal(event) {
  if (!slotBoard) return;
  await animateSlotSpin(slotBoard, event.board, { speed: animationSpeed });
}

async function presentBookEvent(event, { animate = true } = {}) {
  if (!slotBoard) return;

  if (event.type === 'gameReveal') {
    if (animate) await animateReveal(event);
    else slotBoard.setBoard(event.board);
    return;
  }

  if (event.type === 'clusterWin') {
    const winCells = winCellsFromClusters(event.clusters);
    pendingClusterRemoved = event.removed ?? [];
    if (animate) {
      const stepWin = bet * (event.stepMultiplier ?? 0);
      const winLabel = stepWin > 0 ? `+${fmtWin(stepWin)}` : null;
      setMessage(`Cascade ×${event.cascadeMultiplier} · +${formatMult(event.stepMultiplier)}`);
      await slotBoard.animateClusterWin(winCells, {
        speed: animationSpeed,
        winLabel,
        firstCascade: event.cascade === 1,
      });
      gameAudio.playSfx('win');
    } else {
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
    await presentBookEvent(event, { animate });
  }
}

function syncControls() {
  betUi.sync();
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
  lastReplayUrl = buildReplayUrl({
    event: replayEvent,
    amountApi: round.amount,
    mode: game.betModes.replayModeKey(),
    lang: game.copy.lang,
  });
  betUi.setLastReplayUrl(lastReplayUrl);

  const summary = describeRoundResult(round);

  recentResults.push({
    data: {
      summary,
      multiplier: result.multiplier,
      payout,
    },
  });

  displayRoundResult({
    summary,
    multiplier: result.multiplier,
    payout,
    profit: payout - debitDisplay,
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
    sessionStorageKey: 'basicSlot.rgsSessionID',
  },
  shell: {
    elements: {
      complianceDev: complianceDevEl,
      testControls: betUi.elements.testControls,
      copyReplay: betUi.elements.copyReplay,
      autoplay: betUi.elements.autoplay,
      newSession: betUi.elements.newSession,
      devAside: principlesAside,
      sessionTimer: sessionTimerEl,
      sessionTimerContainer: sessionTimerStat,
      balanceLabel: balanceLabelEl,
      betLabel: betLabelEl,
      lastResultLabel: lastResultLabelEl,
      sessionBestHudLabel: sessionBestHudLabelEl,
      replayNote: replayNoteEl,
      dropButton: betUi.elements.dropButton,
    },
    screenPreview: { root: shellEl },
  },
  lifecycle: {
    handlers: {
      gameReveal: async (event, { animate }) => {
        await presentBookEvent(event, { animate });
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
    },
    buildSettledResult: buildGameSettledResult,
    playingMessage: 'Spinning…',
    onRoundSettled: (round, result) => {
      pendingRoundSettled = { round, result };
    },
    setMessage,
    getBetApi: () => displayToApi(bet),
    setBetFromApi: (amountApi) => {
      bet = apiToDisplay(amountApi);
    },
  },
  auth: {
    defaultBetDisplay: DEFAULT_BET,
    gameModes: GAME_MODES,
    copyOverrides: {
      drop: 'Spin',
    },
    onConfigured(auth) {
      if (auth.balanceDisplay != null) {
        balance = auth.balanceDisplay;
      }
      applyAuthBetConfig(auth, {
        betUi,
        getBet: () => bet,
        setBet: (value) => { bet = value; },
        getBetOptions: () => betOptions,
        setBetOptions: (levels) => { betOptions = levels; },
      });
    },
  },
  ui: {
    setMessage,
    syncHud,
    isBusy: () => spinning || autoplaying || isBoardPresenting(),
    onRgsReady: () => syncControls(),
    onReady: () => {
      syncHud();
      setMessage(copyTerm('setBetPrompt'));
    },
    onAuthRound: handleAuthRoundOutcome,
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
  betUi.setLastReplayUrl('');
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
    const result = authOutcome.result;
    const summary =
      result.multiplier <= 0
        ? 'No win'
        : result.cascadeSteps > 1
          ? `${result.cascadeSteps} cascades · ${formatMult(result.multiplier)}`
          : `Win · ${formatMult(result.multiplier)}`;
    displayRoundResult({
      summary,
      multiplier: result.multiplier,
      payout: apiToDisplay(result.payoutApi),
      profit: apiToDisplay(result.profitApi),
    });
    setMessage('Last completed round restored.');
  }
}

async function onNewSession() {
  startNewRgsSession();
  game.sessionTimer?.reset();
  session = resetSession();
  resultEl.textContent = '—';
  if (sessionBestHudEl) sessionBestHudEl.textContent = '—';
  lastReplayUrl = '';
  betUi.setLastReplayUrl('');
  setMessage('New session — reconnecting…');
  game.start();
}

async function onCopyReplayLink() {
  if (!lastReplayUrl) return;
  try {
    await navigator.clipboard.writeText(lastReplayUrl);
    setMessage('Replay link copied.');
  } catch {
    setMessage(lastReplayUrl);
  }
}

async function initSlotStage() {
  slotBoard = await createSlotBoard(slotRoot);
}

async function startGame() {
  await initSlotStage();
  await game.start();
}

betUi.renderBetLevels();
syncHud();
syncDevTools();
syncControls();

if (replayMode) {
  setReplayModeUi();
  startGame();
} else {
  setPlayModeUi();
  createGamePreloader({
    shell: shellEl,
    brand: 'SUKI engine',
    subtitle: GAME.title,
    hint: 'Tap anywhere to play',
    connectingHint: copyTerm('connectingRgs'),
    assets: buildPreloadAssets(),
    gate: () => game.checkRgsGate(),
    bootstrap: () => startGame(),
    onContinue: () => {
      gameAudio.unlock();
    },
  });
}
