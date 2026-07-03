/**
 * Validate cascade book events against cluster math.
 * Run: node scripts/validate-cascade-books.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGravity,
  cascadeMultiplier,
  clusterBaseMultiplier,
  findPayingClusters,
  quantizeWinMult,
  removeCells,
} from '../math/cluster.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const booksPath = join(root, 'data', 'books_base.jsonl');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sortedEvents(book) {
  return [...book.events].sort((a, b) => a.index - b.index);
}

for (const line of readFileSync(booksPath, 'utf8').trim().split('\n')) {
  const book = JSON.parse(line);
  const events = sortedEvents(book);
  const reveal = events.find((e) => e.type === 'gameReveal');
  assert(reveal, `book ${book.id}: missing gameReveal`);

  let board = reveal.board.map((col) => [...col]);
  let cascade = 0;
  let totalMult = 0;

  for (const event of events) {
    if (event.type === 'clusterWin') {
      cascade += 1;
      assert(event.cascade === cascade, `book ${book.id}: cascade index mismatch`);
      assert(
        event.cascadeMultiplier === cascadeMultiplier(cascade),
        `book ${book.id}: wrong ladder at cascade ${cascade}`,
      );

      const expected = findPayingClusters(board);
      assert(expected.length > 0, `book ${book.id}: clusterWin but no paying clusters`);
      let stepMult = 0;
      for (const cluster of expected) {
        stepMult += clusterBaseMultiplier(cluster.symbol, cluster.size) * event.cascadeMultiplier;
      }
      stepMult = quantizeWinMult(stepMult);
      assert(
        Math.abs(stepMult - event.stepMultiplier) < 0.001,
        `book ${book.id}: stepMultiplier mismatch (${event.stepMultiplier} vs ${stepMult})`,
      );
      totalMult += stepMult;

      const removed = new Set(event.removed.map(([c, r]) => `${c},${r}`));
      for (const cluster of expected) {
        for (const cell of cluster.cells) {
          assert(removed.has(`${cell[0]},${cell[1]}`), `book ${book.id}: missing removed cell`);
        }
      }

      board = removeCells(board, event.removed);
      board = applyGravity(board);
      continue;
    }

    if (event.type === 'tumble') {
      assert(event.fills?.length, `book ${book.id}: tumble missing fills`);
      for (const fill of event.fills) {
        assert(
          event.board[fill.col][fill.row] === fill.symbol,
          `book ${book.id}: fill mismatch at ${fill.col},${fill.row}`,
        );
      }
      board = event.board.map((col) => [...col]);
      continue;
    }

    if (event.type === 'setTotalWin') {
      assert(
        event.amount === book.payoutMultiplier,
        `book ${book.id}: setTotalWin amount mismatch`,
      );
      assert(
        Math.abs(totalMult - book.payoutMultiplier / 100) < 0.001,
        `book ${book.id}: total multiplier mismatch`,
      );
    }
  }

  const wins = events.filter((e) => e.type === 'clusterWin').length;
  console.log(
    `book ${book.id}: ok · ${wins} cascade(s) · total ${book.payoutMultiplier / 100}×`,
  );
}

console.log('All cascade books valid.');
