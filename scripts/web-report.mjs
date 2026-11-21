/**
 * Checks the web build (dist/web, our own subdomain): it must carry the Support us link and the studio's stats endpoint, and
 * must not load the CrazyGames SDK (no portal ads or banners on our own site). Exits with 1 when a rule is broken, so
 * `npm run build:web` fails.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../dist/web/', import.meta.url).pathname;
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|html|css)$/.test(f)) files.push(p);
  }
};
walk(dir);
const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');

const problems = [];
if (!text.includes('https://nalbakigames.com/support')) problems.push('the Support us link (https://nalbakigames.com/support) is missing');
if (!text.includes('https://stats.nalbakigames.com/v1/b')) problems.push('the stats endpoint (https://stats.nalbakigames.com/v1/b) is missing');
if (/sdk\.crazygames\.com|crazygames-sdk/i.test(text)) problems.push('the CrazyGames SDK is referenced');
if (!readFileSync(join(dir, 'index.html'), 'utf8').includes('id="root"')) problems.push('index.html has no #root');

if (problems.length) {
  console.error('Web build problems:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Web checks passed (${files.length} files): support link, stats endpoint, no CrazyGames SDK.`);
