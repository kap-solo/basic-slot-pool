/**
 * Analyze RTP, hit rate, and volatility for the current math bundle.
 * Run: node scripts/analyze-math.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLookup, formatStatsReport } from '../math/analyze.mjs';
import { profileTheoreticalRtp, TARGET_RTP, MAX_RTP } from '../math/weight-profile.mjs';
import {
  featureProfileTheoreticalMean,
  featureProfileTriggerRate,
} from '../math/feature-weight-profile.mjs';
import {
  teaseProfileTheoreticalMean,
  teaseProfileTriggerRate,
} from '../math/tease-weight-profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadLookup(path) {
  const lines = readFileSync(path, 'utf8').trim().split('\n').slice(1);
  return lines.map((line) => {
    const [id, weight, payout] = line.split(',');
    return { id: Number(id), weight: Number(weight), payout: Number(payout) };
  });
}

function loadBooks(path) {
  /** @type {Map<number, object>} */
  const books = new Map();
  for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
    const book = JSON.parse(line);
    books.set(book.id, book);
  }
  return books;
}

const lookup = loadLookup(join(root, 'data', 'lookUpTable_base_0.csv'));
const books = loadBooks(join(root, 'data', 'books_base.jsonl'));
const stats = analyzeLookup(lookup, books);

/** @type {Record<string, object>} */
let meta = {};
try {
  meta = JSON.parse(readFileSync(join(root, 'data', 'book-meta.json'), 'utf8'));
} catch {
  // meta optional
}

console.log('Basic Slot — math analysis\n');
console.log(formatStatsReport(stats, { targetRtp: TARGET_RTP, maxRtp: MAX_RTP }));
console.log(`\nProfile theoretical RTP (representative pays): ${(profileTheoreticalRtp() * 100).toFixed(2)}%`);
console.log(
  `Scatter tease (profile): ${(teaseProfileTriggerRate() * 100).toFixed(2)}% spins · ${(teaseProfileTheoreticalMean() * 100).toFixed(2)}% RTP share`,
);
console.log(
  `Feature budget (profile): ${(featureProfileTriggerRate() * 100).toFixed(2)}% trigger · ${(featureProfileTheoreticalMean() * 100).toFixed(2)}% RTP share`,
);

const teaseIds = new Set(
  Object.entries(meta)
    .filter(([, info]) => info.tease || String(info.band).startsWith('tease_'))
    .map(([id]) => Number(id)),
);
if (teaseIds.size) {
  const totalWeight = lookup.reduce((sum, row) => sum + row.weight, 0);
  const teaseWeight = lookup
    .filter((row) => teaseIds.has(row.id))
    .reduce((sum, row) => sum + row.weight, 0);
  let teaseRtp = 0;
  for (const row of lookup) {
    if (!teaseIds.has(row.id)) continue;
    teaseRtp += (row.weight / totalWeight) * (row.payout / 100);
  }
  console.log(
    `Scatter tease (lookup): ${((teaseWeight / totalWeight) * 100).toFixed(3)}% spin rate · ${(teaseRtp * 100).toFixed(2)}% RTP share`,
  );
}

const featureIds = new Set(
  Object.entries(meta)
    .filter(([, info]) => info.feature || String(info.band).startsWith('feature_'))
    .map(([id]) => Number(id)),
);
if (featureIds.size) {
  const totalWeight = lookup.reduce((sum, row) => sum + row.weight, 0);
  const featureWeight = lookup
    .filter((row) => featureIds.has(row.id))
    .reduce((sum, row) => sum + row.weight, 0);
  let featureRtp = 0;
  for (const row of lookup) {
    if (!featureIds.has(row.id)) continue;
    featureRtp += (row.weight / totalWeight) * (row.payout / 100);
  }
  console.log(
    `Natural scatter (lookup): ${((featureWeight / totalWeight) * 100).toFixed(3)}% trigger rate · ${(featureRtp * 100).toFixed(2)}% RTP share`,
  );
}

const bandCounts = new Map();
for (const info of Object.values(meta)) {
  bandCounts.set(info.band, (bandCounts.get(info.band) ?? 0) + 1);
}
if (bandCounts.size) {
  console.log('\nBook pool by band:');
  for (const [band, count] of [...bandCounts.entries()].sort()) {
    console.log(`  ${band.padEnd(14)} ${count}`);
  }
}

console.log('\nDesign intent (polarised crypto-style):');
console.log('  • Shaped symbol pays — ordinary 0.08–0.14× · premium 4–6× at min cluster');
console.log('  • Scatter tease ~1.5% (1–2 SC on reveal, no bonus)');
console.log('  • Natural scatter ~1/200 → 8 free spins (~16× avg feature total)');
