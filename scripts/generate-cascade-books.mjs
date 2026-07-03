/**
 * Generate cascade books for mock RGS — increasing ladder multipliers.
 * Run: node scripts/generate-cascade-books.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mulberry32,
  createSymbolRng,
  randomBoard,
  simulateCascadeRound,
} from '../math/cluster.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_base.jsonl');

/** @type {{ id: number, targetMult: number, label: string }[]} */
const TARGETS = [
  { id: 1, targetMult: 0, label: 'loss' },
  { id: 2, targetMult: 1, label: 'cherry cascade ×1' },
  { id: 3, targetMult: 2, label: 'star cascade ×2' },
  { id: 4, targetMult: 5, label: 'multi cascade ×5' },
];

function findBook(target, startSeed = 1) {
  for (let seed = startSeed; seed < startSeed + 200_000; seed += 1) {
    const rng = mulberry32(seed);
    const nextSymbol = createSymbolRng(rng);
    const initial = randomBoard(nextSymbol);
    const result = simulateCascadeRound(initial, nextSymbol);
    const mult = result.totalMultiplier;

    if (target.targetMult === 0 && mult === 0) {
      return { seed, ...result };
    }
    if (target.id === 4) {
      if (mult >= 4.5 && mult <= 5.5 && result.cascadeSteps >= 2) {
        return { seed, ...result };
      }
      continue;
    }
    if (target.targetMult > 0 && Math.abs(mult - target.targetMult) < 0.001) {
      return { seed, ...result };
    }
  }
  throw new Error(`Could not generate book ${target.id} (${target.label})`);
}

/** @type {object[]} */
const books = [];

for (const target of TARGETS) {
  const generated = findBook(target, target.id * 10_000);
  books.push({
    id: target.id,
    payoutMultiplier: generated.payoutMultiplier,
    events: generated.events,
  });
  console.log(
    `book ${target.id}: seed ${generated.seed} · ${target.label} · ${generated.cascadeSteps} cascade step(s) · mult ${generated.totalMultiplier}`,
  );
}

writeFileSync(
  booksPath,
  `${books.map((book) => JSON.stringify(book)).join('\n')}\n`,
  'utf8',
);

console.log(`Wrote ${books.length} books → ${booksPath}`);
