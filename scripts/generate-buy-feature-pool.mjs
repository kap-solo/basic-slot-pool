/**
 * Hunt Buy Bonus feature books — ~19× average @ 20× price.
 * Run: node scripts/generate-buy-feature-pool.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateBuyFeatureBook } from '../math/feature.mjs';
import { BUY_POOL_TARGETS, BUY_WEIGHT_PROFILE } from '../math/buy-weight-profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_buy.jsonl');
const metaPath = join(root, 'data', 'buy-book-meta.json');

const SCAN_LIMIT = 2_500_000;
const START_ID = 10_001;

/**
 * @param {number} mult
 */
function bandForMult(mult) {
  for (const row of BUY_WEIGHT_PROFILE) {
    if (mult >= row.minMult && mult <= row.maxMult) return row.band;
  }
  return mult > 75 ? 'buy_rare' : 'buy_low';
}

/**
 * @param {string} band
 * @param {number} mult
 */
function matchesBand(band, mult) {
  const row = BUY_WEIGHT_PROFILE.find((entry) => entry.band === band);
  if (!row) return false;
  return mult >= row.minMult && mult <= row.maxMult;
}

/**
 * @param {string} band
 * @param {number} startSeed
 * @param {number} limit
 * @param {Set<string>} dedupe
 */
function huntBand(band, startSeed, limit, dedupe) {
  /** @type {{ seed: number, book: ReturnType<typeof simulateBuyFeatureBook> }[]} */
  const found = [];
  for (let seed = startSeed; seed < startSeed + limit; seed += 1) {
    const book = simulateBuyFeatureBook(seed);
    const mult = book.totalMultiplier;
    if (!matchesBand(band, mult)) continue;
    const key = `${book.payoutMultiplier}:${mult.toFixed(1)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    found.push({ seed, book });
    if (found.length >= BUY_POOL_TARGETS[band]) return found;
  }
  return found;
}

/** @type {Map<string, { seed: number, book: ReturnType<typeof simulateBuyFeatureBook> }[]>} */
const buckets = new Map(BUY_WEIGHT_PROFILE.map((row) => [row.band, []]));
const dedupe = new Set();

console.log(`Building buy feature pool (scan limit ${SCAN_LIMIT.toLocaleString()} per band)…`);

let seedCursor = 101;
for (const row of BUY_WEIGHT_PROFILE) {
  const found = huntBand(row.band, seedCursor, SCAN_LIMIT, dedupe);
  buckets.set(row.band, found);
  seedCursor += 37_891;
  console.log(`  ${row.band.padEnd(11)} ${found.length}/${BUY_POOL_TARGETS[row.band]}`);
}

/** @type {object[]} */
const books = [];
/** @type {Record<string, { band: string, seed: number, totalMultiplier: number }>} */
const meta = {};
let nextId = START_ID;

for (const row of BUY_WEIGHT_PROFILE) {
  for (const entry of buckets.get(row.band) ?? []) {
    const book = {
      ...entry.book,
      id: nextId,
      events: entry.book.events.map((event) => ({ ...event })),
    };
    books.push(book);
    meta[String(nextId)] = {
      band: row.band,
      seed: entry.seed,
      totalMultiplier: book.totalMultiplier,
    };
    nextId += 1;
  }
}

if (!books.length) {
  throw new Error('No buy books found — widen bands or increase scan limit');
}

const mean =
  books.reduce((sum, book) => sum + book.payoutMultiplier / 100, 0) / books.length;

writeFileSync(booksPath, `${books.map((book) => JSON.stringify(book)).join('\n')}\n`);
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);

console.log(`\nWrote ${books.length} buy books → ${booksPath}`);
console.log(`  mean payout   ${mean.toFixed(2)}× base bet`);
console.log(`  buy RTP @ 20× ${((mean / 20) * 100).toFixed(2)}% (before lookup tune)`);
