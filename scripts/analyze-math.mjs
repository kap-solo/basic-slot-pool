/**
 * Analyze RTP, hit rate, and volatility for the current math bundle.
 * Run: node scripts/analyze-math.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLookup, formatStatsReport } from '../math/analyze.mjs';
import { profileTheoreticalRtp, TARGET_RTP, MAX_RTP } from '../math/weight-profile.mjs';

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

console.log('Basic Slot — math analysis\n');
console.log(formatStatsReport(stats, { targetRtp: TARGET_RTP, maxRtp: MAX_RTP }));
console.log(`\nProfile theoretical RTP (representative pays): ${(profileTheoreticalRtp() * 100).toFixed(2)}%`);

const bandCounts = new Map();
try {
  const meta = JSON.parse(readFileSync(join(root, 'data', 'book-meta.json'), 'utf8'));
  for (const info of Object.values(meta)) {
    bandCounts.set(info.band, (bandCounts.get(info.band) ?? 0) + 1);
  }
  console.log('\nBook pool by band:');
  for (const [band, count] of [...bandCounts.entries()].sort()) {
    console.log(`  ${band.padEnd(8)} ${count}`);
  }
} catch {
  // meta optional
}

console.log('\nDesign intent (polarised crypto-style):');
console.log('  • Token wins at ~$0.10 / $0.20 / $0.60 on a $1 bet (0.1× / 0.2× / 0.6×)');
console.log('  • Ordinary 0.1× base · premium 5× base · moderate 2–8× · tail to 250×+');
