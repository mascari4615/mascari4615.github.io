/**
 * 진짜 브라우저에서 한 판 끝까지 둔다 (TASK-KAR-202).
 * 단위 시험은 규칙만 본다 — 「화면에서 실제로 두어진다」는 여기서만 갈린다.
 *
 *   node scripts/smoke.mjs
 *
 * playwright 는 이웃 앱(apps/karmolab)의 것을 빌려 쓴다. 이 앱은 의존성 0 을 유지한다.
 */
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';
import { answerOf, findItem } from '../engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const shots = join(app, '.cache/shots');
const pwModule = await import(pathToFileURL(join(app, '../karmolab/node_modules/playwright/index.js')).href);
const pw = pwModule.chromium ? pwModule : pwModule.default; // CJS 라 default 로 들어오는 경우가 있다

const checks = [];
const check = (name, ok, note = '') => {
  checks.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/daily`;
mkdirSync(shots, { recursive: true });

const browser = await pw.chromium.launch();

async function playTopic(topicId, { width, height, tag }) {
  const topic = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
  const answer = answerOf(topic);
  const decoy = topic.items.find((i) => i.name !== answer.name);

  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/${topicId}/`, { waitUntil: 'networkidle' });

  check(`[${tag}] 문제 번호가 찍힌다`, /^#\d+$/.test((await page.locator('.no').textContent()).trim()));

  // 틀린 답 하나 — 줄이 생기고 칸 수가 속성 수와 같아야 한다.
  await page.fill('.guessbar input', decoy.name.slice(0, 2));
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${decoy.name}")`);
  await page.waitForSelector('.row');
  const cellCount = await page.locator('.row').first().locator('.cell').count();
  check(`[${tag}] 추측 한 줄이 속성 칸을 다 그린다`, cellCount === topic.fields.length, `${cellCount}칸`);
  check(`[${tag}] 아직 안 끝났다`, await page.locator('.done').isHidden());

  await page.screenshot({ path: join(shots, `${topicId}-${tag}-playing.png`), fullPage: true });

  // 정답을 넣는다.
  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answer.name}")`);
  await page.waitForSelector('.done:not([hidden])');

  const doneText = await page.locator('.done').innerText();
  check(`[${tag}] 맞히면 정답이 공개된다`, doneText.includes(answer.name));
  check(`[${tag}] 몇 번 만에 맞혔는지 말한다`, /2번 만에/.test(doneText), doneText.split('\n')[0]);
  const grid = await page.locator('.done .grid').innerText();
  check(`[${tag}] 공유 격자에 이름이 안 샌다`, !grid.includes(answer.name) && /🟩/.test(grid));

  await page.screenshot({ path: join(shots, `${topicId}-${tag}-done.png`), fullPage: true });

  // 새로고침해도 오늘 진행이 남아야 한다.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.done:not([hidden])');
  check(`[${tag}] 새로고침해도 오늘 결과가 남는다`, (await page.locator('.row').count()) === 2);

  // 가로 넘침 = 모바일에서 제일 흔한 사고.
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${tag}] 가로로 안 넘친다`, over <= 0, `넘침 ${over}px`);
  check(`[${tag}] 콘솔 오류 0`, errors.length === 0, errors.join(' | '));

  await ctx.close();
}

await playTopic('pokemon', { width: 1000, height: 900, tag: 'desktop' });
await playTopic('pokemon', { width: 360, height: 780, tag: 'mobile' });
await playTopic('lol', { width: 360, height: 780, tag: 'mobile' });

// 허브
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
check('허브가 주제를 다 건다', (await page.locator('.card').count()) >= 2);
await page.screenshot({ path: join(shots, 'hub.png'), fullPage: true });
await ctx.close();

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 통과 · 스샷 ${shots}`);
process.exit(failed.length ? 1 : 0);
