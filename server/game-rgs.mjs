import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockRgs } from '@kap-solo/suki-engine/server/mock-rgs/create-mock-rgs.mjs';
import { API_MULT } from '@kap-solo/suki-engine/server/mock-rgs/defaults.mjs';
import { analyzeLookup } from '../math/analyze.mjs';
import { BUY_COST_MULT } from '../math/buy-weight-profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const MODE_PATHS = {
  BASE: {
    lookupPath: join(root, 'data', 'lookUpTable_base_0.csv'),
    booksPath: join(root, 'data', 'books_base.jsonl'),
  },
  BUY: {
    lookupPath: join(root, 'data', 'lookUpTable_buy_0.csv'),
    booksPath: join(root, 'data', 'books_buy.jsonl'),
  },
};

/** @type {Map<string, { lookup: object[], books: Map<number, object>, weightTotal: number, mtimeMs: number }>} */
const mathCache = new Map();

function loadLookup(lookupPath) {
  const text = readFileSync(lookupPath, 'utf8');
  return text
    .trim()
    .split('\n')
    .filter((line) => /^\d+,/.test(line))
    .map((line) => {
      const [id, weight, payout] = line.split(',');
      return { id: Number(id), weight: Number(weight), payout: Number(payout) };
    });
}

function loadBooks(booksPath) {
  const text = readFileSync(booksPath, 'utf8');
  /** @type {Map<number, object>} */
  const books = new Map();
  for (const line of text.trim().split('\n')) {
    if (!line) continue;
    const book = JSON.parse(line);
    books.set(book.id, book);
  }
  return books;
}

function getMathBundle(modeKey = 'BASE') {
  const paths = MODE_PATHS[modeKey] ?? MODE_PATHS.BASE;
  const mtimeMs = Math.max(statSync(paths.lookupPath).mtimeMs, statSync(paths.booksPath).mtimeMs);
  const cached = mathCache.get(modeKey);
  if (cached && cached.mtimeMs === mtimeMs) return cached;

  const lookup = loadLookup(paths.lookupPath);
  const books = loadBooks(paths.booksPath);
  const weightTotal = lookup.reduce((sum, row) => sum + row.weight, 0);
  const bundle = { lookup, books, weightTotal, mtimeMs };
  mathCache.set(modeKey, bundle);
  return bundle;
}

function logMathStats() {
  const base = getMathBundle('BASE');
  const baseStats = analyzeLookup(base.lookup, base.books);
  console.log(
    `Base math: RTP ${baseStats.rtpPercent.toFixed(2)}% · hit ${baseStats.hitRatePercent.toFixed(1)}% · ${base.lookup.length} lookup rows`,
  );

  try {
    const buy = getMathBundle('BUY');
    const buyStats = analyzeLookup(buy.lookup, buy.books);
    const buyRtp = buyStats.rtpPercent / BUY_COST_MULT;
    console.log(
      `Buy math: mean ${buyStats.rtpPercent.toFixed(2)}× · RTP ${buyRtp.toFixed(2)}% @ ${BUY_COST_MULT}× · ${buy.lookup.length} lookup rows`,
    );
  } catch {
    console.log('Buy math: not loaded (run npm run math:buy)');
  }
}

function pickSimulationId(modeKey = 'BASE') {
  const { lookup, weightTotal } = getMathBundle(modeKey);
  let r = Math.random() * weightTotal;
  for (const row of lookup) {
    r -= row.weight;
    if (r <= 0) return row.id;
  }
  return lookup[lookup.length - 1].id;
}

export const GAME_ID = 'basic-slot';
export const REPLAY_VERSION = '1';

function roundFromBook(book, amountApi, mode = 'BASE') {
  const costMult = mode === 'BUY' ? BUY_COST_MULT : 1;
  const baseBetApi = Math.round(amountApi / costMult);
  const payoutMultiplier = book.payoutMultiplier / 100;
  const payout = Math.round(baseBetApi * payoutMultiplier);
  return {
    amount: amountApi,
    payout,
    payoutMultiplier,
    active: false,
    mode,
    state: book.events,
  };
}

export function createGameMockRgs() {
  return createMockRgs({
    gameId: GAME_ID,
    replayVersion: REPLAY_VERSION,
    jurisdictionDefaults: { disabledBuyFeature: false },
    betConfig: {
      minBet: API_MULT / 2,
      maxBet: 1000 * API_MULT,
      stepBet: API_MULT / 2,
      defaultBetLevel: API_MULT,
      betLevels: [0.5, 1, 2, 5, 10].map((d) => Math.round(d * API_MULT)),
      betModes: {
        BASE: { mode: 'BASE', costMultiplier: 1, feature: false },
        BUY: { mode: 'BUY', costMultiplier: BUY_COST_MULT, feature: true },
      },
    },
    resolvePlay(_session, body) {
      const amount = Number(body.amount);
      const mode = String(body.mode || 'BASE').toUpperCase();
      const modeKey = mode === 'BUY' ? 'BUY' : 'BASE';
      const costMult = modeKey === 'BUY' ? BUY_COST_MULT : 1;
      const { books } = getMathBundle(modeKey);
      const simId = pickSimulationId(modeKey);
      const book = books.get(simId);
      if (!book) {
        return { error: { code: 'ERR_GEN', message: `Missing book ${simId}` } };
      }

      const baseBetApi = Math.round(amount / costMult);
      const payoutMultiplier = book.payoutMultiplier / 100;
      const payout = Math.round(baseBetApi * payoutMultiplier);

      return {
        payout,
        payoutMultiplier,
        state: book.events,
        mode: modeKey,
      };
    },
    resolveReplay(event, amountQuery) {
      const { books } = getMathBundle('BASE');
      const eventStr = String(event ?? '');
      const suffix = eventStr.includes('-') ? eventStr.split('-').pop() : eventStr;
      const bookId = Number(suffix);
      if (!Number.isFinite(bookId) || !books.has(bookId)) {
        return null;
      }
      const amountApi = Number(amountQuery) || API_MULT;
      if (!Number.isFinite(amountApi) || amountApi <= 0) {
        return { error: { code: 'ERR_VAL', message: 'Invalid replay amount' } };
      }
      return { round: roundFromBook(books.get(bookId), amountApi, 'BASE') };
    },
  });
}

logMathStats();
