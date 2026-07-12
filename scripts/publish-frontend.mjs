/**
 * Build Stake Engine frontend upload folder for Reflecting Pool.
 *
 * Delegates to Suki Engine publish-frontend when available, otherwise uses
 * the sibling monorepo checkout.
 *
 * Usage: node scripts/publish-frontend.mjs [outDir]
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = process.argv[2] ? join(root, process.argv[2]) : join(root, 'dist');

const candidates = [
  join(root, 'node_modules', '@kap-solo', 'suki-engine', 'tools', 'publish-frontend.mjs'),
  join(root, '..', 'Suki-Engine', 'tools', 'publish-frontend.mjs'),
];

const script = candidates.find((path) => existsSync(path));
if (!script) {
  console.error('publish-frontend.mjs not found.');
  console.error('Bump @kap-solo/suki-engine or keep Suki-Engine as a sibling directory.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [script, root, outDir], { stdio: 'inherit' });
process.exit(result.status ?? 1);
