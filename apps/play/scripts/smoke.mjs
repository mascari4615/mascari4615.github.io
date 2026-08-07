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
      바탕: getComputedStyle(document.body).backgroundColor,
      켜진칩: now ? getComputedStyle(now).color : '',
      링크: [...(st ? st.querySelectorAll('a') : [])].length
    };
  });
  say(r.줄 > 0 && r.줄 <= 44, `${id}: 놀이 전환 줄이 한 줄이 아니다 (${r.줄}px) — 화면 위를 먹는다`);
  say(r.지금.includes(label), `${id}: 지금 놀이 표시가 「${r.지금}」 — 「${label}」 이어야 한다`);
  say(r.링크 >= 2, `${id}: 다른 놀이로 가는 길이 ${r.링크}개뿐이다`);
  // KarmoLab 값 — 바탕 #0e0d14, 브랜드 #a99bf5
  say(r.바탕 === 'rgb(14, 13, 20)', `${id}: 바탕색이 KarmoLab 값이 아니다 (${r.바탕})`);
  say(r.켜진칩 === 'rgb(169, 155, 245)', `${id}: 켜진 칩이 브랜드색이 아니다 (${r.켜진칩})`);
}

/* ── 높은 쪽 고르기 ── */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/karmolab/higher/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await common(page, 'higher', '높은 쪽 고르기');
  const r = await page.evaluate(() => {
    const c = [...document.querySelectorAll('.side')];
    const vals = [...document.querySelectorAll('.vl')].map((v) => v.textContent);
    return {
      카드수: c.length,
      나란히: c.length === 2 ? Math.abs(c[0].getBoundingClientRect().top - c[1].getBoundingClientRect().top) < 5 : false,
      오른값가림: vals[1] === '?',
      다시숨김: document.getElementById('again').getBoundingClientRect().height === 0,
      판칩: document.querySelectorAll('.play-chips button').length
    };
  });
  say(r.카드수 === 2, `higher: 고를 카드가 ${r.카드수}장이다`);
  say(r.나란히, 'higher: 카드가 나란하지 않고 세로로 쌓였다 — 견주는 놀이가 안 된다');
  say(r.오른값가림, 'higher: 새로 온 쪽의 값이 미리 보인다 — 답이 새어 놀이가 성립하지 않는다');
  say(r.다시숨김, 'higher: 끝나지도 않았는데 「다시」가 떠 있다');
  say(r.판칩 >= 2, `higher: 고를 판이 ${r.판칩}개뿐이다`);
  await page.click('.side');
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ 값공개: document.querySelectorAll('.vl')[1].textContent !== '?', 말: document.getElementById('msg').textContent.trim() }));
  say(after.값공개 && after.말.length > 0, 'higher: 눌러도 값이 안 열리거나 아무 말이 없다');

  /* 이 놀이의 문법 자체 — 이긴 쪽이 자리에 남아야 방금 본 값과 계속 견줄 수 있다.
   * 매판 둘 다 새로 뽑히면 판이 끊겨서 다른 놀이가 된다. */
  if (/맞았|신기록/.test(after.말)) {
    const winner = await page.evaluate(() => {
      const v = [...document.querySelectorAll('.vl')].map((x) => parseFloat(String(x.textContent).replace(/[^0-9.-]/g, '')));
      const n = [...document.querySelectorAll('.nm')].map((x) => x.textContent);
      return v[0] > v[1] ? n[0] : n[1];
    });
    await page.waitForTimeout(1400);
    const stay = await page.evaluate(() => ({
      왼쪽: document.querySelector('#a .nm').textContent,
      왼쪽값보임: document.querySelectorAll('.vl')[0].textContent !== '?',
      오른값가림: document.querySelectorAll('.vl')[1].textContent === '?'
    }));
    say(stay.왼쪽 === winner, `higher: 이긴 쪽이 자리에 안 남는다 (${winner} → ${stay.왼쪽}) — 견주는 맛이 사라진다`);
    say(stay.왼쪽값보임 && stay.오른값가림, 'higher: 남은 쪽 값이 가려졌거나 새 쪽 값이 미리 보인다');

    /* 폰에서 연타하면 새 그림을 보기도 전에 두 번째 손가락이 답으로 먹혔다 — 판이 두 번 넘어간다. */
    const before = await page.evaluate(() => Number(document.getElementById('streak').textContent));
    await page.click('.side');
    await page.click('.side').catch(() => {});
    await page.waitForTimeout(500);
    const now = await page.evaluate(() => Number(document.getElementById('streak').textContent));
    say(now - before <= 1, `higher: 연타에 판이 ${now - before}번 넘어갔다 — 원치 않는 답이 들어간다`);
  }

  await page.close();
}

/* ── 오늘의 문제 ── */
{
  const page = await ctx.newPage();
  await page.goto(`${BASE}/karmolab/quest/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await common(page, 'quest', '오늘의 문제');
  const q = await page.evaluate(() => ({ 문제: document.getElementById('q').textContent.trim(), 도구: document.getElementById('tool').getAttribute('href') }));
  say(q.문제.length > 5 && !/불러오는|못 불러/.test(q.문제), `quest: 오늘 문제가 안 떴다 (${q.문제.slice(0, 20)})`);
  say(/^\/karmolab\/t\/[a-z0-9-]+\/$/.test(q.도구 || ''), `quest: 이 문제에 쓰는 도구 주소가 이상하다 (${q.도구})`);
  const head = await page.evaluate(() => ({
    회차: document.getElementById('day').textContent,
    초점: document.activeElement.id
  }));
  say(/#\d+/.test(head.회차), `quest: 몇 번째 문제인지가 없다 (${head.회차}) — 남과 견줄 수가 없다`);
  say(head.초점 === 'ans', `quest: 열자마자 답 칸에 커서가 없다 (${head.초점}) — 매일 한 번씩 더 눌러야 한다`);

  await page.fill('#ans', '틀린답');
  await page.click('button[type=submit]');
  await page.waitForTimeout(600);
  const said = await page.evaluate(() => document.getElementById('msg').textContent);
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

await browser.close();
if (!LIVE) server.close();
process.stdout.write('\n');

if (failures.length) {
  console.error(`[play-smoke] 놀이가 성하지 않다 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[play-smoke] 놀이 셋 — 전환 줄·색·놀이 규칙 전부 성하다');
