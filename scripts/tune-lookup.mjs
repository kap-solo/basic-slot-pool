/**
 * Assign lookup weights — spin share from profile, RTP via tail trimming only.
 * Trimmed tail weight flows to micro/small (never inflates dead spins).
 * Run: node scripts/tune-lookup.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLookup } from '../math/analyze.mjs';
import { MAX_RTP, TARGET_RTP, WEIGHT_PROFILE } from '../math/weight-profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_base.jsonl');
const metaPath = join(root, 'data', 'book-meta.json');
const lookupPath = join(root, 'data', 'lookUpTable_base_0.csv');

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
/** @type {Map<number, object>} */
const books = new Map();
for (const line of readFileSync(booksPath, 'utf8').trim().split('\n')) {
  const book = JSON.parse(line);
  books.set(book.id, book);
}

/** @type {Map<string, number[]>} */
const idsByBand = new Map();
for (const [idRaw, info] of Object.entries(meta)) {
  const id = Number(idRaw);
  if (!idsByBand.has(info.band)) idsByBand.set(info.band, []);
  idsByBand.get(info.band).push(id);
}

const WEIGHT_SUM = 10_000_000_000;
const TRIMMABLE_BANDS = new Set(['good', 'big', 'huge']);
const SURPLUS_BANDS = new Set(['micro', 'small']);
/** Stop tuning once RTP is within this margin of target (players feel ~0.05% drift). */
const RTP_LOW_TOLERANCE = 0.00005;

/** @type {{ id: number, weight: number, payout: number, band: string }[]} */
const lookup = [];

for (const row of WEIGHT_PROFILE) {
  const ids = idsByBand.get(row.band) ?? [];
  if (!ids.length) {
    console.warn(`warn: no books in band "${row.band}"`);
    continue;
  }

  const bandSpinBudget = row.prob * WEIGHT_SUM;

  if (row.band === 'loss') {
    const each = Math.max(1, Math.floor(bandSpinBudget / ids.length));
    for (const id of ids) {
      lookup.push({ id, band: row.band, weight: each, payout: 0 });
    }
    continue;
  }

  const refPayout = Math.max(1, row.payoutCents || 100);
  let invSum = 0;
  for (const id of ids) {
    invSum += refPayout / Math.max(1, books.get(id).payoutMultiplier);
  }

  for (const id of ids) {
    const payout = books.get(id).payoutMultiplier;
    const share = refPayout / Math.max(1, payout);
    const weight = Math.max(1, Math.floor((bandSpinBudget * share) / invSum));
    lookup.push({ id, band: row.band, weight, payout });
  }
}

function lookupRtp(rows) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!total) return 0;
  let rtp = 0;
  for (const row of rows) rtp += (row.weight / total) * (row.payout / 100);
  return rtp;
}

/** @param {{ weight: number, payout: number, band?: string }[]} rows */
function lossRows(rows) {
  return rows.filter((row) => row.payout === 0);
}

/** @param {{ weight: number, band?: string }[]} rows */
function distributeToBands(rows, amount, bands) {
  if (amount <= 0) return;
  const targets = rows.filter((row) => bands.has(row.band));
  if (!targets.length) return;
  const each = Math.max(1, Math.floor(amount / targets.length));
  let remaining = amount;
  for (const row of targets) {
    const transfer = Math.min(remaining, each);
    if (transfer <= 0) break;
    row.weight += transfer;
    remaining -= transfer;
  }
  if (remaining > 0) {
    targets[0].weight += remaining;
  }
}

/**
 * @param {{ weight: number, payout: number, band?: string }[]} rows
 * @param {number} target
 * @param {number} max
 */
function tuneRtp(rows, target, max) {
  for (let guard = 0; guard < 200000; guard += 1) {
    const rtp = lookupRtp(rows);
    if (rtp <= max && rtp >= target - RTP_LOW_TOLERANCE) return rtp;

    const losses = lossRows(rows);
    const trimmable = rows.filter((row) => TRIMMABLE_BANDS.has(row.band) && row.payout > 0);
    if (!trimmable.length) return rtp;

    if (rtp > max) {
      trimmable.sort((a, b) => b.payout - a.payout);
      let moved = false;
      for (const row of trimmable) {
        if (row.weight <= 1) continue;
        const transfer = Math.max(1, Math.floor(row.weight * 0.08));
        row.weight -= transfer;
        distributeToBands(rows, transfer, SURPLUS_BANDS);
        moved = true;
        if (lookupRtp(rows) <= max) break;
      }
      if (!moved) return lookupRtp(rows);
      continue;
    }

    if (!losses.length) return rtp;
    const loss = losses.sort((a, b) => b.weight - a.weight)[0];
    const low = [...trimmable].sort((a, b) => a.payout - b.payout)[0];
    const transfer = Math.max(1, Math.floor(loss.weight * 0.008));
    if (loss.weight <= transfer) return rtp;
    loss.weight -= transfer;
    low.weight += transfer;
  }

  return lookupRtp(rows);
}

const rtp = tuneRtp(lookup, TARGET_RTP, MAX_RTP);

const csv = [
  'id,probability_uint64,payout_multiplier',
  ...lookup.map((row) => `${row.id},${row.weight},${row.payout}`),
].join('\n');

writeFileSync(lookupPath, `${csv}\n`, 'utf8');

const stats = analyzeLookup(
  lookup.map(({ id, weight, payout }) => ({ id, weight, payout })),
  books,
);

console.log(`Wrote ${lookup.length} lookup rows → ${lookupPath}`);
console.log(
  `RTP ${(rtp * 100).toFixed(3)}% · hit ${stats.hitRatePercent.toFixed(2)}% · σ ${stats.stdDev.toFixed(2)}× · max ${stats.maxPay.toFixed(1)}×`,
);

if (rtp > MAX_RTP) {
  console.warn(`warn: RTP ${(rtp * 100).toFixed(3)}% still above cap — reduce tail band probs or pays.`);
} else if (rtp < TARGET_RTP - RTP_LOW_TOLERANCE) {
  console.warn(`warn: RTP ${(rtp * 100).toFixed(3)}% below target — pool lacks enough weighted pay.`);
}
