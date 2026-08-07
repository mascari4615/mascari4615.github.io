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

  // 처음 온 사람이 빈 칸 앞에서 멈추지 않게 — 시작점 몇 개를 미리 준다.
  const seeds = page.locator('.seeds button');
  check(`[${tag}] 시작점을 준다`, (await seeds.count()) === 3, `${await seeds.count()}개`);

  // 틀린 답 하나 — 줄이 생기고 칸 수가 속성 수와 같아야 한다.
  await page.fill('.guessbar input', decoy.name.slice(0, 2));
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${decoy.name}")`);
  await page.waitForSelector('.row');
  check(`[${tag}] 한 수 두면 시작점은 사라진다`, (await page.locator('.seeds button').count()) === 0);
  const cellCount = await page.locator('.row').first().locator('.cell').count();
  check(`[${tag}] 추측 한 줄이 속성 칸을 다 그린다`, cellCount === cellsPerRow, `${cellCount}칸`);
  check(`[${tag}] 아직 안 끝났다`, await page.locator('.done').isHidden());
  if (mode === 'classic') {
    // 색과 ▲▼ 는 눈에만 보인다 — 같은 내용이 말로도 남아야 화면 낭독기가 읽는다.
    const said = await page.locator('.row .sr').first().innerText();
    check(`[${tag}] 결과를 말로도 남긴다`, said.startsWith(`${decoy.name}:`) && /맞음|틀림|더 /.test(said), said.slice(0, 40));
  }

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
  // 끝낸 사람이 지금 할 수 있는 것 — 「내일 또」만 남기면 그대로 나간다.
  check(`[${tag}] 어제 문제로 이어 준다`, (await page.locator('.done .more a[href*="?d="]').count()) === 1);

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
  const first = await page.locator('table.past tbody tr').count();
  check(`[지난:${topicId}] 줄이 여러 날 쌓인다`, first > 5, `${first}줄`);

  // 30일에서 끊기면 연습할 날도 검색에 걸릴 글도 거기서 끝난다 — 이어서 더 볼 수 있어야 한다.
  await page.click('.past-more button');
  const more = await page.locator('table.past tbody tr').count();
  check(`[지난:${topicId}] 더 보기로 이어진다`, more > first, `${first} → ${more}줄`);
  // 진짜 규칙은 「오늘 줄이 없다」이다. 이름으로 보면 과거의 *다른 모드* 답과 우연히 겹쳐
  // 헛걸린다 — 그건 정보가 새는 게 아니라 순열이 모드마다 따로 도는 결과다.
  const todayLabel = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const dates = await page.$$eval('table.past .d', (els) => els.map((e) => e.textContent));
  check(
    `[지난:${topicId}] ★ 더 봐도 오늘 줄은 없다`,
    !dates.includes(todayLabel) && dates.every((d) => d < todayLabel),
    `가장 최근 ${dates[0]}`,
  );
  await page.screenshot({ path: join(shots, `${topicId}-past.png`), fullPage: true });
  await ctx.close();
}

await pastPage('pokemon');
await pastPage('lol');
await pastPage('genshin');

/**
 * 실루엣 판에서 그림이 끝내 안 오는 경우. 까만 상자만 남으면 「원래 이런 놀이」와 구분이 안 된다.
 * 새 방어는 정상 경로가 아니라 망가진 경로에서 확인해야 의미가 있다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route('**/*.png', (route) => route.abort());
  await page.goto(`${base}/pokemon/silhouette/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.shot-note.bad', { timeout: 10000 });
  const note = await page.locator('.shot-note').innerText();
  check('실루엣 그림이 안 오면 말해 준다', /못 받았/.test(note), note.slice(0, 30));
  await page.screenshot({ path: join(shots, 'shot-broken.png'), fullPage: true });
  await ctx.close();
}

/**
 * 연습 — 놓친 날 문제를 지금 푼다. 오늘 답이 새면 놀이가 끝장나므로 그 선만은 기계가 지킨다.
 */
{
  const topic = JSON.parse(readFileSync(join(app, 'data', 'pokemon.json'), 'utf8'));
  const yesterday = new Date(Date.now() - 86400000);
  const dayKey = new Date(yesterday.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const past = answerOf(topic, yesterday);
  const today = answerOf(topic);

  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/pokemon/?d=${dayKey}`, { waitUntil: 'networkidle' });
  check('연습 판임을 알려 준다', /연습/.test(await page.locator('.tabs').innerText()));

  await page.fill('.guessbar input', past.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${past.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  check('그날 정답으로 맞혀진다', (await page.locator('.done').innerText()).includes(past.name), past.name);
  check(
    '연습은 기록에 안 들어간다',
    await page.evaluate(() => !localStorage.getItem('daily:streak')),
  );
  check(
    '연습이 오늘 진행을 안 덮는다',
    await page.evaluate(() => !localStorage.getItem('daily:pokemon:classic')),
  );

  // ★ 오늘·미래 날짜로는 연습이 안 열려야 한다 (열리면 오늘 답이 샌다).
  const todayKey = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  await page.goto(`${base}/pokemon/?d=${todayKey}`, { waitUntil: 'networkidle' });
  check('★ 오늘 날짜로는 연습이 안 열린다', !/연습/.test(await page.locator('.tabs').innerText()));
  await page.fill('.guessbar input', today.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${today.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  check('그 자리는 오늘 판 그대로다', (await page.locator('.done').innerText()).includes(today.name));
  await ctx.close();
}

/**
 * 자정을 넘겨 창을 열어 둔 사람은 어제 문제를 계속 풀고 있다 — 화면이 아무 말도 안 했다.
 * 시계를 하루 앞으로 당겨 실제로 알려 주는지 본다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // 시계를 통째로 가짜로 갈아야 한다 — Date.now 만 바꾸면 new Date() 가 그대로 진짜 시각을 본다.
  await page.clock.install();
  await page.goto(`${base}/pokemon/`, { waitUntil: 'networkidle' });
  check('평소엔 새 문제 안내가 없다', (await page.locator('.newday').count()) === 0);
  await page.clock.runFor('25:00:00'); // 하루 넘게 감기 — 15초마다 도는 감시가 알아채야 한다
  await page.waitForSelector('.newday', { timeout: 15000 });
  check('자정이 지나면 어제 문제라고 말해 준다', /새 문제/.test(await page.locator('.newday').innerText()));
  await page.screenshot({ path: join(shots, 'newday.png'), fullPage: true });
  await ctx.close();
}

/**
 * 연습 저장 자리는 날짜마다 하나씩 생긴다. 안 치우면 한도에 닿는 순간 오늘 진행이 조용히 안 저장된다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/pokemon/`, { waitUntil: 'domcontentloaded' });
  const after = await page.evaluate(() => {
    for (let i = 0; i < 90; i += 1) {
      const d = `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`;
      localStorage.setItem(`daily:junk${i}:classic:p:${d}`, '{}');
    }
    return localStorage.length;
  });
  // 앱이 돌기 전에 세면 「안 치웠다」로 헛걸린다 — 치워질 때까지 기다린다.
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .waitForFunction(() => Object.keys(localStorage).filter((k) => /:p:\d{4}-\d{2}-\d{2}$/.test(k)).length <= 40, {
      timeout: 10000,
    })
    .catch(() => {});
  const left = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => /:p:\d{4}-\d{2}-\d{2}$/.test(k)).length,
  );
  check('오래된 연습 저장은 스스로 치운다', left <= 40, `${after}개 → ${left}개`);
  await ctx.close();
}

/** 지난 문제 목록에서 그날 판으로 바로 갈 수 있어야 한다. */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/pokemon/past/`, { waitUntil: 'networkidle' });
  const links = await page.$$eval('table.past .play', (els) => els.map((e) => e.getAttribute('href')));
  check('지난 문제에서 풀어보기로 간다', links.length > 5 && links.every((h) => /\?d=\d{4}-\d{2}-\d{2}$/.test(h)), `${links.length}개`);
  await ctx.close();
}

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
  // 연속은 판별이 아니라 사이트 전체 — 한 판만 풀어도 오늘이 세어진다.
  check('한 판만 풀어도 연속이 선다', /연속/.test(await page.locator('.hub-note').innerText()));
  // 판 수를 박지 않는다 — 주제가 늘 때마다 시험이 깨지면 시험을 안 믿게 된다.
  const total = await page.locator('.card[data-topic]').count();
  check(
    '허브가 남은 판 수를 말한다',
    new RegExp(`남은 판 ${total - 1}개`).test(await page.locator('.hub-note').innerText()),
    `전체 ${total}판`,
  );
}
await page.screenshot({ path: join(shots, 'hub.png'), fullPage: true });

// 다른 판으로 옮겨도 같은 연속이 보여야 한다 — 판별 기록이었다면 여기서 0 이 된다.
{
  const other = await page.$eval('.card:not(.done-today)', (a) => a.getAttribute('href'));
  await page.goto(`${base}${other.replace('/daily', '')}`, { waitUntil: 'networkidle' });
  const shown = await page.locator('.streak').innerText();
  check('다른 판에서도 같은 연속이 보인다', /1/.test(shown), shown);
}

await ctx.close();

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 통과 · 스샷 ${shots}`);
process.exit(failed.length ? 1 : 0);
