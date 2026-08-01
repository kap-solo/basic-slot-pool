/**
 * Correct MIME types for game static assets (Suki host defaults SVG to octet-stream).
 */

import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
};

/**
 * @param {string} gameRootDir
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {boolean}
 */
export function tryServeGameAssetMime(gameRootDir, req, res, url) {
  if (req.method !== 'GET') return false;

  const ext = extname(url.pathname).toLowerCase();
  const contentType = MIME[ext];
  if (!contentType) return false;

  const root = normalize(gameRootDir);
  const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
  const filePath = normalize(join(root, rel));
  if (!filePath.startsWith(root) || !existsSync(filePath)) return false;

  res.writeHead(200, { 'Content-Type': contentType });
  res.end(readFileSync(filePath));
  return true;
}

/**
 * @param {ReturnType<import('@kap-solo/suki-engine/server/host.mjs').createSukiHost>} host
 * @param {string} gameRootDir
 */
export function attachGameAssetMime(host, gameRootDir) {
  const handler = host.server.listeners('request')[0];
  host.server.removeAllListeners('request');
  host.server.on('request', (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    if (tryServeGameAssetMime(gameRootDir, req, res, url)) return;
    handler(req, res);
  });
}
