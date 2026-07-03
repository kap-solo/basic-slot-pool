/**
 * Build a book pool from weighted simulation — medium-volatility bands.
 * Run: node scripts/generate-book-pool.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { simulateFromSeed } from '../math/cluster.mjs';
import { POOL_TARGETS, WEIGHT_PROFILE } from '../math/weight-profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_base.jsonl');
const metaPath = join(root, 'data', 'book-meta.json');

const SCAN_LIMIT = 4_000_000;

/**
 * @param {number} mult
 */
function bandForMult(mult) {
  for (const row of WEIGHT_PROFILE) {
    if (mult >= row.minMult && mult <= row.maxMult) return row.band;
  }
  return mult > 500 ? 'huge' : 'loss';
}

/**
 * @param {string} band
 * @param {number} mult
 */
function matchesBand(band, mult) {
  const row = WEIGHT_PROFILE.find((entry) => entry.band === band);
  if (!row) return false;
  return mult >= row.minMult && mult <= row.maxMult;
}

/**
 * @param {string} band
 * @param {number} startSeed
 * @param {number} limit
 * @param {{ minCascades?: number, maxCascades?: number, dedupe?: Set<string>, refillMode?: 'normal' | 'hunt' | 'extreme' }} [opts]
 */
function huntBand(band, startSeed, limit, { minCascades = 0, maxCascades = 99, dedupe = new Set(), refillMode = 'normal' } = {}) {
  /** @type {{ seed: number, result: ReturnType<typeof simulateFromSeed> }[]} */
  const found = [];
  for (let seed = startSeed; seed < startSeed + limit; seed += 1) {
    const result = simulateFromSeed(seed, { refillMode });
    if (!matchesBand(band, result.totalMultiplier)) continue;
    if (result.cascadeSteps < minCascades || result.cascadeSteps > maxCascades) continue;
    const key =
      band === 'loss'
        ? `loss:${seed}`
        : `${result.payoutMultiplier}:${result.cascadeSteps}:${result.events[0]?.board?.flat?.()?.slice?.(0, 8)?.join?.() ?? seed}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    found.push({ seed, result });
    if (found.length >= POOL_TARGETS[band]) return found;
  }
  return found;
}

/** @type {Map<string, { seed: number, result: ReturnType<typeof simulateFromSeed> }[]>} */
const buckets = new Map(WEIGHT_PROFILE.map((row) => [row.band, []]));
const dedupe = new Set();

console.log(`Building book pool (scan limit ${SCAN_LIMIT.toLocaleString()} per band hunt)…`);

buckets.set('loss', huntBand('loss', 1, 500_000, { dedupe }));
console.log(`  loss     ${buckets.get('loss').length}/${POOL_TARGETS.loss}`);

buckets.set('micro', huntBand('micro', 5_000, 1_500_000, { dedupe }));
console.log(`  micro    ${buckets.get('micro').length}/${POOL_TARGETS.micro}`);

buckets.set('small', huntBand('small', 50_000, 1_500_000, { dedupe }));
console.log(`  small    ${buckets.get('small').length}/${POOL_TARGETS.small}`);

buckets.set('medium', huntBand('medium', 100_000, 1_500_000, { dedupe }));
console.log(`  medium   ${buckets.get('medium').length}/${POOL_TARGETS.medium}`);

buckets.set('moderate', huntBand('moderate', 200_000, 4_000_000, { minCascades: 1, refillMode: 'hunt', dedupe }));
console.log(`  moderate ${buckets.get('moderate').length}/${POOL_TARGETS.moderate}`);

buckets.set('good', huntBand('good', 100_000, 3_000_000, { minCascades: 1, refillMode: 'hunt', dedupe }));
console.log(`  good     ${buckets.get('good').length}/${POOL_TARGETS.good}`);

buckets.set('big', huntBand('big', 50_000, 2_000_000, { minCascades: 2, refillMode: 'extreme', dedupe }));
console.log(`  big      ${buckets.get('big').length}/${POOL_TARGETS.big}`);

buckets.set('huge', huntBand('huge', 50_000, 5_000_000, { minCascades: 3, refillMode: 'extreme', dedupe }));
console.log(`  huge     ${buckets.get('huge').length}/${POOL_TARGETS.huge}`);

/** @type {object[]} */
const books = [];
/** @type {Record<number, { band: string, seed: number, cascades: number, mult: number }>} */
const meta = {};
let id = 1;

for (const row of WEIGHT_PROFILE) {
  for (const entry of buckets.get(row.band) ?? []) {
    books.push({
      id,
      payoutMultiplier: entry.result.payoutMultiplier,
      events: entry.result.events,
    });
    meta[id] = {
      band: row.band,
      seed: entry.seed,
      cascades: entry.result.cascadeSteps,
      mult: entry.result.totalMultiplier,
    };
    id += 1;
  }
}

writeFileSync(booksPath, `${books.map((book) => JSON.stringify(book)).join('\n')}\n`, 'utf8');
writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');

console.log(`\nWrote ${books.length} books → ${booksPath}`);
