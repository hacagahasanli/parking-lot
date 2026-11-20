/**
 * Portal capture tooling (not part of the game). Needs playwright-core and its Chromium: install them in a scratch folder
 * (npm i playwright-core@1.65.0) and run from there. Start `npm run dev:portal` first (port 3201); load.mjs needs serve.mjs.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname } from 'node:path';
const root = process.argv[2];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
createServer((req, res) => {
  // Served under a sub-path, as portals do: /games/parking-lot/...
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/games\/parking-lot/, '');
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  let body = readFileSync(f);
  const h = { 'content-type': types[extname(f)] ?? 'application/octet-stream' };
  if (/gzip/.test(req.headers['accept-encoding'] ?? '') && /\.(js|css|html)$/.test(f)) { body = gzipSync(body); h['content-encoding'] = 'gzip'; }
  res.writeHead(200, h); res.end(body);
}).listen(3202, () => console.log('ready'));
