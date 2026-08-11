import { launchOrSkip } from './lib/browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const port = 8834;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(repoRoot, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end('no');
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(port, resolve));

const browser = await launchOrSkip('i18n-lazy-shell');
if (!browser) process.exit(0);
const errors = [];
const page = await browser.newPage();
page.on('console', (message) => {
  const text = message.text();
  if (text.includes('[i18n]')) errors.push(`console: ${text}`);
});
page.on('pageerror', (error) => errors.push(`page: ${error?.message || error}`));

try {
  await page.goto(`http://127.0.0.1:${port}/apps/karmolab/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof Toolbox !== 'undefined' && typeof Toolbox.switchPage === 'function', null, { timeout: 10000 });
  for (const tab of ['settings-display', 'settings-mascot', 'settings-data']) {
    await page.evaluate((tabId) => {
      Toolbox.switchPage('settings');
      Toolbox.switchTab(tabId);
    }, tab);
    await page.waitForTimeout(350);
  }
  if (errors.length) {
    console.error(`[i18n-lazy-shell] failed with ${errors.length} runtime errors`);
    for (const error of [...new Set(errors)].slice(0, 12)) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    console.log('[i18n-lazy-shell] settings lazy load and all tabs passed');
  }
} finally {
  await page.close();
  await browser.close();
  server.close();
}
