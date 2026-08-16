/**
 * **화면낭독기·대비 관문** — 그려진 뒤를 본다 (2026-08-16)
 *
 * 왜 또 만드나 — `smoke-contrast` 와 뭐가 다른가:
 *   `smoke-contrast` 는 **「글씨가 안 보이나」** 를 본다(흰 바탕에 흰 글씨). 기준이 2.2:1 인 것은
 *   실수가 아니라 그 목적에 맞춘 값이다 — 전 도구 × 양쪽 판을 도는 대신 바를 낮게 잡았다.
 *   그래서 3.16:1 짜리 흐린 글자는 그 검사를 **정당하게** 통과한다. 초록이지만 표준(WCAG AA
 *   4.5:1) 아래다. 아무도 표준을 안 재고 있었다는 뜻이다.
 *
 *   이 검사는 반대다. 화면 수는 적게(핵심 3장), 대신 **axe-core 전 규칙**을 건다 —
 *   대비뿐 아니라 이름표·랜드마크·역할까지. 둘은 겹치지 않는다: 넓고 얕은 것 하나,
 *   좁고 깊은 것 하나.
 *
 * 못 잰 것은 통과가 아니다 — axe 나 브라우저가 없으면 **끝값 2(CANNOT-RUN)**.
 */
import fs from 'node:fs';
import { stripFrontMatter } from './lib/serve-html.mjs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const PORT = Number(process.env.PORT || 4547);
const THEMES = (process.env.THEMES || 'light,dark').split(',');
const AXE = path.join(root, 'node_modules', 'axe-core', 'axe.min.js');

/* 핵심 3장 — 첫 화면 · 도구 한 장(입력칸이 많은 것) · 도구 목록. */
const SCREENS = [
  ['첫 화면', '/apps/karmolab/'],
  ['도구 한 장', '/apps/karmolab/#passgen'],
  ['도구 목록', '/apps/karmolab/#tools'],
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

if (fs.existsSync(AXE) === false) {
  console.error(`[smoke-a11y] 못 돌았다 — axe-core 가 없다 (${AXE}). npm i -D axe-core`);
  process.exit(2);
}
const axeSource = fs.readFileSync(AXE, 'utf8');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(repoRoot, p);
  if (!file.startsWith(repoRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  /* ★ Jekyll 앞머리는 **떼고** 낸다 — 안 떼면 브라우저가 그 줄들을 본문 글자로 읽고
     `<head>` 가 닫힌 것으로 친다. 그러면 이 검사가 **배포와 다른 화면**을 재게 된다. */
  if (path.extname(file) === '.html') {
    res.end(stripFrontMatter(fs.readFileSync(file, 'utf8')));
    return;
  }
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error(`[smoke-a11y] 못 돌았다 — 브라우저를 못 띄운다 (${String(err).split('\n')[0].slice(0, 80)})`);
  server.close();
  process.exit(2);
}

const failures = [];
for (const theme of THEMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => { try { localStorage.setItem('toolbox_theme', t); } catch { /* 사생활 모드 */ } }, theme);
  for (const [name, url] of SCREENS) {
    await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'load' });
    await page.waitForTimeout(1800);   // 늦게 오는 조각까지 붙은 뒤에 본다
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const r = await window.axe.run(document, { resultTypes: ['violations'] });
      return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help,
        sample: (v.nodes[0]?.target || []).join(' ') }));
    });
    for (const v of violations) failures.push({ theme, name, ...v });
  }
  await ctx.close();
}
await browser.close();
server.close();

/* ★ 기준선(래칫). 처음 켰더니 36곳이 이미 어겨져 있었다 — 다 고칠 때까지 게이트를 안 켜면
   그 사이에 **새로 생기는 것**도 못 막는다. 그래서 「지금보다 늘면 빨강」으로 켠다.
   기준선은 오직 내려가야 한다: 줄었으면 그렇게 말하고 다시 적으라고 시킨다.
   `--bless` 로만 다시 적는다 — 자동으로 올라가면 그건 래칫이 아니다. */
const BASELINE = path.join(root, 'data', 'a11y-axe-baseline.json');
const key = (f) => `${f.theme}|${f.name}|${f.id}`;
const now = {};
for (const f of failures) now[key(f)] = (now[key(f)] || 0) + f.n;

if (process.argv.includes('--bless')) {
  fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
  fs.writeFileSync(BASELINE, JSON.stringify(now, null, 1) + '\n', 'utf8');
  console.log(`[smoke-a11y] 기준선을 다시 적었다 — ${Object.keys(now).length}종 / ${Object.values(now).reduce((a, b) => a + b, 0)}곳`);
  process.exit(0);
}

let base = null;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch {
  console.error(`[smoke-a11y] 못 돌았다 — 기준선이 없다 (${path.relative(root, BASELINE)}). 처음이면 --bless.`);
  process.exit(2);
}

const 늘어난것 = [];
const 본것 = new Set();
for (const f of failures) {
  const k = key(f);
  if (본것.has(k)) continue;
  본것.add(k);
  const before = base[k] || 0;
  if (now[k] > before) 늘어난것.push({ f, before, after: now[k] });
}
const 줄어든것 = Object.entries(base).filter(([k, v]) => (now[k] || 0) < v);

if (늘어난것.length > 0) {
  console.error(`\n[smoke-a11y] 접근성 위반이 **늘었다** ${늘어난것.length}건
`);
  for (const { f, before, after } of 늘어난것) {
    console.error(`  ${f.theme.padEnd(5)} ${f.name}  [${f.impact}] ${f.id}  ${before} → ${after}`);
    console.error(`        ${f.help}`);
    console.error(`        예: ${f.sample.slice(0, 90)}`);
  }
  console.error('\n색·이름표를 자리마다 박지 말고 토큰·공용 뼈대(shared/markup.ts)를 쓴다.\n');
  process.exit(1);
}

const 총 = Object.values(now).reduce((a, b) => a + b, 0);
const 기준 = Object.values(base).reduce((a, b) => a + b, 0);
if (줄어든것.length > 0) {
  console.log(`[smoke-a11y] 줄었다 ${기준} → ${총}곳 — 기준선을 다시 적어라: npm run test:a11y -- --bless`);
  process.exit(0);
}
console.log(`[smoke-a11y] ${SCREENS.length}장 × ${THEMES.join('/')} — 늘지 않았다 (남은 빚 ${총}곳)`);
