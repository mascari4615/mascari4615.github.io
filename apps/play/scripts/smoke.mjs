/**
 * 놀이 셋이 성한지 — 브라우저로 실제 열어 본다 (TASK-KL-089)
 *
 * 왜 있나: 「높은 쪽 고르기」의 카드 두 장이 세로로 쌓이고, 끝나지도 않았는데 「다시」 버튼이
 * 떠 있는 채로 **배포까지 나갔다.** 화면을 찍어 보고서야 알았다 — 놀이 쪽에는 검사가 하나도
 * 없었기 때문이다. 도구 쪽에는 열다섯 가지가 있는데.
 *
 * 보는 것 (없으면 사람이 바로 겪는 것만):
 *  - 놀이끼리 오가는 줄이 한 줄인가, 지금 놀이가 제대로 표시되는가
 *  - 색이 KarmoLab 값인가 — 놀이마다 제 색을 박으면 같은 사이트로 안 보인다
 *  - 높은 쪽 고르기: 카드가 나란한가 · 값이 가려졌나 · 「다시」가 숨었나 · 눌러서 반응하는가
 *  - 오늘의 문제: 오늘 문제가 떴나 · 틀린 답에 반응하는가
 *  - 하나 맞히기: 칠 칸이 있나 · 이름이 기억 안 날 때 훑어볼 수 있나
 *
 * 서버는 이 스크립트가 직접 띄운다(Jekyll 없이 앞머리만 떼고 실제 주소로 내준다).
 * playwright 는 이웃 앱(apps/karmolab)의 것을 빌려 쓴다 — 이 앱은 의존성 0 을 지킨다.
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
  if (u === '/karmolab/play/base.css') return path.join(here, 'base.css');
  // 놀이 하나가 앱 안으로 들어갔다 — 앱 껍데기와 그 짐도 내줘야 한다.
  if (u === '/karmolab/' || u === '/karmolab/index.html') return path.join(APPS, 'blog/karmolab/index.html');
  if (u.startsWith('/apps/karmolab/')) return path.join(APPS, 'karmolab', u.slice('/apps/karmolab/'.length));
  if (u.startsWith('/karmolab/play')) return path.join(here, 'index.html');
  for (const [prefix, dir] of [['/karmolab/higher', 'higher'], ['/karmolab/quest', 'quest']]) {
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

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
// 남의 서버 그림은 안 부른다 — 검사가 그쪽 사정에 흔들리면 안 된다.
await ctx.route('**/*.{png,jpg,jpeg,gif,webp}', (r) => r.abort());

/** 놀이마다 공통으로 지켜야 하는 것 */
async function common(page, id, label) {
  const r = await page.evaluate(() => {
    const st = document.querySelector('.play-strip');
    const now = document.querySelector('.play-strip-now');
    const css = getComputedStyle(document.documentElement);
    return {
      줄: st ? Math.round(st.getBoundingClientRect().height) : 0,
      지금: now ? now.textContent.trim() : '',
      바탕: [document.documentElement, document.body].map((e) => getComputedStyle(e).backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)'),
      켜진칩: now ? getComputedStyle(now).color : '',
      링크: [...(st ? st.querySelectorAll('a') : [])].length
    };
  });
  say(r.줄 > 0 && r.줄 <= 44, `${id}: 놀이 전환 줄이 한 줄이 아니다 (${r.줄}px) — 화면 위를 먹는다`);
  say(r.지금.includes(label), `${id}: 지금 놀이 표시가 「${r.지금}」 — 「${label}」 이어야 한다`);
  say(r.링크 >= 2, `${id}: 다른 놀이로 가는 길이 ${r.링크}개뿐이다`);
  /* KarmoLab 값 — 바탕 #0e0d14, 브랜드 #a99bf5.
   * 바탕은 body 가 아니라 **문서 뿌리**가 칠한다: 앱이 화면에 딱 붙는 깔개를 따로 두면서
   * body 는 투명이 됐다(폰 주소창이 접힐 때 검은 띠가 나던 것을 고치며 그렇게 됐다). */
  say(r.바탕 === 'rgb(14, 13, 20)', `${id}: 바탕색이 KarmoLab 값이 아니다 (${r.바탕})`);
  say(r.켜진칩 === 'rgb(169, 155, 245)', `${id}: 켜진 칩이 브랜드색이 아니다 (${r.켜진칩})`);
}

/* ── 높은 쪽 고르기 ── */
{
  const page = await ctx.newPage();
  // 놀이가 앱 안으로 옮겨졌다 — 커뮤니티와 같은 자리(/karmolab/#higher).
  await page.goto(`${BASE}/karmolab/#higher`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  /* 이 놀이는 커뮤니티처럼 **앱 안**에 있다 — 그러니 놀이 전환 줄이 아니라
   * 앱 틀(헤더·브랜드색) 안에 들어 있는지로 본다. */
  {
    const frame = await page.evaluate(() => ({
      헤더: !!document.querySelector('.app-header, header'),
      바탕: [document.documentElement, document.body].map((e) => getComputedStyle(e).backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)'),
      제목카드: !!document.querySelector('#page-higher .tool-hero')
    }));
    say(frame.헤더, 'higher: 앱 틀 밖에 있다 — 커뮤니티와 같은 자리여야 한다');
    say(frame.바탕 === 'rgb(14, 13, 20)', `higher: 바탕색이 KarmoLab 값이 아니다 (${frame.바탕})`);
    say(!frame.제목카드, 'higher: 도구 제목 카드가 딸려 왔다 — 놀이가 글에 파묻힌다');
  }
  const r = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.hi-side')];
    const vals = [...document.querySelectorAll('.hi-vl')].map((v) => v.textContent);
    return {
      카드수: c.length,
      나란히: c.length === 2 ? Math.abs(c[0].getBoundingClientRect().top - c[1].getBoundingClientRect().top) < 5 : false,
      오른값가림: vals[1] === '?',
      다시숨김: (document.getElementById('hiAgain')?.offsetHeight || 0) === 0,
      판칩: document.querySelectorAll('.hi-chips button').length
    };
  });
  say(r.카드수 === 2, `higher: 고를 카드가 ${r.카드수}장이다`);
  say(r.나란히, 'higher: 카드가 나란하지 않고 세로로 쌓였다 — 견주는 놀이가 안 된다');
  say(r.오른값가림, 'higher: 새로 온 쪽의 값이 미리 보인다 — 답이 새어 놀이가 성립하지 않는다');
  say(r.다시숨김, 'higher: 끝나지도 않았는데 「다시」가 떠 있다');
  say(r.판칩 >= 2, `higher: 고를 판이 ${r.판칩}개뿐이다`);
  await page.click('.hi-side');
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ 값공개: (document.querySelectorAll('.hi-vl')[1]?.textContent || '') !== '?', 말: (document.getElementById('hiMsg')?.textContent || '').trim() }));
  say(after.값공개 && after.말.length > 0, 'higher: 눌러도 값이 안 열리거나 아무 말이 없다');

  /* 이 놀이의 문법 자체 — 이긴 쪽이 자리에 남아야 방금 본 값과 계속 견줄 수 있다.
   * 매판 둘 다 새로 뽑히면 판이 끊겨서 다른 놀이가 된다. */
  if (/맞았|신기록/.test(after.말)) {
    const winner = await page.evaluate(() => {
      const v = [...document.querySelectorAll('.hi-vl')].map((x) => parseFloat(String(x.textContent).replace(/[^0-9.-]/g, '')));
      const n = [...document.querySelectorAll('.hi-nm')].map((x) => x.textContent);
      return v[0] > v[1] ? n[0] : n[1];
    });
    await page.waitForTimeout(1400);
    const stay = await page.evaluate(() => ({
      왼쪽: (document.querySelector('#hiA .hi-nm')?.textContent || ''),
      왼쪽값보임: (document.querySelectorAll('.hi-vl')[0]?.textContent || '') !== '?',
      오른값가림: (document.querySelectorAll('.hi-vl')[1]?.textContent || '') === '?'
    }));
    say(stay.왼쪽 === winner, `higher: 이긴 쪽이 자리에 안 남는다 (${winner} → ${stay.왼쪽}) — 견주는 맛이 사라진다`);
    say(stay.왼쪽값보임 && stay.오른값가림, 'higher: 남은 쪽 값이 가려졌거나 새 쪽 값이 미리 보인다');
  }

  /* 아래 둘은 **이겼든 졌든 돌아야 한다** (TASK-KL-089).
   * 위 검사를 「이겼을 때만」으로 묶어 두었더니, 첫 판을 지는 날에는 통째로 건너뛰었다 —
   * 그 사이에 진짜 사고(진짜 클릭이 씹히는 것)가 지나갔는데도 검사는 초록이었다. */
  if (await page.evaluate(() => (document.getElementById('hiAgain')?.offsetHeight || 0) > 0)) {
    await page.click('#hiRetry');
    await page.waitForTimeout(700);
  }

  /* 손가락이 튀면 판이 두 번 넘어가 원치 않는 답이 들어간다.
   * 도구의 click 은 버튼이 살아나길 기다려 주므로 그걸로는 연타를 못 만든다 — 그 자리에서 곧바로 부른다. */
  {
    const tap = await page.evaluate(() => {
      const was = Number((document.getElementById('hiStreak')?.textContent || '0'));
      const a = document.getElementById('hiA');
      a.click();
      a.click();
      a.click();
      return { was, now: Number((document.getElementById('hiStreak')?.textContent || '0')) };
    });
    say(tap.now - tap.was <= 1, `higher: 손가락이 튀니 판이 ${tap.now - tap.was}번 넘어갔다 — 원치 않는 답이 들어간다`);
    await page.waitForTimeout(1400);
    if (await page.evaluate(() => (document.getElementById('hiAgain')?.offsetHeight || 0) > 0)) {
      await page.click('#hiRetry');
      await page.waitForTimeout(700);
    }
  }

  /* 반대 방향 — 연타를 막으려다 새 그림을 보고 바로 누른 진짜 클릭까지 먹은 적이 있다.
   * 스무 판을 다 맞혔는데 연승이 10 이었다. 네 번 눌러 네 번 다 먹히는지 본다. */
  {
    let counted = 0;
    for (let i = 0; i < 4; i++) {
      const s0 = await page.evaluate(() => Number((document.getElementById('hiStreak')?.textContent || '0')));
      await page.click('.hi-side');
      await page.waitForTimeout(1250);
      const s1 = await page.evaluate(() => Number((document.getElementById('hiStreak')?.textContent || '0')));
      const over = await page.evaluate(() => (document.getElementById('hiAgain')?.offsetHeight || 0) > 0);
      if (s1 !== s0 || over) counted++;
      if (over) {
        await page.click('#hiRetry');
        await page.waitForTimeout(700);
      }
    }
    say(counted === 4, `higher: 네 번 눌렀는데 ${counted}번만 먹혔다 — 새 판 직후 클릭이 씹힌다`);
  }

  await page.close();
}

/* ── 오늘의 문제 ── */
{
  const page = await ctx.newPage();
  // 이 놀이도 앱 안으로 옮겨졌다 — 커뮤니티와 같은 자리(/karmolab/#quest).
  await page.goto(`${BASE}/karmolab/#quest`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  {
    const frame = await page.evaluate(() => ({
      헤더: !!document.querySelector('.app-header, header'),
      바탕: [document.documentElement, document.body].map((e) => getComputedStyle(e).backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)'),
      제목카드: !!document.querySelector('#page-quest .tool-hero')
    }));
    say(frame.헤더, 'quest: 앱 틀 밖에 있다 — 커뮤니티와 같은 자리여야 한다');
    say(frame.바탕 === 'rgb(14, 13, 20)', `quest: 바탕색이 KarmoLab 값이 아니다 (${frame.바탕})`);
    say(!frame.제목카드, 'quest: 도구 제목 카드가 딸려 왔다');
  }
  const q = await page.evaluate(() => ({ 문제: document.getElementById('qsQ').textContent.trim(), 도구단추: !!document.getElementById('qsTool') }));
  say(q.문제.length > 5 && !/불러오는|못 불러/.test(q.문제), `quest: 오늘 문제가 안 떴다 (${q.문제.slice(0, 20)})`);
  say(q.도구단추, 'quest: 이 문제에 쓰는 도구를 여는 단추가 없다');
  const head = await page.evaluate(() => ({
    회차: document.getElementById('qsDay').textContent,
    초점: document.activeElement?.id
  }));
  say(/#\d+/.test(head.회차), `quest: 몇 번째 문제인지가 없다 (${head.회차}) — 남과 견줄 수가 없다`);
  say(head.초점 === 'qsAns', `quest: 열자마자 답 칸에 커서가 없다 (${head.초점}) — 매일 한 번씩 더 눌러야 한다`);

  // 도구는 딴 페이지가 아니라 **문제 밑에서** 펴져야 한다 — 그게 이 놀이의 약속이다.
  await page.click('#qsTool');
  await page.waitForTimeout(2000);
  const tool = await page.evaluate(() => {
    const s = document.getElementById('qsSlot');
    return { 펴짐: !!s && !s.hidden, 알맹이: (s?.querySelectorAll('input, select, textarea').length || 0) };
  });
  say(tool.펴짐 && tool.알맹이 > 0, 'quest: 도구가 그 자리에서 안 펴진다 — 답을 얻으러 화면을 떠나야 한다');

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
  const r = await page.evaluate(() => ({ 칸: !!document.querySelector('.guessbar input'), 훑기: !!document.querySelector('.browse-open') }));
  say(r.칸, 'daily: 답을 칠 칸이 없다');
  say(r.훑기, 'daily: 이름이 기억 안 날 때 훑어볼 길이 없다');
  if (r.훑기) {
    await page.click('.browse-open');
    await page.waitForTimeout(600);
    const n = await page.evaluate(() => document.querySelectorAll('.browse-grid button').length);
    say(n > 100, `daily: 훑어보기에 ${n}개뿐이다`);
    // 키보드로 들어가면 못 나오던 자리 — Esc 로 닫히고 초점이 돌아와야 한다.
    await page.focus('.browse-grid button');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const esc = await page.evaluate(() => ({
      닫힘: document.querySelector('.browse').hidden,
      초점: document.activeElement.className
    }));
    say(esc.닫힘 && /browse-open/.test(esc.초점), 'daily: 훑어보기를 Esc 로 못 빠져나온다 — 키보드로는 갇힌다');
  }
  // 한 번 두면 「지금까지 좁혀진 것」이 떠야 한다 — 줄마다 흩어진 정보를 매번 다시 읽지 않게.
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

/* ── 스무고개 · 내 표 ──────────────────────────────
 * 놀이가 늘었는데 검사가 안 따라오면, 죽은 놀이가 조용히 배포된다 — 실제로 「높은 쪽 고르기」의
 * 누르는 배선이 두 회차 동안 없어진 채 나갔다. 새 놀이도 **한 판을 실제로 굴려** 본다.
 */
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/karmolab/#twenty`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const first = await page.evaluate(() => ({
    질문: (document.getElementById('twQ')?.textContent || '').trim(),
    후보: (document.getElementById('twLeft')?.textContent || '').trim(),
    단추: document.querySelectorAll('#twRow [data-say]').length
  }));
  say(first.질문.length > 4 && !/불러오는|못 불러/.test(first.질문), `twenty: 첫 질문이 안 떴다 (${first.질문.slice(0, 20)})`);
  say(first.단추 === 3, `twenty: 대답 단추가 ${first.단추}개다 — 예·아니오·모르겠어요 셋이어야 한다`);
  say(/\d/.test(first.후보), `twenty: 남은 후보 수가 안 보인다 (${first.후보})`);
  // 대답하면 후보가 실제로 줄어야 한다 — 안 줄면 묻기만 하고 아무 일도 안 하는 놀이다.
  const before = Number(first.후보.replace(/\D+/g, ''));
  await page.click('#twRow [data-say=yes]');
  await page.waitForTimeout(600);
  const next = await page.evaluate(() => ({
    질문: (document.getElementById('twQ')?.textContent || '').trim(),
    후보: Number((document.getElementById('twLeft')?.textContent || '').replace(/\D+/g, '')),
    센수: (document.getElementById('twCount')?.textContent || '').trim()
  }));
  say(next.후보 > 0 && next.후보 < before, `twenty: 대답해도 후보가 안 줄었다 (${before} → ${next.후보})`);
  say(next.질문 !== first.질문, 'twenty: 같은 질문을 또 묻는다');
  say(/2/.test(next.센수), `twenty: 몇 번째 질문인지가 안 올라간다 (${next.센수})`);

  // 내 표 — UGC 가 이 놀이들의 재료다. 만들고 곧바로 놀이 목록에 서는지까지 본다.
  await page.goto(`${BASE}/karmolab/#packs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.click('#pkSample');
  await page.click('#pkSave');
  await page.waitForTimeout(500);
  const made = await page.evaluate(() => ({
    말: (document.getElementById('pkMsg')?.textContent || '').trim(),
    개수: document.querySelectorAll('.pk-item').length
  }));
  say(made.개수 === 1 && /만들었습니다/.test(made.말), `packs: 표가 안 만들어졌다 (${made.말})`);
  await page.click('.pk-item [data-go=twenty]');
  await page.waitForTimeout(1600);
  const mine = await page.evaluate(() => ({
    고른칩: (document.querySelector('#twTopics button[aria-pressed=true]')?.textContent || '').trim(),
    질문: (document.getElementById('twQ')?.textContent || '').trim()
  }));
  say(/우리 집 동물/.test(mine.고른칩), `packs: 내 표로 안 넘어간다 (${mine.고른칩})`);
  say(mine.질문.length > 4 && !/불러오는|못 불러/.test(mine.질문), `packs: 내 표로 질문이 안 나온다 (${mine.질문})`);
  await page.close();
}

await browser.close();
if (!LIVE) server.close();
process.stdout.write('\n');

if (failures.length) {
  console.error(`[play-smoke] 놀이가 성하지 않다 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[play-smoke] 놀이 다섯 — 전환 줄·색·놀이 규칙·내 표까지 전부 성하다');
