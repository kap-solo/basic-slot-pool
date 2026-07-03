/**
 * Serve selected npm packages to the browser for import maps (no bundler).
 */

import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.atlas': 'text/plain',
  '.skel': 'application/octet-stream',
};

/**
 * @param {string} nodeModulesRoot
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {boolean} true if handled
 */
export function tryServeVendorNpm(nodeModulesRoot, req, res, url) {
  if (req.method !== 'GET' || !url.pathname.startsWith('/vendor/npm/')) {
    return false;
  }

  const rel = decodeURIComponent(url.pathname.slice('/vendor/npm/'.length));
  const filePath = normalize(join(nodeModulesRoot, rel));
  const root = normalize(nodeModulesRoot);

  if (!filePath.startsWith(root) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return true;
  }

  const ext = extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
  return true;
}

/**
 * Wrap Suki host so `/vendor/npm/*` resolves from node_modules.
 * @param {ReturnType<import('@kap-solo/suki-engine/server/host.mjs').createSukiHost>} host
 * @param {string} gameRootDir
 */
export function attachVendorNpm(host, gameRootDir) {
  const nodeModulesRoot = join(gameRootDir, 'node_modules');
  const handler = host.server.listeners('request')[0];
  host.server.removeAllListeners('request');
  host.server.on('request', (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (tryServeVendorNpm(nodeModulesRoot, req, res, url)) return;
    handler(req, res);
  });
}
