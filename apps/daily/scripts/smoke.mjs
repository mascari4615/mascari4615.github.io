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

async function playTopic(topicId, { width, height, tag, mode = 'classic' }) {
  const topic = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
  const answer = answerOf(topic, new Date(), mode === 'classic' ? '' : mode);
  const decoy = topic.items.find((i) => i.name !== answer.name);
  const path = mode === 'classic' ? topicId : `${topicId}/${mode}`;
  const cellsPerRow = mode === 'silhouette' ? 0 : topic.fields.length;

  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/${path}/`, { waitUntil: 'networkidle' });

  check(`[${tag}] 문제 번호가 찍힌다`, /^#\d+$/.test((await page.locator('.no').textContent()).trim()));

  // 틀린 답 하나 — 줄이 생기고 칸 수가 속성 수와 같아야 한다.
  await page.fill('.guessbar input', decoy.name.slice(0, 2));
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${decoy.name}")`);
  await page.waitForSelector('.row');
  const cellCount = await page.locator('.row').first().locator('.cell').count();
  check(`[${tag}] 추측 한 줄이 속성 칸을 다 그린다`, cellCount === cellsPerRow, `${cellCount}칸`);
  check(`[${tag}] 아직 안 끝났다`, await page.locator('.done').isHidden());

  await page.screenshot({ path: join(shots, `${topicId}-${mode}-${tag}-playing.png`), fullPage: true });

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

  await page.screenshot({ path: join(shots, `${topicId}-${mode}-${tag}-done.png`), fullPage: true });

  // 새로고침해도 오늘 진행이 남아야 한다.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('.done:not([hidden])');
  check(`[${tag}] 새로고침해도 오늘 결과가 남는다`, (await page.locator('.row').count()) === 2);

  // 가로 넘침 = 모바일에서 제일 흔한 사고.
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`[${tag}] 가로로 안 넘친다`, over <= 0, `넘침 ${over}px`);
  check(`[${tag}] 콘솔 오류 0`, errors.length === 0, errors.join(' | '));

  // 끝난 사람에게 다음 판을 건네는 자리 — 이게 없으면 방문자가 한 판만 두고 나간다.
  check(`[${tag}] 다음 판을 건넨다`, (await page.locator('.done .more a').count()) > 0);
  check(`[${tag}] 연속 기록이 붙는다`, /연속/.test(await page.locator('.done .tally').innerText()));

  await ctx.close();
}

/** 실루엣은 「처음엔 안 보이다가 틀릴수록 밝아진다」가 전부다 — 그게 실제로 일어나는지 본다. */
async function playSilhouette(topicId) {
  const topic = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
  const answer = answerOf(topic, new Date(), 'silhouette');
  const decoy = topic.items.find((i) => i.name !== answer.name);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/${topicId}/silhouette/`, { waitUntil: 'networkidle' });

  const bright = () =>
    page.$eval('.shot img', (el) => Number((el.style.filter.match(/brightness\(([\d.]+)\)/) ?? [0, 0])[1]));
  const before = await bright();
  check(`[실루엣:${topicId}] 처음엔 거의 안 보인다`, before < 0.2, `밝기 ${before}`);
  check(`[실루엣:${topicId}] 속성 표는 안 보여 준다`, (await page.locator('.cells').count()) === 0);

  await page.fill('.guessbar input', decoy.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${decoy.name}")`);
  await page.waitForSelector('.row');
  const after = await bright();
  check(`[실루엣:${topicId}] 틀리면 조금 밝아진다`, after > before, `${before} → ${after}`);

  await page.screenshot({ path: join(shots, `${topicId}-silhouette-playing.png`), fullPage: true });

  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answer.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  check(`[실루엣:${topicId}] 맞히면 그림이 다 드러난다`, (await page.$eval('.shot img', (el) => el.style.filter)) === 'none');
  await page.screenshot({ path: join(shots, `${topicId}-silhouette-done.png`), fullPage: true });
  await ctx.close();
}

await playTopic('pokemon', { width: 1000, height: 900, tag: 'desktop' });
await playTopic('pokemon', { width: 360, height: 780, tag: 'mobile' });
await playTopic('lol', { width: 360, height: 780, tag: 'mobile' });
await playSilhouette('pokemon');
await playSilhouette('lol');
await playTopic('genshin', { width: 360, height: 780, tag: 'mobile' });
await playSilhouette('genshin');

/** 지난 문제 — 오늘 답이 새면 게임이 끝장난다. 그것만은 기계가 지켜야 한다. */
async function pastPage(topicId) {
  const topic = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/${topicId}/past/`, { waitUntil: 'networkidle' });
  const text = await page.locator('#past').innerText();

  check(`[지난:${topicId}] 어제 답이 보인다`, text.includes(answerOf(topic, new Date(Date.now() - 86400000)).name));
  check(`[지난:${topicId}] ★ 오늘 답은 안 보인다`, !text.includes(answerOf(topic).name));
  check(
    `[지난:${topicId}] 실루엣 답도 따로 나온다`,
    text.includes(answerOf(topic, new Date(Date.now() - 86400000), 'silhouette').name),
  );
  check(`[지난:${topicId}] 줄이 여러 날 쌓인다`, (await page.locator('table.past tbody tr').count()) > 5);
  await page.screenshot({ path: join(shots, `${topicId}-past.png`), fullPage: true });
  await ctx.close();
}

await pastPage('pokemon');
await pastPage('lol');
await pastPage('genshin');

/**
 * 그림이 *실제로 받아지는지* 본다.
 * 실루엣은 그림이 전부인데, 밝기만 보는 검사는 그림이 깨져도 통과한다 (실제로 통과했다).
 * 주소가 적혀 있는 것과 화면에 뜨는 것은 다른 일이다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const topicId of ['pokemon', 'lol', 'genshin']) {
    const topic = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
    const sample = [0, Math.floor(topic.items.length / 2), topic.items.length - 1].map((i) => topic.items[i].img);
    await page.setContent(sample.map((src) => `<img src="${src}">`).join(''));
    await page.waitForLoadState('networkidle');
    const widths = await page.$$eval('img', (els) => els.map((e) => e.naturalWidth));
    check(`[그림:${topicId}] 표의 그림이 실제로 받아진다`, widths.every((w) => w > 0), widths.join('/'));
  }
  await ctx.close();
}

/**
 * 표를 못 받는 상황을 일부러 만든다. 예전엔 빈 화면이 떴고, 낯선 사람은 그걸 「고장」으로 읽는다.
 * 새 방어는 정상 경로가 아니라 *망가진 경로*에서 확인해야 의미가 있다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/data/*.json*', (route) => route.abort());
  await page.goto(`${base}/pokemon/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.done h2');
  const text = await page.locator('.done').innerText();
  check('표를 못 받으면 이유를 말한다', /못 불러왔/.test(text), text.split('\n')[0]);
  check('다시 시도 단추가 있다', (await page.locator('.done .btn').count()) === 1);
  check('빈 입력칸을 남겨 두지 않는다', await page.locator('.guessbar').isHidden());
  await page.screenshot({ path: join(shots, 'fetch-fail.png'), fullPage: true });
  await ctx.close();
}

/** 공유 카드 그림은 *주소가 적혀 있다*고 있는 게 아니다 — 실제로 받아져야 카드가 펼쳐진다. */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const path of ['', 'pokemon/', 'pokemon/silhouette/', 'lol/past/']) {
    await page.goto(`${base}/${path}`, { waitUntil: 'domcontentloaded' });
    const src = await page.getAttribute('meta[property="og:image"]', 'content');
    const res = await fetch(src.replace('https://blog.mascari4615.com/daily', base));
    check(`[공유카드] /${path} 그림이 실제로 받아진다`, res.ok, `${res.status} ${src?.split('/').pop()}`);
  }
  await ctx.close();
}

// 허브
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
check('허브가 판을 다 건다', (await page.locator('.card').count()) >= 4);
check('허브에 하는 법이 있다', (await page.locator('.how li').count()) >= 3);
check('허브에서 지난 문제로 갈 수 있다', (await page.locator('.past-links a').count()) >= 2);

// 한 판 끝낸 사람이 허브로 돌아오면, 다 푼 판이 표시돼야 한다 (같은 판을 또 누르는 낭비 차단).
{
  const topic = JSON.parse(readFileSync(join(app, 'data', 'pokemon.json'), 'utf8'));
  const answer = answerOf(topic);
  await page.goto(`${base}/pokemon/`, { waitUntil: 'networkidle' });
  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answer.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check('허브가 오늘 푼 판을 표시한다', (await page.locator('.card.done-today').count()) === 1);
  // 판 수를 박지 않는다 — 주제가 늘 때마다 시험이 깨지면 시험을 안 믿게 된다.
  const total = await page.locator('.card[data-topic]').count();
  check(
    '허브가 남은 판 수를 말한다',
    new RegExp(`남은 판 ${total - 1}개`).test(await page.locator('.hub-note').innerText()),
    `전체 ${total}판`,
  );
}
await page.screenshot({ path: join(shots, 'hub.png'), fullPage: true });
await ctx.close();

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 통과 · 스샷 ${shots}`);
process.exit(failed.length ? 1 : 0);
