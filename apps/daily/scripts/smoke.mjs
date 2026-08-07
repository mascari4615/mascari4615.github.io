/**
 * 진짜 브라우저에서 한 판 끝까지 둔다 (TASK-KAR-202).
 * 단위 시험은 규칙만 본다 — 「화면에서 실제로 두어진다」는 여기서만 갈린다.
 *
 *   node scripts/smoke.mjs
 *
 * playwright 는 이웃 앱(apps/karmolab)의 것을 빌려 쓴다. 이 앱은 의존성 0 을 유지한다.
 */
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startServer } from './serve.mjs';
import { answerOf, findItem } from '../engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const shots = join(app, '.cache/shots');
// 내 기계에서는 이웃 앱(apps/karmolab)의 playwright 를 빌려 쓴다 — 이 앱은 의존성 0 을 지킨다.
// CI 에는 그 이웃이 없으므로 어디 있는지 환경변수로 알려 준다.
const pwPath = process.env.DAILY_PLAYWRIGHT
  ? join(app, process.env.DAILY_PLAYWRIGHT)
  : join(app, '../karmolab/node_modules/playwright/index.js');
const pwModule = await import(pathToFileURL(pwPath).href);
const pw = pwModule.chromium ? pwModule : pwModule.default; // CJS 라 default 로 들어오는 경우가 있다

const checks = [];
const check = (name, ok, note = '') => {
  checks.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/daily`;
// 스샷 폴더는 **이번 회차 것만** 있어야 한다. 예전 회차 잔해가 섞여 있으면 눈으로 볼 때
// 이미 고친 화면을 보고 「이상 없음」이라 판정하게 된다 (실제로 그랬다).
rmSync(shots, { recursive: true, force: true });
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
  // 「0번째 시도」 같은 말이 안 되는 문구가 다시 앉지 않게 — 실제로 뜬 글을 본다.
  check(`[${tag}] 남은 기회를 말이 되게 적는다`, /^1번 썼다 · \d+번 남음$/.test(await page.locator('.left').innerText()), await page.locator('.left').innerText());
  if (mode === 'classic') {
    // 규칙은 화면 위에 있고 결과는 아래에 뜬다 — 눈이 가 있는 자리에도 읽는 법이 있어야 한다.
    const legend = await page.locator('.legend').innerText();
    check(`[${tag}] 결과 옆에 읽는 법이 뜬다`, /맞음/.test(legend) && /▲/.test(legend), legend.replace(/\n/g, ' '));
  }
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
  if (mode === 'classic') {
    /**
     * 올린 격자와 방금 본 화면의 **위아래가 같아야 한다.**
     * 화면은 새 추측을 위에 쌓는데 격자는 첫 수부터 아래로 그리고 있었다 — 뒤집혀 있었다.
     * 지금은 맞힌 수가 마지막이므로, 격자 맨 윗줄이 전부 초록이어야 한다.
     */
    const lines = grid.split(String.fromCharCode(10)).filter((l) => l.trim());
    check(`[${tag}] ★ 격자 위아래가 화면과 같다`, [...lines[0]].every((c) => c === '🟩'), lines.join(' / '));
  }

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
  const moreLinks = await page.locator('.done .more a').count();
  // 여섯을 쏟으면 아무것도 안 고른다 — 셋 + 전체 보기.
  check(`[${tag}] 다음 판을 셋만 건넨다`, moreLinks > 0 && moreLinks <= 4, `${moreLinks}개`);
  check(`[${tag}] 연속 기록이 붙는다`, /연속/.test(await page.locator('.done .tally').innerText()));
  // 끝낸 사람이 지금 할 수 있는 것 — 「내일 또」만 남기면 그대로 나간다.
  check(`[${tag}] 어제 문제로 이어 준다`, (await page.locator('.done .more a[href*="?d="]').count()) === 1);
  if (mode === 'classic') {
    // 기록이 쌓이는 게 보여야 다시 온다. 색만으로 알리지 않게 숫자와 「오늘」이 글자로 붙는다.
    const dist = await page.locator('.done .dist').innerText();
    check(`[${tag}] 몇 번 만에 맞혔는지 쌓인다`, /몇 번 만에/.test(dist) && /오늘/.test(dist), dist.replace(/\n/g, ' ').slice(0, 40));
    // 막대는 눈에만 보인다 — 낭독기에는 문장으로 읽혀야 뜻이 통한다.
    const said = await page.locator('.dist-row .sr').first().innerText();
    check(`[${tag}] 기록 막대를 말로도 읽어 준다`, /만에 맞힌 적/.test(said), said);
  }

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
  // 답이 「풀어보기」 옆에 그대로 있으면 연습이 성립하지 않는다 — 가려져 있어야 한다.
  const blurred = await page.$eval('table.past .a', (el) => getComputedStyle(el).filter);
  check(`[지난:${topicId}] ★ 답이 가려져 있다`, /blur\(\s*[1-9]/.test(blurred), blurred);
  // 글자 자체는 남아야 한다 — 답을 찾아 들어온 사람도, 검색 엔진도 잃지 않는다.
  const named = await page.$eval('table.past .a b', (el) => el.textContent.trim());
  check(`[지난:${topicId}] 가려도 글자는 남는다`, named.length > 0, named);

  // 이 두 개는 상태를 바꾼다 — 뒤에 검사를 붙이려면 이 아래에.
  await page.click('table.past tbody td .a');
  // 흐림이 걷히는 데 시간이 걸린다 — 바로 재면 중간값(blur(3px))이 잡힌다.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('table.past .a')).filter === 'none');
  check(
    `[지난:${topicId}] 누르면 그 칸만 열린다`,
    (await page.$eval('table.past .a', (el) => getComputedStyle(el).filter)) === 'none' &&
      (await page.locator('table.past td.on').count()) === 1,
  );
  await page.click('.past-reveal button');
  await page.waitForFunction(() => [...document.querySelectorAll('table.past .a')].every((e) => getComputedStyle(e).filter === 'none')).catch(() => {});
  const allOpen = await page.$$eval('table.past .a', (els) => els.every((e) => getComputedStyle(e).filter === 'none'));
  check(`[지난:${topicId}] 「답 모두 보기」로 다 열린다`, allOpen);

  /**
   * 검색 로봇은 자바스크립트를 안 돌려 주는 쪽이 많다 — 답이 HTML **원문**에 있어야 한다.
   * 브라우저로 보면 어느 쪽이든 똑같이 보이므로, 위 검사들은 이걸 못 잡는다. 원문을 직접 본다.
   */
  const raw = await (await fetch(`${base}/${topicId}/past/`)).text();
  const past = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
  const yesterday = new Date(Date.now() - 86400000);
  const bakedRows = (raw.match(/<tr data-day=/g) ?? []).length;
  check(`[지난:${topicId}] ★ 답이 HTML 원문에 박혀 있다`, bakedRows >= 30, `${bakedRows}줄`);
  check(
    `[지난:${topicId}] 원문에 어제 답이 들어 있다`,
    raw.includes(answerOf(past, yesterday).name),
    answerOf(past, yesterday).name,
  );
  // 박아 넣다가 오늘 답까지 넣으면 게임이 끝장난다 — 원문에서 직접 확인한다.
  const todayName = answerOf(past, new Date()).name;
  const todaySil = answerOf(past, new Date(), 'silhouette').name;
  const todayLabel2 = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  check(`[지난:${topicId}] ★ 원문에 오늘 줄은 없다`, !raw.includes(`>${todayLabel2}<`), `${todayLabel2} / ${todayName} · ${todaySil}`);

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

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 840 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/pokemon/?d=${dayKey}`, { waitUntil: 'networkidle' });
  check('연습 판임을 알려 준다', /연습/.test(await page.locator('.tabs').innerText()));

  /**
   * 판 바꾸는 단추는 날짜를 들고 가야 한다 — 안 그러면 지난 날을 풀다 「실루엣」을 누른 순간
   * 말없이 오늘 판으로 튕긴다. 주소만 보지 말고 실제로 눌러서 어디에 닿는지 본다.
   */
  const tabHref = await page.locator('.tabs a.tab').first().getAttribute('href');
  check('연습 중엔 판을 바꿔도 날이 안 바뀐다', tabHref?.endsWith(`?d=${dayKey}`), tabHref);
  await page.locator('.tabs a.tab').first().click();
  await page.waitForLoadState('networkidle');
  check(
    '★ 눌러서 간 곳도 그날 판이다',
    /연습/.test(await page.locator('.tabs').innerText()) &&
      (await page.locator('.tab.practice').innerText()).includes(dayKey),
    page.url(),
  );
  await page.goto(`${base}/pokemon/?d=${dayKey}`, { waitUntil: 'networkidle' });

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

  // 연습을 하나 끝내면 그다음이 있어야 이어 푼다 — 그 전날이 가장 자연스러운 다음 수다.
  const chain = await page.locator('.done .more a[href*="?d="]').first().getAttribute('href');
  const before = new Date(new Date(`${dayKey}T12:00:00+09:00`).getTime() - 86400000 + 9 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  check('연습이 그 전날로 이어진다', chain?.endsWith(before), `${chain} (기대 …${before})`);

  // 연습 결과를 올려도 오늘 것처럼 보이면 안 된다 — 실제로 복사해서 날짜가 들어갔는지 본다.
  await page.evaluate(() => {
    delete navigator.share; // 공유창이 있으면 클립보드로 안 간다
  });
  await page.click('.done .btn');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  check('연습 결과에 날짜가 박힌다', copied.includes(dayKey), copied.split('\n')[0]);
  /**
   * 올리는 글의 첫 줄은 **화면에 적힌 이름 그대로**여야 한다.
   * 따로 조립해서 제목은 「오늘의 포켓몬」인데 공유글은 「포켓몬」으로 나갔었다 —
   * 처음 보는 사람은 그게 매일 하는 놀이인 줄 모른다.
   */
  const h1 = (await page.locator('.top h1').innerText()).trim();
  check('★ 공유글 첫 줄이 화면 제목과 같다', copied.startsWith(h1), `${copied.split('\n')[0]} ← 「${h1}」`);

  // ★ 오늘·미래 날짜로는 연습이 안 열려야 한다 (열리면 오늘 답이 샌다).
  const todayKey = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  await page.goto(`${base}/pokemon/?d=${todayKey}`, { waitUntil: 'networkidle' });
  check('★ 오늘 날짜로는 연습이 안 열린다', !/연습/.test(await page.locator('.tabs').innerText()));
  // 못 여는 날을 달고 왔으면 **왜인지 말해야** 한다 — 여태 아무 말 없이 오늘 판이 열렸다.
  check('못 여는 날이면 왜인지 말해 준다', /오늘 날짜로는/.test(await page.locator('.warn').innerText()), await page.locator('.warn').innerText());
  await page.fill('.guessbar input', today.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${today.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  check('그 자리는 오늘 판 그대로다', (await page.locator('.done').innerText()).includes(today.name));
  await ctx.close();
}

/**
 * 계측이 실제로 신호를 보내는지 — 안 붙으면 조용히 0 이 되고, 우리는 「아무도 안 온다」로 읽는다.
 * 내 기계(127.0.0.1)에서는 일부러 꺼 두므로, 가짜 도메인으로 들어가 켜진 쪽을 확인한다.
 * 함께 확인할 것 하나 더: **보내는 값에 정답이 실리면 안 된다** (실리면 그걸 보고 답을 안다).
 */
{
  const port = server.address().port;
  const b2 = await pw.chromium.launch({ args: [`--host-resolver-rules=MAP daily.test 127.0.0.1:${port}`] });
  const ctx = await b2.newContext();
  const page = await ctx.newPage();
  const sent = [];
  await page.route('**/gc.zgo.at/**', (route) => {
    sent.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.goatcounter={count(o){window.__c=(window.__c||[]).concat([o])}};' });
  });
  await page.route('**/mascari4615.goatcounter.com/**', (route) => {
    sent.push(route.request().url());
    return route.fulfill({ status: 200, body: '' });
  });

  const topic = JSON.parse(readFileSync(join(app, 'data', 'pokemon.json'), 'utf8'));
  const answer = answerOf(topic);
  await page.goto(`http://daily.test/daily/pokemon/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Array.isArray(window.__c) && window.__c.length > 0, { timeout: 10000 }).catch(() => {});
  const pageHits = await page.evaluate(() => window.__c ?? []);
  check('계측이 방문을 실제로 보낸다', pageHits.some((h) => h.path === '/daily/pokemon/'), JSON.stringify(pageHits[0] ?? null));

  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answer.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  const all2 = await page.evaluate(() => window.__c ?? []);
  const evented = all2.filter((h) => h.event);
  check('판이 끝난 것도 보낸다', evented.some((h) => /맞힘/.test(h.path)), evented.map((h) => h.path).join(', '));

  /**
   * 붙잡으려고 만든 자리들이 실제로 눌리는지 — 안 재면 다듬을 근거가 없다.
   * 넘어가기 전에 보내야 하므로 누른 순간(pointerdown)에 건다.
   */
  await page.locator('.done .more a').first().dispatchEvent('pointerdown');
  const afterMore = await page.evaluate(() => window.__c ?? []);
  check('다음 판을 누른 것도 보낸다', afterMore.some((h) => h.event && /다음판/.test(h.path)),
    afterMore.filter((h) => h.event).map((h) => h.path).join(', '));

  await page.goto('http://daily.test/daily/', { waitUntil: 'networkidle' });
  await page.locator('.hub-jump a').dispatchEvent('pointerdown');
  const hubHits = await page.evaluate(() => window.__c ?? []);
  check('허브 시작 단추를 누른 것도 보낸다', hubHits.some((h) => h.event && /시작단추/.test(h.path)),
    hubHits.filter((h) => h.event).map((h) => h.path).join(', '));
  // 방문과 끝남 사이가 비면 「열고 그냥 나간 사람」을 못 센다.
  check('첫 수도 보낸다 (깔때기 가운데)', evented.some((h) => /첫수/.test(h.path)), evented.map((h) => h.path).join(', '));
  check(
    '★ 보내는 값에 정답이 안 실린다',
    !JSON.stringify(all2).includes(answer.name),
    answer.name,
  );
  // 연습 방문을 오늘 판과 합치면 「오늘 몇 명이 열었나」가 부풀어 깔때기를 못 믿는다.
  {
    const p3 = await ctx.newPage();
    await p3.route('**/gc.zgo.at/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.goatcounter={count(o){window.__c=(window.__c||[]).concat([o])}};' }),
    );
    const yKey = new Date(Date.now() - 86400000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
    await p3.goto(`http://daily.test/daily/pokemon/?d=${yKey}`, { waitUntil: 'networkidle' });
    await p3.waitForFunction(() => (window.__c ?? []).length > 0, { timeout: 10000 }).catch(() => {});
    const paths = await p3.evaluate(() => (window.__c ?? []).map((h) => h.path));
    check('연습 방문은 오늘 판과 따로 센다', paths.some((p) => /연습/.test(p)), paths.join(', '));
    await p3.close();
  }

  // 시작점 단추가 실제로 먹히는지도 계측으로만 알 수 있다 — 「직접」과 갈라 센다.
  {
    const p2 = await ctx.newPage();
    await p2.route('**/gc.zgo.at/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.goatcounter={count(o){window.__c=(window.__c||[]).concat([o])}};' }),
    );
    await p2.goto('http://daily.test/daily/lol/', { waitUntil: 'networkidle' });
    await p2.click('.seeds button');
    await p2.waitForSelector('.row');
    const hits = await p2.evaluate(() => (window.__c ?? []).filter((h) => h.event).map((h) => h.path));
    check('시작점으로 시작한 것과 직접 친 것을 갈라 센다', hits.some((h) => /첫수\/시작점/.test(h)), hits.join(', '));
    await p2.close();
  }

  await ctx.close();
  await b2.close();
}

/**
 * 결과가 퍼져야 사람이 온다. 폰에는 기기 공유 창이 있으니 한 번에 끝나야 하고,
 * 없는 기기에서는 복사로 돌아가야 한다 — 두 갈래를 다 확인한다.
 */
for (const withShare of [true, false]) {
  const topic = JSON.parse(readFileSync(join(app, 'data', 'pokemon.json'), 'utf8'));
  const answer = answerOf(topic);
  const ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.addInitScript((on) => {
    window.__shared = null;
    if (on) navigator.share = (data) => { window.__shared = data; return Promise.resolve(); };
    else delete navigator.share;
  }, withShare);
  await page.goto(`${base}/pokemon/`, { waitUntil: 'networkidle' });
  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answer.name}")`);
  await page.waitForSelector('.done .btn');

  const label = await page.locator('.done .btn').innerText();
  check(`[공유:${withShare ? '기기' : '복사'}] 단추 이름이 맞다`, withShare ? /공유/.test(label) : /복사/.test(label), label);
  await page.click('.done .btn');
  if (withShare) {
    const shared = await page.evaluate(() => window.__shared?.text ?? null);
    check('[공유:기기] 기기 공유 창으로 바로 넘긴다', !!shared && shared.includes('🟩') && !shared.includes(answer.name));
  } else {
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    check('[공유:복사] 공유 창이 없으면 복사로 돌아간다', copied.includes('🟩') && !copied.includes(answer.name));
  }
  await ctx.close();
}

/**
 * 표가 오기 전 몇 초. 그동안 입력칸은 먹통인데 아무 말도 안 했다 — 느린 회선에서는 「고장」으로 읽힌다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // 표를 일부러 늦춘다.
  await page.route('**/data/*.json*', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto(`${base}/pokemon/`, { waitUntil: 'domcontentloaded' });
  const waiting = await page.$eval('.guessbar input', (e) => ({ off: e.disabled, ph: e.placeholder }));
  check('표를 받는 동안 기다리라고 말한다', waiting.off && /불러오는 중/.test(waiting.ph), waiting.ph);
  await page.waitForFunction(() => !document.querySelector('.guessbar input').disabled, { timeout: 15000 });
  const ready = await page.$eval('.guessbar input', (e) => e.placeholder);
  check('다 받으면 원래대로 돌아온다', /이름/.test(ready) && !/불러오는 중/.test(ready), ready);
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
  // 글이 한 덩어리여야 한다 — 조각나면 flex 가 글자 사이를 벌린다 (실제로 벌어져 보였다).
  check('안내 글이 조각나지 않는다', (await page.locator('.newday span').count()) === 1);
  await page.screenshot({ path: join(shots, 'newday.png'), fullPage: true });
  await ctx.close();
}

/**
 * 하루가 지난 뒤의 지난 문제 — **한 번도 안 돌아 본 길**이다.
 *
 * 이 표는 배포할 때 「어제까지」로 굳어 박힌다. 다음 배포 전에 날이 바뀌면, 박힌 것의
 * 맨 위는 이틀 전이 되고 그 사이 하루는 브라우저가 얹어야 한다. 매일 배포하는 동안에는
 * 이 길로 아무도 안 지나가므로, 여기가 깨져 있어도 한동안 아무도 모른다.
 *
 * 시계를 이틀 감아 두고 연다: 새로 생긴 이틀이 위에 얹히고, 오늘 줄은 여전히 없어야 하며,
 * 같은 날이 두 번 그려져도 안 된다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.clock.install({ time: Date.now() + 2 * 86400000 });
  await page.goto(`${base}/pokemon/past/`, { waitUntil: 'networkidle' });

  const days = await page.$$eval('table.past tbody tr', (els) => els.map((e) => Number(e.dataset.day)));
  const label = await page.$$eval('table.past .d', (els) => els.map((e) => e.textContent));
  const todayLabel = new Date(Date.now() + 2 * 86400000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  check('[이틀 뒤] 그 사이 날들이 위에 얹힌다', days.length >= 32, `${days.length}줄`);
  check('[이틀 뒤] 같은 날이 두 번 안 그려진다', new Set(days).size === days.length, `${days.length}줄 중 ${new Set(days).size}가지`);
  check('[이틀 뒤] 위에서 아래로 하루씩 내려간다', days.every((d, i) => i === 0 || days[i - 1] - d === 1), `${days[0]} → ${days[days.length - 1]}`);
  check('[이틀 뒤] ★ 그래도 오늘 줄은 없다', !label.includes(todayLabel), `오늘 ${todayLabel} · 맨 위 ${label[0]}`);

  // 얹은 줄도 진짜 줄이어야 한다 — 답과 「풀어보기」가 붙어 있는지 맨 윗줄로 확인한다.
  const top = page.locator('table.past tbody tr').first();
  check('[이틀 뒤] 얹은 줄에도 답과 풀어보기가 있다', (await top.locator('.a').count()) === 2 && (await top.locator('.play').count()) === 2);
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

/**
 * **하루가 지나 다시 왔을 때** — 이 게임의 심장인데 한 번도 안 돌려봤다.
 * 어제 푼 흔적이 남아 있으면 오늘 문제를 못 풀고, 연속이 안 이어지면 매일 오는 뜻이 없다.
 * 시계를 하루 감아서 본다.
 */
{
  const topic = JSON.parse(readFileSync(join(app, 'data', 'lol.json'), 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();

  // 어제로 시계를 맞추고 한 판 끝낸다.
  const yesterday = Date.now() - 86400000;
  await page.clock.install({ time: yesterday });
  await page.goto(`${base}/lol/`, { waitUntil: 'networkidle' });
  const yAnswer = answerOf(topic, new Date(yesterday));
  await page.fill('.guessbar input', yAnswer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${yAnswer.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  check('[다음날] 어제 한 판을 끝냈다', (await page.locator('.done').innerText()).includes(yAnswer.name));

  // 하루를 넘기고 다시 연다.
  await page.clock.setSystemTime(Date.now());
  await page.goto(`${base}/lol/`, { waitUntil: 'networkidle' });
  check('[다음날] 어제 흔적이 안 남는다', (await page.locator('.row').count()) === 0);
  check('[다음날] 다시 풀 수 있다', await page.locator('.guessbar').isVisible());
  check('[다음날] 어제까지의 연속이 이어진다', /연속/.test(await page.locator('.streak').innerText()));

  const answer = answerOf(topic);
  check('[다음날] 문제가 어제와 다르다', answer.name !== yAnswer.name, `${yAnswer.name} → ${answer.name}`);
  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answer.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  const streak = await page.locator('.done .tally').innerText();
  check('[다음날] 연속이 2일이 된다', /연속 2일/.test(streak), streak);
  await ctx.close();
}

/**
 * 검색이 이걸 「글 한 장」이 아니라 「무료로 바로 하는 웹 게임」으로 읽어야 한다.
 * 표시는 적어 두는 것보다 *깨지지 않는 것*이 중요하다 — 실제로 파싱되는지 본다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  for (const path of ['', 'pokemon/', 'pokemon/silhouette/']) {
    await page.goto(`${base}/${path}`, { waitUntil: 'domcontentloaded' });
    const parsed = await page.evaluate(() => {
      const el = document.querySelector('script[type="application/ld+json"]');
      if (!el) return null;
      try {
        return JSON.parse(el.textContent);
      } catch {
        return 'BROKEN';
      }
    });
    check(
      `[검색표시] /${path} 가 게임으로 읽힌다`,
      parsed && parsed !== 'BROKEN' && parsed.applicationCategory === 'GameApplication' && !!parsed.name,
      parsed === 'BROKEN' ? '깨진 JSON' : parsed?.name ?? '(없음)',
    );
  }
  await ctx.close();
}

/**
 * 키보드만으로 한 판. 마우스 없이 오는 사람이 어디서 막히는지는 여기서만 갈린다.
 * 특히 판이 끝나면 입력칸이 사라지는데 포커스가 거기 남으면, 없어진 자리에 갇힌다.
 */
{
  const topic = JSON.parse(readFileSync(join(app, 'data', 'lol.json'), 'utf8'));
  const answer = answerOf(topic);
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/lol/`, { waitUntil: 'networkidle' });

  check('열면 입력칸에 바로 커서가 간다', await page.evaluate(() => document.activeElement?.tagName === 'INPUT'));
  await page.keyboard.type(answer.name.slice(0, 2));
  await page.waitForSelector('.sug button');
  await page.keyboard.press('ArrowDown');
  const active = await page.evaluate(() => document.activeElement?.getAttribute('aria-activedescendant'));
  check('화살표로 고른 항목이 낭독기에 이어진다', !!active, active ?? '(없음)');

  /**
   * 「펼쳐짐」은 정말 펼쳐졌을 때만이어야 한다. 여태 참으로 박혀 있어서, 목록이 비어 있어도
   * 화면 낭독기에는 늘 펼쳐진 것으로 들렸다. 지금 어느 항목인지 가리키는 표식도
   * 목록이 사라진 뒤 그대로 남아 없는 것을 가리켰다.
   */
  const opened = await page.getAttribute('.guessbar input', 'aria-expanded');
  check('목록이 떠 있으면 펼쳐졌다고 한다', opened === 'true', String(opened));
  await page.keyboard.press('Escape');
  const closed = await page.evaluate(() => {
    const el = document.querySelector('.guessbar input');
    return { open: el.getAttribute('aria-expanded'), at: el.getAttribute('aria-activedescendant') };
  });
  check('★ 목록을 닫으면 닫혔다고 한다', closed.open === 'false' && closed.at === null, JSON.stringify(closed));
  await page.fill('.guessbar input', answer.name);
  await page.waitForSelector('.sug button');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.done:not([hidden])');

  const where = await page.evaluate(() => (document.activeElement?.closest('.done') ? '결과' : document.activeElement?.tagName));
  check('★ 끝나면 포커스가 결과로 간다', where === '결과', String(where));
  await page.keyboard.press('Tab');
  const next = await page.evaluate(() => document.activeElement?.textContent?.trim()?.slice(0, 12) ?? '');
  check('결과에서 Tab 한 번이면 공유 단추다', /복사|공유/.test(next), next);
  await ctx.close();
}

/**
 * 없는 이름을 치면 아무 반응도 없었다 — 오타가 났는데 화면이 침묵하면 고장으로 읽힌다.
 * 이미 낸 답도 목록에서 빠지므로 같은 침묵이 났다.
 */
{
  const topic = JSON.parse(readFileSync(join(app, 'data', 'lol.json'), 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/lol/`, { waitUntil: 'networkidle' });

  await page.fill('.guessbar input', '없는이름zzz');
  await page.waitForSelector('.sug-none', { timeout: 5000 });
  check('없는 이름을 치면 없다고 말한다', /없어요/.test(await page.locator('.sug-none').innerText()));

  // 고를 것이 백 개 넘는 판에서 이름을 끝까지 치게 하면 그게 문턱이다 — 첫 자음만 쳐도 찾아져야 한다.
  await page.fill('.guessbar input', 'ㅇㄹ');
  await page.waitForSelector('.sug button', { timeout: 5000 });
  const cho = await page.$$eval('.sug button', (els) => els.map((e) => e.textContent.trim()));
  check('첫 자음만 쳐도 후보가 뜬다', cho.includes('아리'), cho.slice(0, 4).join(', '));

  const first = topic.items[0].name;
  await page.fill('.guessbar input', first);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${first}")`);
  await page.waitForSelector('.row');
  await page.fill('.guessbar input', first);
  await page.waitForSelector('.sug-none', { timeout: 5000 });
  check('이미 낸 이름은 이미 냈다고 말한다', /이미 냈어요/.test(await page.locator('.sug-none').innerText()));
  await ctx.close();
}

/**
 * 저장이 막힌 브라우저 — 사생활 모드이거나 공간이 다 찼을 때 실제로 일어난다.
 * 조용히 넘기면 새로고침 한 번에 오늘 진행이 사라지고, 본인은 이유를 모른 채 다시 둔다.
 */
{
  const topic = JSON.parse(readFileSync(join(app, 'data', 'lol.json'), 'utf8'));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    // 읽기는 되고 쓰기만 막힌 상태를 흉내 낸다 (사생활 모드에서 흔한 모양).
    Storage.prototype.setItem = function blocked() {
      throw new Error('QuotaExceededError');
    };
  });
  await page.goto(`${base}/lol/`, { waitUntil: 'networkidle' });
  check('저장이 막혀도 게임은 열린다', await page.locator('.guessbar input').isVisible());

  const first = topic.items[0].name;
  await page.fill('.guessbar input', first);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${first}")`);
  await page.waitForSelector('.row');
  await page.waitForSelector('.warn', { timeout: 5000 });
  check('저장이 막힌 것을 말해 준다', /기록을 못 남기고/.test(await page.locator('.warn').innerText()));
  check('경고는 한 번만 뜬다', (await page.locator('.warn').count()) === 1);
  await page.screenshot({ path: join(shots, 'storage-blocked.png'), fullPage: true });

  /**
   * 허브와 지난 문제도 열려야 한다 — **여태 게임 판만 이 상태로 열어 봤다.**
   * 허브는 제일 많이 들어오는 페이지인데, 저장소를 건드리다 터지면 낯선 사람이 보는
   * 첫 화면이 빈 종이가 된다. 읽기가 아예 막힌(더 센) 경우까지 같이 본다.
   */
  const dead = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const dpage = await dead.newPage();
  const boom = [];
  dpage.on('pageerror', (e) => boom.push(e.message));
  await dpage.addInitScript(() => {
    // 사생활 모드 중에는 localStorage 를 **읽기만 해도** 던지는 브라우저가 있다.
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError');
      },
    });
  });
  // 껍데기가 HTML 에 이미 있는 것으로는 부족하다 — **자바스크립트가 채우는 자리**를 봐야
  // 조용히 죽은 것을 잡는다 (허브의 시작 단추, 지난 문제 줄, 게임의 입력칸).
  for (const [path, must] of [['', '.hub-jump a'], ['pokemon/past/', 'table.past tbody tr'], ['pokemon/', '.guessbar input:not([disabled])']]) {
    await dpage.goto(`${base}/${path}`, { waitUntil: 'networkidle' });
    const alive = (await dpage.locator(must).count()) > 0;
    check(`저장소가 아예 막혀도 /${path} 가 열린다`, alive, alive ? '' : `${must} 없음`);
  }
  check('저장소가 막혀도 콘솔 오류 0', boom.length === 0, boom.join(' | '));
  await dead.close();
  await ctx.close();
}

/**
 * 아주 좁은 화면 — 폰(360px)에서 글자를 200% 로 키우면 논리 폭이 180px 이 된다.
 * 시력이 약한 사람이 실제로 쓰는 설정이고, 여기서 허브가 34px 넘쳤다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 180, height: 700 } });
  const page = await ctx.newPage();
  const spill = [];
  for (const path of ['', 'pokemon/', 'pokemon/silhouette/', 'pokemon/past/']) {
    await page.goto(`${base}/${path}`, { waitUntil: 'networkidle' });
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 0) spill.push(`/${path} ${over}px`);
  }
  check('글자를 크게 키워도 가로로 안 넘친다', spill.length === 0, spill.join(' · ') || '폭 180px 에서 전부 0');
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(shots, 'narrow-hub.png'), fullPage: true });

  /**
   * 넘침 0 만으로는 부족하다 — 실제로 속성 칸이 20px 로 쪼그라들어 **글자가 한 자씩 세로로
   * 쌓인 적이 있다.** 넘치지는 않으니 검사는 통과했고 화면은 못 읽는 상태였다.
   * 그래서 칸 너비와 라벨 높이를 잰다: 라벨이 두 줄 이상이면 뭉개진 것이다.
   */
  const topic = JSON.parse(readFileSync(join(app, 'data', 'lol.json'), 'utf8'));
  const first = topic.items[0].name;
  await page.goto(`${base}/lol/`, { waitUntil: 'networkidle' });
  await page.fill('.guessbar input', first);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${first}")`);
  await page.waitForSelector('.row .cell');
  const cell = await (await page.$('.row .cell')).boundingBox();
  const label = await (await page.$('.row .cell .k')).boundingBox();
  check(
    '좁은 화면에서도 속성 칸이 읽힌다',
    cell.width >= 40 && label.height < 24,
    `칸 ${Math.round(cell.width)}px · 라벨 ${Math.round(label.height)}px`,
  );
  await page.screenshot({ path: join(shots, 'narrow-play.png'), fullPage: true });
  await ctx.close();
}

/**
 * 손가락 자리 — 재 보니 15~35px 짜리가 일곱이었다. 작으면 잘못 눌리고, 잘못 눌리면 떠난다.
 * 눈으로는 「작아 보이지 않아서」 안 잡힌다. 그래서 잰다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  const small = [];
  const measure = async (url, sels) => {
    await page.goto(url, { waitUntil: 'networkidle' });
    for (const [sel, min] of sels) {
      for (const e of (await page.$$(sel)).slice(0, 3)) {
        const box = await e.boundingBox();
        if (box && box.height < min) small.push(`${sel} ${Math.round(box.height)}px<${min}`);
      }
    }
  };
  await measure(`${base}/pokemon/`, [['.seeds button', 44], ['.guessbar input', 44], ['.tab', 40], ['.home', 40]]);
  await page.fill('.guessbar input', '리');
  await page.waitForSelector('.sug button');
  for (const e of (await page.$$('.sug button')).slice(0, 2)) {
    const box = await e.boundingBox();
    if (box && box.height < 44) small.push(`.sug button ${Math.round(box.height)}px<44`);
  }
  await measure(`${base}/`, [['.hub-jump a', 44], ['.how summary', 40], ['.group-t a', 28]]);
  await measure(`${base}/pokemon/past/`, [['table.past .play', 36], ['.past-more button', 44]]);
  check('누르는 자리가 다 손가락만 하다', small.length === 0, small.join(' · ') || '전부 기준 이상');
  await ctx.close();
}

/**
 * **판을 이어서 두는 흐름** — 사람이 실제로 하는 그대로. 각 판은 따로 봤지만 옮겨 다니는 건 안 봤다.
 * 다음 판 링크를 눌러 옮겨도 연속이 그대로인지, 남은 판이 하나씩 줄어드는지가 여기서만 갈린다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const finishHere = async () => {
    const topicId = await page.getAttribute('#app', 'data-topic');
    const mode = await page.getAttribute('#app', 'data-mode');
    const topic = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
    const answer = answerOf(topic, new Date(), mode === 'classic' ? '' : mode);
    await page.fill('.guessbar input', answer.name);
    await page.waitForSelector('.sug button');
    await page.click(`.sug button:has-text("${answer.name}")`);
    await page.waitForSelector('.done:not([hidden])');
    return `${topicId}/${mode}`;
  };

  await page.goto(`${base}/pokemon/`, { waitUntil: 'networkidle' });
  const played = [await finishHere()];

  // 다음 판 링크를 눌러 두 판 더 — 「오늘 것」만 따라간다(어제 판·전체 보기는 건너뛴다).
  for (let i = 0; i < 2; i += 1) {
    const next = await page.$$eval('.done .more a', (els) =>
      els.map((e) => e.getAttribute('href')).find((h) => !h.includes('?d=') && h !== '/daily/'),
    );
    if (!next) break;
    await page.goto(`${base}${next.replace('/daily', '')}`, { waitUntil: 'networkidle' });
    played.push(await finishHere());
  }

  check('판을 이어서 셋을 뒀다', played.length === 3, played.join(' → '));
  check('옮겨 다녀도 연속은 하루 하나다', /연속 1일/.test(await page.locator('.done .tally').innerText()));
  check('이어 두는 동안 콘솔 오류 0', errors.length === 0, errors.join(' | '));

  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  check('허브가 푼 만큼 줄여 센다', /남은 판 3개/.test(await page.locator('.hub-note').innerText()), await page.locator('.hub-note').innerText());
  check('허브가 푼 판 셋을 표시한다', (await page.locator('.card.done-today').count()) === 3);
  await ctx.close();
}

/**
 * **지는 판** — 여기까지 온 적이 한 번도 없었다. 안 돈 경로에 사고가 몰린다.
 * 다 틀렸을 때 정답을 알려 주는지, 격자가 X 로 남는지, 기록에 실패로 들어가는지 본다.
 */
for (const [topicId, mode, limit] of [['lol', 'classic', 8], ['lol', 'silhouette', 6]]) {
  const topic = JSON.parse(readFileSync(join(app, 'data', `${topicId}.json`), 'utf8'));
  const answer = answerOf(topic, new Date(), mode === 'classic' ? '' : mode);
  const wrongs = topic.items.filter((i) => i.name !== answer.name).slice(0, limit);
  const path = mode === 'classic' ? topicId : `${topicId}/${mode}`;

  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/${path}/`, { waitUntil: 'networkidle' });
  for (const w of wrongs) {
    await page.fill('.guessbar input', w.name);
    await page.waitForSelector('.sug button');
    await page.click(`.sug button:has-text("${w.name}")`);
  }
  await page.waitForSelector('.done:not([hidden])', { timeout: 10000 });
  const text = await page.locator('.done').innerText();
  check(`[지는판:${mode}] 실패라고 말한다`, /오늘은 실패/.test(text), text.split('\n')[0]);
  check(`[지는판:${mode}] 그래도 정답은 알려 준다`, text.includes(answer.name), answer.name);
  check(`[지는판:${mode}] 입력칸을 닫는다`, await page.locator('.guessbar').isHidden());
  check(`[지는판:${mode}] 다음 판을 건넨다`, (await page.locator('.done .more a').count()) > 0);
  check(`[지는판:${mode}] 콘솔 오류 0`, errors.length === 0, errors.join(' | '));
  if (mode === 'silhouette') {
    // 져도 그림은 드러나야 한다 — 못 맞힌 사람이야말로 「뭐였는데?」를 봐야 한다.
    const f = await page.$eval('.shot img', (e) => e.style.filter);
    check('[지는판:silhouette] 져도 그림이 드러난다', f === 'none', f || '(빈값)');
  }
  await page.screenshot({ path: join(shots, `${topicId}-${mode}-lost.png`), fullPage: true });
  await ctx.close();
}

/** 지난 문제 목록에서 그날 판으로 바로 갈 수 있어야 한다. */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${base}/pokemon/past/`, { waitUntil: 'networkidle' });
  const links = await page.$$eval('table.past .play', (els) => els.map((e) => e.getAttribute('href')));
  check('지난 문제에서 풀어보기로 간다', links.length > 5 && links.every((h) => /\?d=\d{4}-\d{2}-\d{2}$/.test(h)), `${links.length}개`);
  // 실루엣 답을 보여 주면서 실루엣은 못 풀게 두면 안 된다 — 판마다 하나씩 걸려 있어야 한다.
  // 날짜가 두 줄로 쪼개지면 못 읽는다 — 실제 높이로 잰다.
  const dh = await page.$eval('table.past .d', (e) => e.getBoundingClientRect().height);
  check('지난 문제 날짜가 한 줄로 읽힌다', dh < 26, `${Math.round(dh)}px`);
  const rows = await page.locator('table.past tbody tr').count();
  check('★ 실루엣 판도 그날로 갈 수 있다', links.filter((h) => h.includes('silhouette/')).length === rows, `${rows}줄 중 ${links.filter((h) => h.includes('silhouette/')).length}개`);

  // 링크가 진짜 그날 그 판을 여는지 — 주소만 맞고 안 열리면 소용없다.
  const sil = links.find((h) => h.includes('silhouette/'));
  await page.goto(new URL(sil, `${base}/pokemon/past/`).href, { waitUntil: 'networkidle' });
  check('★ 그 링크가 실루엣 연습 판을 연다', (await page.locator('.tab.practice').count()) === 1 && (await page.locator('.shot').count()) === 1);
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

/**
 * 카드는 자기가 여는 놀이를 보여 줘야 한다.
 * 실루엣 카드에 초록·노랑 격자가 붙어 있었다 — 그건 속성 판 그림이라 다른 놀이를 광고하는 셈이었다.
 * 문구가 아니라 **찍힌 그림의 픽셀**을 본다.
 */
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const greenRatio = async (name) => {
    const url = `${base}/img/og/${name}.png`;
    return page.evaluate(
      (src) =>
        new Promise((done) => {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            const { data } = g.getImageData(0, 400, img.width, 230); // 그림·격자가 앉는 띠
            let hit = 0;
            for (let i = 0; i < data.length; i += 4) {
              // 속성 판의 「맞음」 초록 — 녹색이 뚜렷이 앞서는 픽셀만 센다.
              if (data[i + 1] > 90 && data[i + 1] - data[i] > 40 && data[i + 1] - data[i + 2] > 20) hit += 1;
            }
            done(hit / (data.length / 4));
          };
          img.src = src;
        }),
      url,
    );
  };
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }); // 캔버스로 읽으려면 같은 출처의 페이지가 필요하다
  const classic = await greenRatio('pokemon');
  const sil = await greenRatio('pokemon-silhouette');
  check('[공유카드] 속성 카드엔 초록 격자가 있다', classic > 0.004, `${(classic * 100).toFixed(2)}%`);
  check('[공유카드] ★ 실루엣 카드엔 속성 격자가 없다', sil < classic / 3, `${(sil * 100).toFixed(2)}%`);
  await ctx.close();
}

// 허브
const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
const page = await ctx.newPage();
await page.goto(`${base}/`, { waitUntil: 'networkidle' });
check('허브가 판을 다 건다', (await page.locator('.card').count()) >= 4);
const groups = await page.locator('.group').count();
check('허브가 주제로 묶어 보여 준다', groups >= 3, groups + '묶음');
check('허브에 하는 법이 있다', (await page.locator('.how li').count()) >= 3);
  /**
   * 만들어 놓고 아무 데도 안 적으면 없는 기능이다. 하는 법 설명이 **지금 있는 것들**을 다 말하는지 본다.
   * (첫 자음 검색과 지난 문제 연습은 만든 날 이 설명에 안 들어가 있었다.)
   */
  // 접혀 있는 <details> 는 innerText 로 안 읽힌다 — 보이는 글만 주기 때문이다.
  const howto = await page.$eval('details.how', (e) => e.textContent);
  const missing = ['속성', '실루엣', '첫 자음', '지난 문제'].filter((w) => !howto.includes(w));
  check('★ 하는 법이 있는 기능을 다 말한다', missing.length === 0, missing.join(', ') || '넷 다 적혀 있다');
// 고를 것부터 정해야 하는 화면은 그만큼 사람을 놓친다 — 한 번에 시작할 길이 있어야 한다.
const jump = page.locator('.hub-jump a');
check('허브에서 한 번에 시작할 수 있다', (await jump.count()) === 1, await jump.innerText().catch(() => ''));
check('허브에서 지난 문제로 갈 수 있다', (await page.locator('.group-t a').count()) >= 2);

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
  // 한 판 푼 뒤에는 「이어서」로 바뀌고, 이미 푼 판을 가리키지 않아야 한다.
  const jumped = await page.locator('.hub-jump a').getAttribute('href');
  check('시작 단추가 안 푼 판을 가리킨다', jumped !== '/daily/pokemon/', jumped ?? '(없음)');
  check('시작 단추 문구가 상황에 맞다', /이어서/.test(await page.locator('.hub-jump a').innerText()));
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

/**
 * 오늘 판을 다 푼 사람에게도 갈 곳이 있어야 한다 — 「내일 또」만 남기면 그대로 나간다.
 * (상태를 바꾸는 검사라 이 블록의 **맨 끝**에 둔다. 앞에 끼우면 뒤 검사가 굶는다 — 두 번 그랬다.)
 */
{
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    for (const el of document.querySelectorAll('.card[data-topic]')) {
      localStorage.setItem(
        `daily:${el.dataset.topic}:${el.dataset.mode}`,
        JSON.stringify({ day, guesses: ['x'], status: 'won' }),
      );
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  const allDone = await page.locator('.hub-jump a').innerText();
  check('다 푼 사람에겐 어제 판을 건넨다', /어제 판/.test(allDone), allDone);
  check('그 링크가 어제 날짜를 가리킨다', /\?d=\d{4}-\d{2}-\d{2}$/.test(await page.locator('.hub-jump a').getAttribute('href')));
  check('다 풀었다고 말해 준다', /다 풀었다/.test(await page.locator('.hub-note').innerText()));

  /**
   * 연속이 끊기면 **끊겼다고 말해야** 한다. 여태 불꽃만 조용히 사라졌다 —
   * 매일 오던 사람이 하루 걸렀을 때, 본인은 기록이 사라진 줄도 왜인지도 모른다.
   */
  await page.evaluate(() => {
    const day = Math.floor((Date.now() + 9 * 3600 * 1000) / 86400000);
    localStorage.setItem('daily:streak', JSON.stringify({ days: 5, streak: 4, best: 5, lastDay: day - 4 }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  const said = await page.locator('.hub-note').innerText();
  check('★ 연속이 끊기면 끊겼다고 말한다', /끊겼어요/.test(said) && /최고 5일/.test(said), said);
}

await ctx.close();


/**
 * 내부 링크가 **실제로 닿는지** 본다.
 *
 * 이 사이트의 링크는 깊이가 제각각이다 — 속성판은 /daily/<주제>/, 실루엣판은 한 칸 더 깊고,
 * 지난 문제는 또 다르다. 그래서 상대 경로 하나가 틀리면 조용히 404 로 간다.
 * 오늘만 두 번 손으로 맞췄다 (모드 단추의 날짜, 안내문의 「지난 문제 보기」).
 * 사람 눈으로 맞추는 대신 전부 눌러 본다. 자바스크립트가 나중에 꽂는 링크도 포함이다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  const pages = [
    '',
    'pokemon/',
    'pokemon/silhouette/',
    'pokemon/past/',
    'lol/',
    'lol/silhouette/',
    'genshin/past/',
    // 못 여는 날 — 여기서만 뜨는 안내문 링크가 있다. **깊이가 다른 두 판을 다 봐야 한다**:
    // 실루엣판만 한 칸 더 깊어서, 한쪽만 보면 다른 쪽이 깨져도 안 잡힌다 (실제로 안 잡혔다).
    'pokemon/?d=2099-01-01',
    'pokemon/silhouette/?d=2099-01-01',
  ];
  const broken = [];
  let seen = 0;
  for (const path of pages) {
    await page.goto(`${base}/${path}`, { waitUntil: 'networkidle' });
    const hrefs = await page.$$eval('a[href]', (els) => els.map((e) => e.href));
    for (const href of [...new Set(hrefs)]) {
      // 우리 dist 안의 것만 본다 — /karmolab 같은 이웃 앱은 이 서버에 없다(실주소 검사가 본다).
      if (!href.startsWith(base)) continue;
      seen += 1;
      const res = await fetch(href, { redirect: 'follow' });
      if (!res.ok) broken.push(`/${path} → ${href.replace(base, '')} (${res.status})`);
    }
  }
  check('★ 내부 링크가 전부 닿는다', broken.length === 0, broken.join(' · ') || `${seen}개 눌러 봄`);

  /**
   * 링크 글자는 그 자체로 뜻이 있어야 한다.
   * 허브에 「지난 문제는 <여기>」가 있었다 — 화면 낭독기로 링크만 훑으면 「여기, 여기, 여기」로
   * 들리고, 검색 엔진에도 그 링크가 무엇인지 아무 단서가 안 남는다.
   */
  const vague = [];
  for (const path of pages) {
    await page.goto(`${base}/${path}`, { waitUntil: 'networkidle' });
    const bad = await page.$$eval('a', (els) =>
      els
        .map((e) => ({ text: (e.getAttribute('aria-label') || e.textContent || '').trim(), href: e.getAttribute('href') }))
        .filter((a) => ['여기', '이곳', '링크', '클릭', '보기', '더보기'].includes(a.text))
        .map((a) => `${a.text}(${a.href})`),
    );
    if (bad.length) vague.push(`/${path}: ${bad.join(', ')}`);
  }
  check('★ 뜻 없는 링크 글자가 없다', vague.length === 0, vague.join(' · ') || '「여기」류 0개');
  await ctx.close();
}

/**
 * 접근성 바닥 — **지금 0건이라서 지금 잠근다.**
 *
 * 이런 것들은 하나씩 슬금슬금 들어오고, 눈으로 보는 사람에게는 끝까지 아무 표도 안 난다:
 * alt 없는 그림, 이름 없는 단추(아이콘만 든 것), 건너뛴 제목 단계, 이름표 없는 입력칸.
 * 지금은 네 페이지 다 깨끗하다. 깨끗한 김에 기계에 맡긴다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  const sins = [];
  for (const path of ['', 'pokemon/', 'pokemon/silhouette/', 'pokemon/past/']) {
    await page.goto(`${base}/${path}`, { waitUntil: 'networkidle' });
    const r = await page.evaluate(() => {
      const noAlt = [...document.querySelectorAll('img')].filter((e) => !e.hasAttribute('alt')).length;
      const nameless = [...document.querySelectorAll('button, a')].filter(
        (e) => !(e.getAttribute('aria-label') || e.textContent.trim() || e.querySelector('img[alt]:not([alt=""])')),
      ).length;
      const heads = [...document.querySelectorAll('h1,h2,h3,h4')].map((e) => Number(e.tagName[1]));
      let skip = null;
      for (let i = 1; i < heads.length; i += 1) if (heads[i] - heads[i - 1] > 1) skip = `${heads[i - 1]}→${heads[i]}`;
      const noLabel = [...document.querySelectorAll('input')].filter((e) => !e.getAttribute('aria-label') && !e.labels?.length).length;
      return { noAlt, nameless, skip, noLabel, lang: document.documentElement.lang, h1: document.querySelectorAll('h1').length };
    });
    if (r.noAlt) sins.push(`/${path} alt 없는 그림 ${r.noAlt}`);
    if (r.nameless) sins.push(`/${path} 이름 없는 단추·링크 ${r.nameless}`);
    if (r.skip) sins.push(`/${path} 제목 단계 건너뜀 ${r.skip}`);
    if (r.noLabel) sins.push(`/${path} 이름표 없는 입력칸 ${r.noLabel}`);
    if (r.lang !== 'ko') sins.push(`/${path} 언어 표시 ${r.lang || '없음'}`);
    if (r.h1 !== 1) sins.push(`/${path} h1 ${r.h1}개`);
  }
  check('★ 접근성 바닥이 지켜진다', sins.length === 0, sins.join(' · ') || '네 페이지 전부 깨끗');
  await ctx.close();
}

/**
 * 그림 무게 — **폰 데이터로 놀 만한 물건인가.**
 *
 * 포켓몬 그림은 두 벌이다: 도트 0.5~2KB, 공식 일러스트 140~200KB (300배). 여태 목록·자동완성·
 * 추측 줄까지 전부 큰 것을 썼다 — 두 글자만 쳐도 여덟 장이 뜨면서 1MB 넘게 나갔고,
 * 지난 문제 한 장을 훑으면 그것만 460KB 였다. 화면은 똑같이 보이니 눈으로는 절대 안 잡힌다.
 *
 * 지금은 목록 쪽이 전부 도트다. 큰 것은 실루엣 판 한 장뿐이다. 다시 커지면 여기서 막는다.
 */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const page = await ctx.newPage();
  let imgKB = 0;
  page.on('response', async (r) => {
    if (!/\.(png|jpg|jpeg|webp)/i.test(r.url())) return;
    try { imgKB += (await r.body()).length / 1024; } catch { /* 취소된 요청 */ }
  });

  await page.goto(`${base}/pokemon/`, { waitUntil: 'networkidle' });
  imgKB = 0;
  await page.fill('.guessbar input', '이상');
  await page.waitForSelector('.sug button');
  await page.waitForTimeout(1200);
  check('★ 자동완성 그림이 가볍다', imgKB < 60, `${imgKB.toFixed(0)}KB (예전 500KB 넘음)`);

  // 앞 화면에서 받아 둔 그림이 캐시에 남으면 0KB 로 재져 검사가 헛돈다 — 새 창에서 잰다.
  const fresh = await browser.newContext({ viewport: { width: 390, height: 840 } });
  const fpage = await fresh.newPage();
  let pastKB = 0;
  fpage.on('response', async (r) => {
    if (!/\.(png|jpg|jpeg|webp)/i.test(r.url())) return;
    try { pastKB += (await r.body()).length / 1024; } catch { /* 취소된 요청 */ }
  });
  // 롤이 가장 무거웠다 — 한 장 훑는 데 1.36MB. 포켓몬만 재면 이 사고를 못 본다.
  await fpage.goto(`${base}/lol/past/`, { waitUntil: 'networkidle' });
  await fpage.mouse.wheel(0, 6000);
  await fpage.waitForTimeout(1500);
  // 답이 가려져 있는 동안 그림은 아무 뜻도 없다 — 한 장도 안 받아야 한다.
  check('★ 가려진 동안엔 그림을 안 받는다', pastKB === 0, `${pastKB.toFixed(0)}KB (예전 1359KB)`);

  // 열면 그때 받아 와야 한다 — 안 받아 오면 열어도 빈 자리만 남는다.
  await fpage.click('.past-reveal button');
  await fpage.waitForTimeout(2000);
  const shown = await fpage.$$eval('table.past img', (els) => els.filter((e) => e.naturalWidth > 0).length);
  const total = await fpage.locator('table.past img').count();
  // 한꺼번에 예순 장을 쏟으면 안 된다 — 열어도 **눈에 들어온 것만** 받아야 한다 (예전엔 1.1MB).
  check(
    '★ 열어도 보이는 것만 받는다',
    pastKB > 0 && shown > 0 && shown < total / 2,
    `${pastKB.toFixed(0)}KB · ${shown}/${total}장`,
  );

  // 내려가면 그때 이어서 받아야 한다 — 안 받으면 아래쪽은 빈 자리로 남는다.
  await fpage.mouse.wheel(0, 8000);
  await fpage.waitForTimeout(1800);
  const more = await fpage.$$eval('table.past img', (els) => els.filter((e) => e.naturalWidth > 0).length);
  check('★ 내려가면 이어서 받는다', more > shown, `${shown} → ${more}장`);
  await fresh.close();

  // 실루엣만 큰 그림을 쓴다 — 거기선 그림이 전부라 도트로는 못 푼다.
  await page.goto(`${base}/pokemon/silhouette/`, { waitUntil: 'networkidle' });
  const shotSrc = await page.getAttribute('.shot img', 'src');
  check('실루엣은 큰 그림을 쓴다', /official-artwork/.test(shotSrc ?? ''), (shotSrc ?? '').slice(-46));

  /**
   * 답을 공개하는 순간도 큰 그림이어야 한다 — 한 장뿐인데 도트로 두면 공개가 초라하다.
   * (목록·추측 줄은 그대로 작은 것. 큰 것을 쓰는 자리는 둘뿐이다.)
   */
  const topicP = JSON.parse(readFileSync(join(app, 'data', 'pokemon.json'), 'utf8'));
  const answerP = answerOf(topicP, new Date());
  await page.goto(`${base}/pokemon/`, { waitUntil: 'networkidle' });
  await page.fill('.guessbar input', answerP.name);
  await page.waitForSelector('.sug button');
  await page.click(`.sug button:has-text("${answerP.name}")`);
  await page.waitForSelector('.done:not([hidden])');
  const ansSrc = await page.getAttribute('.done .ans img', 'src');
  const rowSrc = await page.getAttribute('.row .who img', 'src');
  check(
    '★ 답 공개는 큰 그림, 추측 줄은 작은 그림',
    /official-artwork/.test(ansSrc ?? '') && !/official-artwork/.test(rowSrc ?? ''),
    `공개 ${(ansSrc ?? '').slice(-24)} · 줄 ${(rowSrc ?? '').slice(-24)}`,
  );
  await ctx.close();
}

await browser.close();
server.close();

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} 통과 · 스샷 ${shots}`);
process.exit(failed.length ? 1 : 0);
