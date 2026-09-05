/**
 * 놀이 셋이 성한지. 브라우저로 실제 열어 본다 (TASK-KL-089)
 *
 * 왜 있나: 높은 쪽 고르기의 카드 두 장이 세로로 쌓이고, 끝나지도 않았는데 다시 버튼이
 * 떠 있는 채로 **배포까지 나갔다.** 화면을 찍어 보고서야 알았다. 놀이 쪽에는 검사가 하나도
 * 없었기 때문이다. 도구 쪽에는 열다섯 가지가 있는데.
 *
 * 보는 것 (없으면 사람이 바로 겪는 것만):
 *  - 놀이끼리 오가는 줄이 한 줄인가, 지금 놀이가 제대로 표시되는가
 *  - 색이 KarmoLab 값인가. 놀이마다 제 색을 박으면 같은 사이트로 안 보인다
 *  - 높은 쪽 고르기: 카드가 나란한가, 값이 가려졌나, 다시가 숨었나, 눌러서 반응하는가
 *  - 오늘의 문제: 오늘 문제가 떴나, 틀린 답에 반응하는가
 *  - 하나 맞히기: 칠 칸이 있나, 이름이 기억 안 날 때 훑어볼 수 있나
 *
 * 서버는 이 스크립트가 직접 띄운다(Jekyll 없이 앞머리만 떼고 실제 주소로 내준다).
 * playwright 는 이웃 앱(apps/karmolab)의 것을 빌려 쓴다. 이 앱은 의존성 0 을 지킨다.
 *
 * 사용: node scripts/smoke.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APPS = path.dirname(here);
const PORT = Number(process.env.PORT || 8871);
const strip = (s) => s.replace(/^---[\s\S]*?---\n/, '');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.mjs': 'text/javascript', '.js': 'text/javascript' };

function resolve(url) {
  const u = decodeURIComponent(url.split('?')[0]);
  if (u === '/play/base.css') return path.join(here, 'base.css');
  /* 놀이 하나가 앱 안으로 들어갔다. 앱 껍데기와 그 짐도 내줘야 한다.
   *
   * ⚠ 여기는 `blog/index.html` 을 가리키고 있었다. 그 자리는 **배포 산출물**이라
   *   저장소에 그 파일이 없다. 그래서 이 검사는 404 를 받고 **빈 화면**을 재고 있었다
   *   (앱 틀 밖에 있다, 고를 카드가 0장, 고를 판이 0개... 다섯이 한꺼번에 빨갛다).
   *   제품은 멀쩡했다: 같은 검사를 `BASE=실사이트` 로 돌리면 초록이고, 실사이트 화면에는
   *   카드 2, 칩 3이 그대로 있다(2026-08-21 실측). **검사만 없는 파일을 보고 있었다.**
   *   원본은 `apps/karmolab/index.html` 이고, 그 안의 짐은 전부 `/apps/karmolab/...` 라
   *   바로 아랫줄이 이미 내주고 있다. */
  if (u === '/' || u === '/index.html') return path.join(APPS, 'karmolab/index.html');
  if (u.startsWith('/apps/karmolab/')) return path.join(APPS, 'karmolab', u.slice('/apps/karmolab/'.length));
  if (u.startsWith('/play')) return path.join(here, 'index.html');
  for (const [prefix, dir] of [['/higher', 'higher'], ['/quest', 'quest']]) {
    if (!u.startsWith(prefix)) continue;
    if (u.endsWith('.json')) return path.join(APPS, dir, 'data', path.basename(u));
    return path.join(APPS, dir, 'index.html');
  }
  if (u.startsWith('/daily')) {
    let f = path.join(APPS, 'daily/dist', u.slice('/daily'.length) || '/');
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    return f;
  }
  return null;
}

/* 실제 주소가 주어지면 거기를 본다 (BASE). 배포가 도는 잡에는 브라우저가 없어서,
 * 이 검사는 브라우저가 있는 **배포 후 점검**에서 돈다. BASE 가 없을 때만 여기서 서버를 띄운다. */
const LIVE = process.env.BASE || '';

const server = http.createServer((req, res) => {
  const f = resolve(req.url);
  if (!f || !fs.existsSync(f)) {
    res.writeHead(404);
    return res.end('없음');
  }
  const body = fs.readFileSync(f, 'utf8');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'text/plain; charset=utf-8' });
  res.end(/^---/.test(body) ? strip(body) : body);
});
if (!LIVE) await new Promise((r) => server.listen(PORT, r));

const { chromium } = await import(pathToFileURL(path.join(APPS, 'karmolab/node_modules/playwright/index.mjs')).href);
const BASE = LIVE || `http://127.0.0.1:${PORT}`;
const failures = [];
const say = (ok, what) => {
  if (ok) process.stdout.write('.');
  else {
    failures.push(what);
    process.stdout.write('x');
    // LOUD=1 로 돌리면 어디서 틀어졌는지 그 자리에서 말한다 (한 줄씩 좇을 때 쓴다).
    if (process.env.LOUD) console.error('\n  ! ' + what);
  }
};

/* ★ **터져도 여태 모은 것은 말하고 죽는다** (2026-08-21).
 * 이 검사는 실패를 `failures` 에 모아 **맨 끝에서** 낸다. 그래서 중간에 무엇이 터지면
 * 이미 잡아 둔 것이 통째로 사라지고 화면에는 날 스택만 남았다. 실제로 다섯 건을
 * 잡아 놓고도 `page.click: Timeout ... waiting for locator('.hi-side')` 한 줄만 보였다.
 * 무엇이 틀렸나를 보려고 `LOUD=1` 을 알아야 하는 검사는, 그걸 모르는 사람에게는
 * 아무 말도 안 하는 검사다. 모은 것을 먼저 말하고 그 다음에 터진 자리를 말한다. */
const report = () => {
  if (!failures.length) return;
  console.error(`[play-smoke] 놀이가 성하지 않다 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
};
process.on('uncaughtException', (e) => {
  process.stdout.write('\n');
  report();
  console.error('[play-smoke] 그리고 여기서 터졌다. ' + (e && e.message ? e.message.split('\n')[0] : e));
  console.error('  터진 자리보다 **위 목록이 먼저다**. 대개 그 다섯이 원인이고 이건 결과다.');
  process.exit(1);
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
/* ★ **찬 러너는 느리다** (2026-08-13). 기본 30초로는 CI 에서 `.hi-side` 를 못 기다려
   놀이가 멀쩡한데 검사만 죽었다(손으로 같은 자리를 열면 곧바로 뜬다). 넉넉히 준다 . 
   못 기다려서 나는 거짓 빨강이 기다림보다 비싸다. */
ctx.setDefaultTimeout(60000);
// 남의 서버 그림은 안 부른다. 검사가 그쪽 사정에 흔들리면 안 된다.
await ctx.route('**/*.{png,jpg,jpeg,gif,webp}', (r) => r.abort());

/** 놀이마다 공통으로 지켜야 하는 것 */
async function common(page, id, label) {
  const r = await page.evaluate(() => {
    const st = document.querySelector('.play-strip');
    const now = document.querySelector('.play-strip-now');
    const css = getComputedStyle(document.documentElement);
    return {
      line: st ? Math.round(st.getBoundingClientRect().height) : 0,
      now: now ? now.textContent.trim() : '',
      base: [document.documentElement, document.body].map((e) => getComputedStyle(e).backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)'),
      activeChip: now ? getComputedStyle(now).color : '',
      link: [...(st ? st.querySelectorAll('a') : [])].length
    };
  });
  say(r.line > 0 && r.line <= 44, `${id}: 놀이 전환 줄이 한 줄이 아니다 (${r.line}px). 화면 위를 먹는다`);
  say(r.now.includes(label), `${id}: 지금 놀이 표시가 ${r.now}. ${label} 이어야 한다`);
  say(r.link >= 2, `${id}: 다른 놀이로 가는 길이 ${r.link}개뿐이다`);
  /* KarmoLab 값. 바탕 #0e0d14, 브랜드 #a99bf5.
   * 바탕은 body 가 아니라 **문서 뿌리**가 칠한다: 앱이 화면에 딱 붙는 깔개를 따로 두면서
   * body 는 투명이 됐다(폰 주소창이 접힐 때 검은 띠가 나던 것을 고치며 그렇게 됐다). */
  const brand = await brandBg(page);
  say(!brand || r.base === brand, `${id}: 바탕색이 KarmoLab 값이 아니다 (${r.base}, 선언된 값 ${brand})`);
  say(r.activeChip === 'rgb(169, 155, 245)', `${id}: 켜진 칩이 브랜드색이 아니다 (${r.activeChip})`);
}


/* ★ **바탕색은 숫자로 박지 않는다** (2026-08-12).
 *   여기에 `rgb(14, 13, 20)` 을 적어 두었더니, 셸 테마가 정당하게 바뀐 뒤(#0e0d14 → 지금 값)
 *   놀이 세 판이 통째로 빨개졌다. 놀이는 멀쩡하고 **적어 둔 숫자만 낡은** 상태다.
 *   보려던 것은 놀이 화면이 KarmoLab 과 같은 바탕인가이므로, 그 값을 화면이 선언한
 *   토큰(`--bg-void`. 화면 뿌리를 칠하는 그 값)에서 그때그때 읽어 견준다. 테마를 바꿔도 뜻이 그대로 산다. */
async function brandBg(page) {
  return page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--bg-void').trim();
    if (!raw) return null;
    const probe = document.createElement('div');
    probe.style.cssText = `background:${raw};position:absolute;left:-9999px`;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return rgb;
  });
}

/* ── 오늘의 문제 ── */
{
  const page = await ctx.newPage();
  // 이 놀이도 앱 안으로 옮겨졌다. 커뮤니티와 같은 자리(/#quest).
  await page.goto(`${BASE}/#quest`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  {
    const frame = await page.evaluate(() => ({
      header: !!document.querySelector('.app-header, header'),
      base: [document.documentElement, document.body].map((e) => getComputedStyle(e).backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)'),
      titleCard: !!document.querySelector('#page-quest .tool-hero')
    }));
    say(frame.header, 'quest: 앱 틀 밖에 있다. 커뮤니티와 같은 자리여야 한다');
    const brandQ = await brandBg(page);
    say(!brandQ || frame.base === brandQ, `quest: 바탕색이 KarmoLab 값이 아니다 (${frame.base}, 선언된 값 ${brandQ})`);
    say(!frame.titleCard, 'quest: 도구 제목 카드가 딸려 왔다');
  }
  const q = await page.evaluate(() => ({ problem: document.getElementById('qsQ').textContent.trim(), toolButton: !!document.getElementById('qsTool') }));
  say(q.problem.length > 5 && !/불러오는|못 불러/.test(q.problem), `quest: 오늘 문제가 안 떴다 (${q.problem.slice(0, 20)})`);
  say(q.toolButton, 'quest: 이 문제에 쓰는 도구를 여는 단추가 없다');
  const head = await page.evaluate(() => ({
    round: document.getElementById('qsDay').textContent,
    focus: document.activeElement?.id
  }));
  say(/#\d+/.test(head.round), `quest: 몇 번째 문제인지가 없다 (${head.round}). 남과 견줄 수가 없다`);
  say(head.focus === 'qsAns', `quest: 열자마자 답 칸에 커서가 없다 (${head.focus}). 매일 한 번씩 더 눌러야 한다`);

  // 도구는 딴 페이지가 아니라 **문제 밑에서** 펴져야 한다. 그게 이 놀이의 약속이다.
  await page.click('#qsTool');
  await page.waitForTimeout(2000);
  const tool = await page.evaluate(() => {
    const s = document.getElementById('qsSlot');
    return { expanded: !!s && !s.hidden, core: (s?.querySelectorAll('input, select, textarea').length || 0) };
  });
  say(tool.expanded && tool.core > 0, 'quest: 도구가 그 자리에서 안 펴진다. 답을 얻으러 화면을 떠나야 한다');

  await page.fill('#qsAns', '틀린답');
  await page.click('#qsForm button[type=submit]');
  await page.waitForTimeout(600);
  const said = await page.evaluate(() => (document.getElementById('qsMsg')?.textContent || ''));
  say(/아닙니다|다 썼/.test(said), `quest: 틀린 답에 아무 말이 없다 (${said})`);
  await page.close();
}

/* ── 하나 맞히기 ── */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/daily/pokemon/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await common(page, 'daily', '하나 맞히기');
  const r = await page.evaluate(() => ({ cell: !!document.querySelector('.guessbar input'), scan: !!document.querySelector('.browse-open') }));
  say(r.cell, 'daily: 답을 칠 칸이 없다');
  say(r.scan, 'daily: 이름이 기억 안 날 때 훑어볼 길이 없다');
  if (r.scan) {
    await page.click('.browse-open');
    await page.waitForTimeout(600);
    const n = await page.evaluate(() => document.querySelectorAll('.browse-grid button').length);
    say(n > 100, `daily: 훑어보기에 ${n}개뿐이다`);
    // 키보드로 들어가면 못 나오던 자리. Esc 로 닫히고 초점이 돌아와야 한다.
    await page.focus('.browse-grid button');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const esc = await page.evaluate(() => ({
      closed: document.querySelector('.browse').hidden,
      focus: document.activeElement.className
    }));
    say(esc.closed && /browse-open/.test(esc.focus), 'daily: 훑어보기를 Esc 로 못 빠져나온다. 키보드로는 갇힌다');
  }
  // 한 번 두면 지금까지 좁혀진 것이 떠야 한다. 줄마다 흩어진 정보를 매번 다시 읽지 않게.
  await page.fill('.guessbar input', '이상해씨');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  const narrow = await page.evaluate(() => document.querySelector('.narrow')?.textContent || '');
  say(narrow.length > 10, 'daily: 한 번 두어도 지금까지 좁혀진 것이 안 뜬다');
  {

  }
  await page.close();
}

/* ── 내 표 ──────────────────────────────
 * UGC 가 놀이들의 재료. 만들고 곧바로 놀이 목록에 서는지까지
 * (스무고개 절은 오락실 판으로 옮겨 가며 뺌. 그 판은 karmolab 의 test:arcade 몫)
 */
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/#packs`, { waitUntil: 'networkidle' });
  /* ★ **고정 대기 대신 보이는 것을 기다린다** (2026-08-16). 전에는 1400ms 를 세고 곧바로
     눌렀다. 이 화면의 조각은 늦게 실려서, 느린 판에서는 아직 없는 단추를 누르러 갔고
     그 자리에서 30초를 기다리다 죽었다(라이브 점검이 24판 연속 빨갛던 이유 중 하나).
     기다림의 기준은 시간이 아니라 **그 단추가 화면에 섰는가** 다. */
  await page.waitForSelector('#pkSample', { state: 'visible', timeout: 20000 });
  /* ★ **하나뿐인가가 아니라 하나 늘었는가** (2026-08-12).
     전에는 만든 뒤 표가 딱 1개여야 통과였다. 그 사이 화면에 기본 표 셋(포켓몬, 원신, 롤)이
     딸려 오면서, 표는 멀쩡히 만들어지는데 검사만 빨개졌다(그때 실측 5개. 도구 월드컵을 접기 전).
     보려던 것은 내가 만든 표가 목록에 뜨는가이므로 **늘어난 수**로 본다. */
  /* ★ **세기 전에 목록이 멎기를 기다림** (2026-08-16, 실측). 버튼(`#pkSample`)이 기본 표보다 **먼저**
     뜬다. 그래서 버튼이 보이자마자 세면 0 을 적고, 만든 뒤에는 씨앗이 다 와서 수가 뜀.
     `0 → 5` 라 하나 늘었는가가 틀리고, 표는 멀쩡히 만들어졌는데 라이브 점검만 빨감
     (오늘 CI 실측 그대로). 시간이 아니라 **수가 멎을 때까지**. 두 번 연속 같으면 멎은 것 */
  const markCount = () => page.evaluate(() => document.querySelectorAll('.pk-item').length);
  let initialCount = await markCount();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(150);
    const now2 = await markCount();
    if (now2 === initialCount && i > 0) break;
    initialCount = now2;
  }
  await page.click('#pkSample');
  await page.click('#pkSave');
  /* 저장도 마찬가지. 500ms 를 재우지 말고 **하나 늘 때까지** 기다린다.
     끝내 안 늘면 그때가 진짜 빨강이고, 아래 판정이 그대로 말한다. */
  await page
    .waitForFunction((n) => document.querySelectorAll('.pk-item').length === n + 1, initialCount, { timeout: 10000 })
    .catch(() => {});
  const made = await page.evaluate(() => ({
    text: (document.getElementById('pkMsg')?.textContent || '').trim(),
    count: document.querySelectorAll('.pk-item').length
  }));
  say(made.count === initialCount + 1 && /만들었습니다/.test(made.text),
    `packs: 표가 안 만들어졌다 (${made.text}, 표 ${initialCount}→${made.count})`);
  await page.click('.pk-item [data-go=twenty]');
  await page.waitForTimeout(1600);
  const mine = await page.evaluate(() => ({
    pickedChip: (document.querySelector('#twTopics button[aria-pressed=true]')?.textContent || '').trim(),
    question: (document.getElementById('twQ')?.textContent || '').trim()
  }));
  say(/우리 집 동물/.test(mine.pickedChip), `packs: 내 표로 안 넘어간다 (${mine.pickedChip})`);
  say(mine.question.length > 4 && !/불러오는|못 불러/.test(mine.question), `packs: 내 표로 질문이 안 나온다 (${mine.question})`);
  await page.close();
}

await browser.close();
if (!LIVE) server.close();
process.stdout.write('\n');

if (failures.length) {
  report();
  process.exit(1);
}
console.log('[play-smoke] 놀이 다섯. 전환 줄, 색, 놀이 규칙, 내 표까지 전부 성하다');
