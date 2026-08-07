/**
 * 배포된 진짜 사이트에서 한 판 둔다 (TASK-KAR-202).
 * 로컬 스모크는 「내 dist 가 맞다」만 본다 — 「배포가 실제로 닿았다」는 여기서만 갈린다.
 *
 *   node scripts/smoke-live.mjs [주소]
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.argv[2] ?? 'https://blog.mascari4615.com/daily';
// 내 기계에서는 이웃 앱의 playwright 를 빌려 쓴다. CI 에는 그 이웃이 없으니 어디 있는지 알려 준다.
// (이게 없어서 이 검사는 여태 **내 기계에서만** 돌 수 있었다 — 내가 안 돌리면 아무도 안 봤다.)
const pwPath = process.env.DAILY_PLAYWRIGHT
  ? join(app, process.env.DAILY_PLAYWRIGHT)
  : join(app, '../karmolab/node_modules/playwright/index.js');
const mod = await import(pathToFileURL(pwPath).href);
const pw = mod.chromium ? mod : mod.default;
const { answerOf, findItem } = await import(pathToFileURL(join(app, 'engine.mjs')).href);

const checks = [];
const check = (name, ok, note = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

// 빨개졌을 때 무엇이 어떻게 보였는지가 유일한 단서다 — 폴더가 없으면 스샷이 조용히 안 남는다.
mkdirSync(join(app, `.cache/shots`), { recursive: true });

const browser = await pw.chromium.launch();

for (const topicId of ['pokemon', 'lol', 'genshin']) {
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

  await page.screenshot({ path: join(app, `.cache/shots/live-${topicId}.png`), fullPage: true, timeout: 8000 }).catch(() => {});
  await ctx.close();
  console.log(`  → 오늘의 정답: ${answer.name}`);
}

/**
 * 기본 흐름 말고 **다른 판들도 실제로 살아 있는지** — 로컬에서 되는 것과 배포된 것은 다른 일이다.
 * 실루엣·지난 문제·연습은 여태 배포 뒤 확인이 없었다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}/pokemon/silhouette/`, { waitUntil: 'networkidle' });
  const dark = await page.$eval('.shot img', (el) => el.style.filter);
  check('[실루엣] 처음엔 까맣다', /brightness\(0/.test(dark), dark);
  const shown = await page.$eval('.shot img', (el) => el.complete && el.naturalWidth > 0);
  check('[실루엣] 그림이 실제로 받아진다', shown);

  const topic = await (await fetch(`${BASE}/data/pokemon.json`)).json();
  const yKey = new Date(Date.now() - 86400000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const yAnswer = answerOf(topic, new Date(Date.now() - 86400000));

  await page.goto(`${BASE}/pokemon/past/`, { waitUntil: 'networkidle' });
  const past = await page.locator('#past').innerText();
  check('[지난문제] 어제 답이 보인다', past.includes(yAnswer.name), yAnswer.name);
  check('[지난문제] 오늘 답은 안 보인다', !past.includes(answerOf(topic).name));
  check('[지난문제] 그날로 가는 길이 있다', (await page.locator('table.past .play').count()) > 5);

  await page.goto(`${BASE}/pokemon/?d=${yKey}`, { waitUntil: 'networkidle' });
  check('[연습] 어제 판이 열린다', /연습/.test(await page.locator('.tabs').innerText()));
  await page.fill('.guessbar input', yAnswer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${yAnswer.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  check('[연습] 그날 정답으로 맞혀진다', (await page.locator('.done').innerText()).includes(yAnswer.name));

  /**
   * ★ 허브가 **우리 허브인지**. 블로그 쪽에 같은 주소를 쓰는 페이지가 생기면 통째로 덮인다 —
   * 실제로 사이드바 입구를 만들다 `/daily/` 를 덮어써서 무한 새로고침 페이지가 됐다.
   * 200 만 보면 절대 안 잡힌다.
   */
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const cards = await page.locator('.card').count();
  check('[허브] 판을 다 건다', cards >= 6, `${cards}장`);
  check(
    '[허브] ★ 다른 페이지에 덮이지 않았다',
    !(await page.content()).includes('jekyll-theme-chirpy'),
    cards === 0 ? '블로그 페이지가 이 주소를 먹었다' : '우리 허브가 맞다',
  );
  /**
   * 블로그 사이드바 입구 — 200 만 봐서는 「빈 안내 페이지에 머무는지」를 모른다.
   * 이 자리는 한 번 게임 허브를 통째로 덮은 적이 있어서, 실제로 넘어가는지까지 본다.
   */
  const site = BASE.replace(/\/daily$/, '');
  await page.goto(`${site}/daily-go/`, { waitUntil: 'networkidle' });
  await page.waitForURL((u) => u.pathname === '/daily/', { timeout: 8000 }).catch(() => {});
  check('[입구] 사이드바 입구가 게임으로 넘긴다', new URL(page.url()).pathname === '/daily/', page.url());
  check('[입구] 넘어간 곳이 게임 허브다', (await page.locator('.card').count()) > 0);

  check('[전체] 콘솔 오류 0', errors.length === 0, errors.join(' | '));
  // 스샷은 곁다리다 — 이게 늦는다고 검사 전체를 죽이면 안 된다 (한 번 그렇게 죽었다).
  await page
    .screenshot({ path: join(app, '.cache/shots/live-hub.png'), fullPage: true, timeout: 8000 })
    .catch(() => console.log('  (허브 스샷은 건너뛴다)'));
  await ctx.close();
}

await browser.close();
const failed = checks.filter((c) => !c).length;
console.log(`\n${checks.length - failed}/${checks.length} 통과 (${BASE})`);
process.exit(failed ? 1 : 0);
