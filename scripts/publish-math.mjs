/**
 * Build a Stake Engine math upload folder.
 *
 * Stake ACP requires these files in the upload directory root:
 *   - index.json
 *   - lookUpTable_<mode>_0.csv
 *   - books_<mode>.jsonl.zst
 *
 * Usage: node scripts/publish-math.mjs
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, 'data');
const publishDir = join(dataDir, 'publish');

const zstdCompress = promisify(zlib.zstdCompress);

const MODES = [
  {
    name: 'base',
    cost: 1.0,
    booksJsonl: join(dataDir, 'books_base.jsonl'),
    booksZst: join(dataDir, 'books_base.jsonl.zst'),
    lookupCsv: join(dataDir, 'lookUpTable_base_0.csv'),
    publishLookup: join(publishDir, 'lookUpTable_base_0.csv'),
    publishBooksZst: join(publishDir, 'books_base.jsonl.zst'),
    events: 'books_base.jsonl.zst',
    weights: 'lookUpTable_base_0.csv',
    required: true,
  },
  {
    name: 'bb',
    cost: 20.0,
    booksJsonl: join(dataDir, 'books_buy.jsonl'),
    booksZst: join(dataDir, 'books_buy.jsonl.zst'),
    lookupCsv: join(dataDir, 'lookUpTable_buy_0.csv'),
    publishLookup: join(publishDir, 'lookUpTable_buy_0.csv'),
    publishBooksZst: join(publishDir, 'books_buy.jsonl.zst'),
    events: 'books_buy.jsonl.zst',
    weights: 'lookUpTable_buy_0.csv',
    required: false,
  },
];

function requireFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }
}

/** Stake ACP rejects header rows — uint64 data lines only. */
function stakeLookupCsv(sourcePath) {
  const lines = readFileSync(sourcePath, 'utf8').trim().split('\n').filter(Boolean);
  const dataLines = lines.filter((line) => /^\d+,/.test(line));
  if (!dataLines.length) {
    throw new Error(`No lookup data rows in ${sourcePath}`);
  }
  return `${dataLines.join('\n')}\n`;
}

async function main() {
  /** @type {object[]} */
  const stakeModes = [];

  for (const mode of MODES) {
    if (!existsSync(mode.booksJsonl) || !existsSync(mode.lookupCsv)) {
      if (mode.required) {
        throw new Error(`Missing ${mode.name} math — run npm run math:build first`);
      }
      console.log(`Skipping ${mode.name} mode (run npm run math:buy to include)`);
      continue;
    }

    const raw = readFileSync(mode.booksJsonl);
    const compressed = await zstdCompress(raw);
    writeFileSync(mode.booksZst, compressed);
    mkdirSync(publishDir, { recursive: true });
    writeFileSync(mode.publishLookup, stakeLookupCsv(mode.lookupCsv));
    writeFileSync(mode.publishBooksZst, compressed);

    stakeModes.push({
      name: mode.name,
      cost: mode.cost,
      events: mode.events,
      weights: mode.weights,
    });

    console.log(`${mode.name}: ${compressed.length} bytes zst, ${stakeLookupCsv(mode.lookupCsv).trim().split('\n').length} lookup rows`);
  }

  const stakeIndex = { modes: stakeModes };
  const publishIndex = join(publishDir, 'index.json');
  writeFileSync(join(dataDir, 'index.json'), `${JSON.stringify(stakeIndex, null, 2)}\n`);
  writeFileSync(publishIndex, `${JSON.stringify(stakeIndex, null, 2)}\n`);

  console.log('\nStake math bundle ready.');
  console.log(`  index:   ${publishIndex}`);
  console.log('Upload the contents of data/publish/ to Stake Engine ACP.');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
