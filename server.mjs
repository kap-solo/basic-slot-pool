import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSukiHost, resolveSukiPackageDir } from '@kap-solo/suki-engine/server/host.mjs';
import { createGameMockRgs } from './server/game-rgs.mjs';
import { attachVendorNpm } from './server/vendor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const host = createSukiHost({
  rootDir: __dirname,
  rgs: createGameMockRgs(),
  sukiPackageDir: resolveSukiPackageDir(__dirname),
  label: 'Reflecting Pool',
});

attachVendorNpm(host, __dirname);
host.listen();
