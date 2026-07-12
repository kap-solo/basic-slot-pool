/**
 * Assign buy lookup weights — target ~96% RTP at 20× play cost.
 * Run: node scripts/tune-buy-lookup.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUY_COST_MULT,
  BUY_MAX_RTP,
  BUY_TARGET_RTP,
  BUY_WEIGHT_PROFILE,
} from '../math/buy-weight-profile.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_buy.jsonl');
const metaPath = join(root, 'data', 'buy-book-meta.json');
const lookupPath = join(root, 'data', 'lookUpTable_buy_0.csv');

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

const WEIGHT_SUM = 1_000_000_000;
const TRIMMABLE_BANDS = new Set(['buy_peak', 'buy_rare']);
const SURPLUS_BANDS = new Set(['buy_low', 'buy_core']);
const RTP_TOLERANCE = 0.0005;

/** @type {{ id: number, weight: number, payout: number, band: string }[]} */
const lookup = [];

for (const row of BUY_WEIGHT_PROFILE) {
  const ids = idsByBand.get(row.band) ?? [];
  if (!ids.length) {
    console.warn(`warn: no books in band "${row.band}"`);
    continue;
  }

  const bandSpinBudget = row.prob * WEIGHT_SUM;
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

function buyLookupRtp(rows) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!total) return 0;
  let meanMult = 0;
  for (const row of rows) meanMult += (row.weight / total) * (row.payout / 100);
  return meanMult / BUY_COST_MULT;
}

function buyLookupMean(rows) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!total) return 0;
  let meanMult = 0;
  for (const row of rows) meanMult += (row.weight / total) * (row.payout / 100);
  return meanMult;
}

let rtp = buyLookupRtp(lookup);
console.log(`Initial buy RTP ${(rtp * 100).toFixed(3)}% · mean ${buyLookupMean(lookup).toFixed(2)}×`);

if (rtp > BUY_MAX_RTP) {
  let surplus = 0;
  for (const row of lookup) {
    if (!TRIMMABLE_BANDS.has(row.band)) continue;
    const trim = Math.floor(row.weight * 0.35);
    row.weight -= trim;
    surplus += trim;
  }
  const receivers = lookup.filter((row) => SURPLUS_BANDS.has(row.band));
  const recvTotal = receivers.reduce((sum, row) => sum + row.weight, 0) || 1;
  for (const row of receivers) {
    row.weight += Math.floor((surplus * row.weight) / recvTotal);
  }
  rtp = buyLookupRtp(lookup);
  console.log(`Trimmed tail → RTP ${(rtp * 100).toFixed(3)}%`);
}

for (let pass = 0; pass < 48 && rtp < BUY_TARGET_RTP - RTP_TOLERANCE; pass += 1) {
  const receivers = lookup.filter((row) => TRIMMABLE_BANDS.has(row.band));
  if (!receivers.length) break;
  for (const row of receivers) {
    row.weight += Math.max(1, Math.floor(row.weight * 0.04));
  }
  rtp = buyLookupRtp(lookup);
}

for (let pass = 0; pass < 48 && rtp > BUY_MAX_RTP; pass += 1) {
  const donors = lookup.filter((row) => TRIMMABLE_BANDS.has(row.band));
  if (!donors.length) break;
  let moved = 0;
  for (const row of donors) {
    const cut = Math.max(1, Math.floor(row.weight * 0.05));
    row.weight -= cut;
    moved += cut;
  }
  const receivers = lookup.filter((row) => SURPLUS_BANDS.has(row.band));
  const recvTotal = receivers.reduce((sum, row) => sum + row.weight, 0) || 1;
  for (const row of receivers) {
    row.weight += Math.floor((moved * row.weight) / recvTotal);
  }
  rtp = buyLookupRtp(lookup);
}

const lines = lookup.map((row) => `${row.id},${row.weight},${row.payout}`);
writeFileSync(lookupPath, `${lines.join('\n')}\n`);

const mean = buyLookupMean(lookup);
console.log(`Wrote ${lookup.length} rows → ${lookupPath}`);
console.log(`  buy RTP       ${(rtp * 100).toFixed(2)}% @ ${BUY_COST_MULT}× cost`);
console.log(`  mean feature  ${mean.toFixed(2)}× base bet`);
