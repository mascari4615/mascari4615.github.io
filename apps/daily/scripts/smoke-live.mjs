/**
 * 배포된 진짜 사이트에서 한 판 둔다 (TASK-KAR-202).
 * 로컬 스모크는 「내 dist 가 맞다」만 본다 — 「배포가 실제로 닿았다」는 여기서만 갈린다.
 *
 *   node scripts/smoke-live.mjs [주소]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? 'https://blog.mascari4615.com/daily';
const mod = await import(pathToFileURL(join(app, '../karmolab/node_modules/playwright/index.js')).href);
const pw = mod.chromium ? mod : mod.default;
const { answerOf, findItem } = await import(pathToFileURL(join(app, 'engine.mjs')).href);

const checks = [];
const check = (name, ok, note = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const browser = await pw.chromium.launch();

for (const topicId of ['pokemon', 'lol']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/${topicId}/`, { waitUntil: 'networkidle' });

  // 배포본이 쓰는 표를 그대로 받아 오늘의 정답을 따로 계산한다 — 화면과 규칙이 어긋나면 여기서 갈린다.
  const topic = await (await fetch(`${BASE}/data/${topicId}.json`)).json();
  const answer = answerOf(topic);
  const decoy = topic.items.find((i) => i.name !== answer.name);

  check(`[${topicId}] 문제 번호가 찍힌다`, /^#\d+$/.test((await page.locator('.no').textContent()).trim()));

  await page.fill('.guessbar input', decoy.name.slice(0, 2));
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${decoy.name}")`);
  await page.waitForSelector('.row');
  check(`[${topicId}] 틀린 답에 칸이 다 그려진다`, (await page.locator('.row .cell').count()) === topic.fields.length);

  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answer.name}")`);
  await page.waitForSelector('.done:not([hidden])', { timeout: 10000 });
  const done = await page.locator('.done').innerText();
  check(`[${topicId}] 맞히면 정답이 공개된다`, done.includes(answer.name), answer.name);
  check(`[${topicId}] 공유 격자에 이름이 안 샌다`, !(await page.locator('.done .grid').innerText()).includes(answer.name));

  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${topicId}] 폰 폭에서 가로로 안 넘친다`, over <= 0, `넘침 ${over}px`);
  check(`[${topicId}] 콘솔 오류 0`, errors.length === 0, errors.join(' | '));

  // 찾아지려면 검색이 보는 주소가 맞아야 한다.
  const canonical = await page.getAttribute('link[rel=canonical]', 'href');
  check(`[${topicId}] 정규 주소가 배포 주소와 같다`, canonical === `${BASE}/${topicId}/`, canonical);

  await page.screenshot({ path: join(app, `.cache/shots/live-${topicId}.png`), fullPage: true });
  await ctx.close();
  console.log(`  → 오늘의 정답: ${answer.name}`);
}

await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} 통과 (${BASE})`);
process.exit(failed ? 1 : 0);
