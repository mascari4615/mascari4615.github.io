/**
 * 팔레트가 바로 내놓는 답이 **도구의 답과 같은지** (TASK-KL-110)
 *
 * 왜 있나: 팔레트가 답을 내려면 그 계산을 제 안에 한 벌 더 갖게 된다. 도구 쪽 규칙이
 * 바뀌면 두 답이 갈라지는데, 그때 사용자는 **같은 질문에 두 답**을 받는다 — 아무 답도
 * 안 주는 것보다 나쁘다. 그래서 두 곳을 실제로 굴려 값을 맞대 본다.
 *
 * 하는 일: 제 서버를 띄우고 같은 입력을 ① 팔레트에 치고 ② 그 도구를 열어 넣어 본 뒤,
 * 나온 값이 서로 들어맞는지 본다.
 *
 * 사용: node scripts/smoke-palette-answers.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const blogRoot = path.dirname(path.dirname(root));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/karmolab/' || url === '/karmolab') url = '/apps/karmolab/index.html';
  if (url.startsWith('/karmolab/t/')) url = '/apps/blog/karmolab/t/' + url.slice('/karmolab/t/'.length);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.join(blogRoot, url.replace(/^\//, ''));
  if (!file.startsWith(blogRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(file);
  const ext = path.extname(file);
  // Liquid 태그까지 걷는다 — 앞머리만 걷으면 조건문이 글자로 뜬다 (TASK-KL-201).
  if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

/** 팔레트에 치고 「답」 칸에 나온 값들을 읽는다. */
async function askPalette(q) {
  await page.goto(`${BASE}/karmolab/`, { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => Toolbox.switchPage('home'));
  await page.waitForSelector('.kp-inline .kp-input', { timeout: 15000 });
  await page.locator('.kp-inline .kp-input').fill(q);
  await page.waitForTimeout(250);
  return page.$$eval('.kp-inline .kp-answer-value', (els) => els.map((e) => e.textContent.trim()));
}

/** 그 도구를 열어 값을 넣고 화면에 나온 글을 통째로 읽는다. */
async function askTool(toolId, fills) {
  await page.goto(`${BASE}/karmolab/t/${toolId}/`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(900);
  for (const [sel, val] of fills) {
    await page.fill(sel, val).catch(() => {});
  }
  await page.waitForTimeout(700);
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
}

/* ── px → rem ────────────────────────────────────────────── */
{
  const answers = await askPalette('24px to rem');
  if (!answers.length) problems.push('「24px to rem」 을 쳤는데 답이 안 나온다');
  else {
    const mine = answers[0];
    const tool = await askTool('cssunit', [['#cuRoot', '16'], ['#cuValue', '24']]);
    if (!tool.includes(mine.replace(/\s/g, ''))) {
      problems.push(`px→rem 답이 도구와 다르다 — 팔레트 「${mine}」 인데 도구 화면에 그 값이 없다`);
    }
  }
}

/* ── 바이트 ──────────────────────────────────────────────── */
{
  const answers = await askPalette('1024kb');
  if (!answers.length) problems.push('「1024kb」 를 쳤는데 답이 안 나온다');
  else {
    const tool = await askTool('bytesize', [['#bsValue', '1024']]);
    // 도구는 단위를 골라야 하므로 값만 견준다 (1024KB = 1.024MB · 1000000 바이트 계열)
    const nums = answers.map((a) => a.replace(/[^\d.]/g, '')).filter(Boolean);
    if (!nums.some((n) => tool.includes(n))) {
      problems.push(`바이트 답이 도구와 다르다 — 팔레트 「${answers.join(', ')}」 중 어느 값도 도구 화면에 없다`);
    }
  }
}

/* ── 색 ──────────────────────────────────────────────────── */
{
  const answers = await askPalette('#7dd3fc');
  if (!answers.length) problems.push('「#7dd3fc」 를 쳤는데 답이 안 나온다');
  else if (!/rgb\(125, 211, 252\)/.test(answers[0])) {
    problems.push(`색 답이 틀렸다 — 「${answers[0]}」 (rgb(125, 211, 252) 여야 한다)`);
  }
}

/* ── 답이 있어도 도구 줄이 사라지지 않는다 ──────────────── */
{
  await askPalette('24px to rem');
  const sections = await page.$$eval('.kp-inline .kp-section', (els) => els.map((e) => e.textContent.trim()));
  if (!sections.includes('답')) problems.push('「답」 칸 이름표가 없다');
  const rows = await page.$$eval('.kp-inline .kp-row', (els) => els.length);
  const answerRows = await page.$$eval('.kp-inline .kp-row-answer', (els) => els.length);
  if (rows <= answerRows) problems.push('답만 있고 도구 줄이 사라졌다 — 더 손보러 갈 길이 막힌다');
}

/* ── 평범한 낱말은 답을 만들지 않는다 (오탐 방지) ────────── */
{
  const answers = await askPalette('이미지');
  if (answers.length) problems.push(`평범한 말에 엉뚱한 답이 붙었다 — 「이미지」 → ${answers.join(', ')}`);
}

await browser.close();
server.close();

if (problems.length) {
  console.error(`[smoke-palette-answers] 문제 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log('[smoke-palette-answers] 답 3종(길이·용량·색) 도구와 일치 · 도구 줄 유지 · 오탐 0');
