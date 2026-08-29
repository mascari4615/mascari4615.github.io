import { launchOrSkip } from './lib/browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(repoRoot, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end('no');
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
/* 붙박이 번호(8834)를 쓰다가 2026-08-22 에 남의 서버를 읽었다. 어제부터 떠 있던 전부 404
   서버가 IPv4 로 그 자리를 쥐고 있었고, listen 은 IPv6 로 잡혀 부딪히지도 않았다. 그래서 이
   검사만 404 를 받아 셸이 안 뜬다고 했다(교훈 정본: feedback_fixed_port_reads_other_session_server).
   운영체제에게 빈 자리를 받는다. 남과 겹칠 수 없다. */
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

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
