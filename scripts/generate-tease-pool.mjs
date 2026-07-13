/**
 * Hunt scatter tease books (1–2 SC on reveal) and merge into the base book pool.
 * Run after generate-book-pool.mjs: node scripts/generate-tease-pool.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countScattersOnBoard } from '../math/feature.mjs';
import { simulateTeaseBook } from '../math/tease.mjs';
import { TEASE_POOL_TARGETS, TEASE_WEIGHT_PROFILE } from '../math/tease-weight-profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_base.jsonl');
const metaPath = join(root, 'data', 'book-meta.json');

const SCAN_LIMIT = 1_500_000;

/**
 * @param {typeof TEASE_WEIGHT_PROFILE[number]} row
 * @param {number} mult
 */
function matchesBand(row, mult) {
  return mult >= row.minMult && mult <= row.maxMult;
}

/**
 * @param {typeof TEASE_WEIGHT_PROFILE[number]} row
 * @param {number} startSeed
 * @param {number} limit
 * @param {Set<string>} dedupe
 */
function huntBand(row, startSeed, limit, dedupe) {
  /** @type {{ seed: number, book: ReturnType<typeof simulateTeaseBook> }[]} */
  const found = [];
  const scatterCount = /** @type {1 | 2} */ (row.scatterCount);
  const variant = row.band.endsWith('_loss') ? 'loss' : 'win';

  for (let seed = startSeed; seed < startSeed + limit; seed += 1) {
    const book = simulateTeaseBook(seed, scatterCount, { variant });
    const mult = book.totalMultiplier;
    if (!matchesBand(row, mult)) continue;

    const reveal = book.events.find((event) => event.type === 'gameReveal');
    if (!reveal || countScattersOnBoard(reveal.board) !== scatterCount) continue;

    const boardKey = reveal.board.flat().join('');
    const key = variant === 'loss'
      ? `${row.band}:${scatterCount}:${boardKey}`
      : `${scatterCount}:${book.payoutMultiplier}:${mult.toFixed(2)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    found.push({ seed, book });
    if (found.length >= TEASE_POOL_TARGETS[row.band]) return found;
  }

  return found;
}

/** @type {object[]} */
const existingBooks = [];
/** @type {Record<string, object>} */
let meta = {};

for (const line of readFileSync(booksPath, 'utf8').trim().split('\n')) {
  existingBooks.push(JSON.parse(line));
}
if (existsSync(metaPath)) {
  meta = JSON.parse(readFileSync(metaPath, 'utf8'));
}

let nextId = existingBooks.reduce((max, book) => Math.max(max, book.id), 0) + 1;

/** @type {Map<string, { seed: number, book: ReturnType<typeof simulateTeaseBook> }[]>} */
const buckets = new Map(TEASE_WEIGHT_PROFILE.map((row) => [row.band, []]));
const dedupe = new Set();

console.log(`Building scatter tease pool (scan limit ${SCAN_LIMIT.toLocaleString()} per band)…`);

let seedCursor = 11_003;
for (const row of TEASE_WEIGHT_PROFILE) {
  const found = huntBand(row, seedCursor, SCAN_LIMIT, dedupe);
  buckets.set(row.band, found);
  seedCursor += 19_871;
  console.log(`  ${row.band.padEnd(14)} ${found.length}/${TEASE_POOL_TARGETS[row.band]}`);
}

/** @type {object[]} */
const teaseBooks = [];

for (const row of TEASE_WEIGHT_PROFILE) {
  for (const entry of buckets.get(row.band) ?? []) {
    if (entry.book.events.some((event) => event.type === 'enterBonus')) {
      throw new Error(`tease book seed ${entry.seed} must not include enterBonus`);
    }

    const book = {
      id: nextId,
      payoutMultiplier: entry.book.payoutMultiplier,
      events: entry.book.events.map((event) => ({ ...event })),
    };
    teaseBooks.push(book);
    meta[String(nextId)] = {
      band: row.band,
      seed: entry.seed,
      totalMultiplier: entry.book.totalMultiplier,
      scatterCount: entry.book.scatterCount,
      tease: true,
    };
    nextId += 1;
  }
}

if (!teaseBooks.length) {
  throw new Error('No scatter tease books found — widen bands or increase scan limit');
}

const oneScatter = teaseBooks.filter((book) => meta[String(book.id)].scatterCount === 1).length;
const twoScatter = teaseBooks.filter((book) => meta[String(book.id)].scatterCount === 2).length;

const merged = [...existingBooks, ...teaseBooks];
writeFileSync(booksPath, `${merged.map((book) => JSON.stringify(book)).join('\n')}\n`, 'utf8');
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

console.log(`\nMerged ${teaseBooks.length} tease books into ${booksPath} (${merged.length} total)`);
console.log(`  1-scatter tease  ${oneScatter} books`);
console.log(`  2-scatter tease  ${twoScatter} books`);
console.log(`  profile rate     ${(TEASE_WEIGHT_PROFILE.reduce((s, r) => s + r.prob, 0) * 100).toFixed(2)}% (before lookup tune)`);
