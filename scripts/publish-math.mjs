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

const booksJsonl = join(dataDir, 'books_base.jsonl');
const booksZst = join(dataDir, 'books_base.jsonl.zst');
const lookupCsv = join(dataDir, 'lookUpTable_base_0.csv');
const indexPath = join(dataDir, 'index.json');
const publishIndex = join(publishDir, 'index.json');
const publishLookup = join(publishDir, 'lookUpTable_base_0.csv');
const publishBooksZst = join(publishDir, 'books_base.jsonl.zst');

const zstdCompress = promisify(zlib.zstdCompress);

const stakeIndex = {
  modes: [
    {
      name: 'base',
      cost: 1.0,
      events: 'books_base.jsonl.zst',
      weights: 'lookUpTable_base_0.csv',
    },
  ],
};

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
  requireFile(booksJsonl, 'books JSONL — run npm run math:build first');
  requireFile(lookupCsv, 'lookup CSV — run npm run tune:lookup first');

  const raw = readFileSync(booksJsonl);
  const compressed = await zstdCompress(raw);
  writeFileSync(booksZst, compressed);

  writeFileSync(indexPath, `${JSON.stringify(stakeIndex, null, 2)}\n`);

  mkdirSync(publishDir, { recursive: true });
  writeFileSync(publishIndex, `${JSON.stringify(stakeIndex, null, 2)}\n`);
  writeFileSync(publishLookup, stakeLookupCsv(lookupCsv));
  writeFileSync(publishBooksZst, compressed);

  console.log('Stake math bundle ready.');
  console.log(`  index:   ${publishIndex}`);
  console.log(`  weights: ${publishLookup}`);
  console.log(`  events:  ${publishBooksZst} (${compressed.length} bytes)`);
  console.log('');
  console.log('Upload the contents of data/publish/ to Stake Engine ACP (not math/ or scripts/).');
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
