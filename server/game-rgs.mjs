import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMockRgs } from '@kap-solo/suki-engine/server/mock-rgs/create-mock-rgs.mjs';
import { API_MULT } from '@kap-solo/suki-engine/server/mock-rgs/defaults.mjs';
import { analyzeLookup } from '../math/analyze.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lookupPath = join(root, 'data', 'lookUpTable_base_0.csv');
const booksPath = join(root, 'data', 'books_base.jsonl');

/** @type {{ lookup: object[], books: Map<number, object>, weightTotal: number, mtimeMs: number } | null} */
let mathCache = null;

function loadLookup() {
  const text = readFileSync(lookupPath, 'utf8');
  return text
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => {
      const [id, weight, payout] = line.split(',');
      return { id: Number(id), weight: Number(weight), payout: Number(payout) };
    });
}

function loadBooks() {
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

function getMathBundle() {
  const mtimeMs = Math.max(statSync(lookupPath).mtimeMs, statSync(booksPath).mtimeMs);
  if (mathCache && mathCache.mtimeMs === mtimeMs) return mathCache;

  const lookup = loadLookup();
  const books = loadBooks();
  const weightTotal = lookup.reduce((sum, row) => sum + row.weight, 0);
  mathCache = { lookup, books, weightTotal, mtimeMs };
  return mathCache;
}

function logMathStats() {
  const { lookup, books } = getMathBundle();
  const stats = analyzeLookup(lookup, books);
  console.log(
    `Math loaded: RTP ${stats.rtpPercent.toFixed(2)}% · hit ${stats.hitRatePercent.toFixed(1)}% · ${lookup.length} lookup rows`,
  );
}

function pickSimulationId() {
  const { lookup, weightTotal } = getMathBundle();
  let r = Math.random() * weightTotal;
  for (const row of lookup) {
    r -= row.weight;
    if (r <= 0) return row.id;
  }
  return lookup[lookup.length - 1].id;
}

export const GAME_ID = 'basic-slot';
export const REPLAY_VERSION = '1';

function roundFromBook(book, amountApi) {
  const payoutMultiplier = book.payoutMultiplier / 100;
  const payout = Math.round(amountApi * payoutMultiplier);
  return {
    amount: amountApi,
    payout,
    payoutMultiplier,
    active: false,
    mode: 'BASE',
    state: book.events,
  };
}

export function createGameMockRgs() {
  return createMockRgs({
    gameId: GAME_ID,
    replayVersion: REPLAY_VERSION,
    betConfig: {
      minBet: API_MULT / 2,
      maxBet: 1000 * API_MULT,
      stepBet: API_MULT / 2,
      defaultBetLevel: API_MULT,
      betLevels: [0.5, 1, 2, 5, 10].map((d) => Math.round(d * API_MULT)),
      betModes: {
        BASE: { mode: 'BASE', costMultiplier: 1, feature: false },
      },
    },
    resolvePlay(_session, body) {
      const amount = Number(body.amount);
      const { books } = getMathBundle();
      const simId = pickSimulationId();
      const book = books.get(simId);
      if (!book) {
        return { error: { code: 'ERR_GEN', message: `Missing book ${simId}` } };
      }

      const payoutMultiplier = book.payoutMultiplier / 100;
      const payout = Math.round(amount * payoutMultiplier);

      return {
        payout,
        payoutMultiplier,
        state: book.events,
        mode: 'BASE',
      };
    },
    resolveReplay(event, amountQuery) {
      const { books } = getMathBundle();
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
      return { round: roundFromBook(books.get(bookId), amountApi) };
    },
  });
}

logMathStats();
