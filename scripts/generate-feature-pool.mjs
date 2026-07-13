/**
 * Hunt natural scatter feature books and merge into the base book pool.
 * Run after generate-book-pool.mjs: node scripts/generate-feature-pool.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateFeatureBook } from '../math/feature.mjs';
import { FEATURE_POOL_TARGETS, FEATURE_WEIGHT_PROFILE } from '../math/feature-weight-profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_base.jsonl');
const metaPath = join(root, 'data', 'book-meta.json');

const SCAN_LIMIT = 2_500_000;

/**
 * @param {string} band
 * @param {number} mult
 */
function matchesBand(band, mult) {
  const row = FEATURE_WEIGHT_PROFILE.find((entry) => entry.band === band);
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
  /** @type {{ seed: number, book: ReturnType<typeof simulateFeatureBook> }[]} */
  const found = [];
  for (let seed = startSeed; seed < startSeed + limit; seed += 1) {
    const book = simulateFeatureBook(seed);
    const mult = book.totalMultiplier;
    if (!matchesBand(band, mult)) continue;
    const key = `${book.payoutMultiplier}:${mult.toFixed(2)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    found.push({ seed, book });
    if (found.length >= FEATURE_POOL_TARGETS[band]) return found;
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

/** @type {Map<string, { seed: number, book: ReturnType<typeof simulateFeatureBook> }[]>} */
const buckets = new Map(FEATURE_WEIGHT_PROFILE.map((row) => [row.band, []]));
const dedupe = new Set();

console.log(`Building natural feature pool (scan limit ${SCAN_LIMIT.toLocaleString()} per band)…`);

let seedCursor = 7_001;
for (const row of FEATURE_WEIGHT_PROFILE) {
  const found = huntBand(row.band, seedCursor, SCAN_LIMIT, dedupe);
  buckets.set(row.band, found);
  seedCursor += 29_317;
  console.log(`  ${row.band.padEnd(14)} ${found.length}/${FEATURE_POOL_TARGETS[row.band]}`);
}

/** @type {object[]} */
const featureBooks = [];

for (const row of FEATURE_WEIGHT_PROFILE) {
  for (const entry of buckets.get(row.band) ?? []) {
    const hasEnterBonus = entry.book.events.some((event) => event.type === 'enterBonus');
    if (!hasEnterBonus) {
      throw new Error(`feature book seed ${entry.seed} missing enterBonus`);
    }

    const book = {
      id: nextId,
      payoutMultiplier: entry.book.payoutMultiplier,
      events: entry.book.events.map((event) => ({ ...event })),
    };
    featureBooks.push(book);
    meta[String(nextId)] = {
      band: row.band,
      seed: entry.seed,
      totalMultiplier: entry.book.totalMultiplier,
      feature: true,
    };
    nextId += 1;
  }
}

if (!featureBooks.length) {
  throw new Error('No natural feature books found — widen bands or increase scan limit');
}

const mean =
  featureBooks.reduce((sum, book) => sum + book.payoutMultiplier / 100, 0) / featureBooks.length;

const merged = [...existingBooks, ...featureBooks];
writeFileSync(booksPath, `${merged.map((book) => JSON.stringify(book)).join('\n')}\n`, 'utf8');
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

console.log(`\nMerged ${featureBooks.length} feature books into ${booksPath} (${merged.length} total)`);
console.log(`  mean feature total  ${mean.toFixed(2)}× base bet`);
console.log(`  feature RTP share ${((mean * 0.005) * 100).toFixed(2)}% @ 1/200 trigger (before lookup tune)`);
