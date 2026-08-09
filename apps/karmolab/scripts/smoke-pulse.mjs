/**
 * 박동이 **진짜로 갈리는지 / 진짜로 그려지는지 / 진짜로 소리가 나는지** 본다 (TASK-KL-207)
 *
 * 왜 이렇게 보나 — 이 도구는 세 가지 주장을 한다. 셋 다 「그려졌나」로는 안 잡힌다:
 *   ① 시각이 지나면 내용이 갈린다 → 10분을 기다릴 수 없으니 **브라우저 시계를 돌린다**
 *   ② 그림 방송은 캔버스에 실제로 뭔가 칠한다 → **나온 색이 몇 가지인지 센다**(단색 칠 = 1가지)
 *   ③ 종은 글자가 아니라 **소리**다 → `createOscillator` 를 세서 음이 예약됐는지 본다
 *
 * 여기 없는 것(사람 귀, 그림이 예쁜지)은 이 검사가 대신 못 한다 — 그건 사람 몫이다.
 *
 * 사용: node scripts/smoke-pulse.mjs [--shot out.png]   (npm run test:pulse)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { stripJekyll } from './lib/serve-static.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

/* 묶음이 없으면 「제품 고장」이 아니라 「못 돌린다」다 — 검사가 그걸 말할 줄 알아야 한다. */
if (!fs.existsSync(path.join(root, 'js/widgets/pulse/pulse.js'))) {
  console.log('[smoke-pulse] 못 돌림 — js/widgets/pulse/pulse.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/karmolab/' || u === '/karmolab') u = '/apps/karmolab/index.html';
  if (u.endsWith('/')) u += 'index.html';
  const f = path.join(repoRoot, u.replace(/^\//, ''));
  if (!f.startsWith(repoRoot) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404).end('not found');
    return;
  }
  let body = fs.readFileSync(f);
  const ext = path.extname(f);
  if (ext === '.html') body = Buffer.from(stripJekyll(String(body)), 'utf8');
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' }).end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 }, serviceWorkers: 'block' });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const NOISE = /CORS|ERR_FAILED|net::|Failed to load resource|yawnbot\.mascari4615\.com/;
page.on('console', (m) => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push('console: ' + m.text()); });

await page.addInitScript(() => {
  window.__osc = 0;
  const proto = window.AudioContext && window.AudioContext.prototype;
  if (proto) {
    const orig = proto.createOscillator;
    proto.createOscillator = function () { window.__osc++; return orig.call(this); };
  }
});

/* 10분 경계에서 딱 떨어지지 않는 시각으로 시작한다 — 경계에 걸쳐 두면
   「돌리기 전부터 이미 갈려 있었다」와 구분이 안 된다. */
await page.clock.install({ time: new Date('2026-08-09T05:03:17+09:00') });

const problems = [];
await page.goto(BASE + '/apps/karmolab/index.html#pulse', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('.pl-card', { timeout: 20000 });
await page.clock.runFor(1500);

const read = () => page.evaluate(() => {
  /* 「칠해진 화소 수」로 세면 안 된다 — 붓이 배경 한 겹만 칠하고 끝나도 화면 전체가 불투명해서
     전부 통과한다(실제로 그렇게 셌다가 단색 칠과 그림을 구분 못 했다).
     그림인지 아닌지는 **색이 몇 가지 나오느냐**로 갈린다. 단색은 1, 그림은 여럿. */
  const lit = (canvas) => {
    if (!canvas || !canvas.width) return 0;
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 13) {
      if (d[i + 3] < 8) continue;
      seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
    }
    return seen.size;
  };
  const cards = [...document.querySelectorAll('.pl-card')].map((el) => ({
    name: el.querySelector('.pl-name').textContent.trim(),
    /* 이름줄이 한 줄인지 — 셸의 단추 스타일이 flex row 를 걸면 이름이 세로로 쪼개진다.
       그래도 글자는 다 있어서 텍스트 검사로는 절대 안 잡힌다. 높이로만 잡힌다. */
    nameH: el.querySelector('.pl-name').getBoundingClientRect().height,
    face: el.querySelector('.pl-face').textContent.trim(),
    // 얼굴 안에는 큰 활자(.pl-body)와 작은 글씨(.pl-sub)가 같이 있다 — 되감기와 견줄 것은 큰 활자뿐이다
    body: (el.querySelector('.pl-body') || {}).textContent || '',
    canvas: !!el.querySelector('canvas'),
    lit: lit(el.querySelector('canvas')),
    /* 캔버스가 **다시 그려졌는지**는 글자로는 절대 못 본다(얼굴에 글자가 없으니 언제나 같다).
       화소를 훑어 지문 하나로 줄인다 — 다시 안 그리면 지문이 그대로다. */
    sig: (() => {
      const canvas = el.querySelector('canvas');
      if (!canvas || !canvas.width) return '';
      const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4 * 7) { h ^= d[i] + d[i + 1] * 3 + d[i + 2] * 7; h = Math.imul(h, 16777619); }
      return String(h >>> 0);
    })(),
    meter: parseFloat(el.querySelector('.pl-meter i').style.width) || 0,
    left: el.querySelector('.pl-left').textContent,
    beating: el.classList.contains('beating'),
    box: (({ width, height }) => ({ width: Math.round(width), height: Math.round(height) }))(el.getBoundingClientRect())
  }));
  const rows = [...(document.querySelectorAll('.pl-col')[0]?.querySelectorAll('.pl-row') || [])]
    .map((r) => r.querySelector('span').textContent);
  return {
    cards,
    past: rows,
    cols: document.querySelectorAll('.pl-col').length,
    clock: document.querySelector('#plNow').textContent,
    osc: window.__osc
  };
});

const before = await read();

if (before.cards.length !== 12) problems.push(`방송 12개여야 하는데 ${before.cards.length}개`);
for (const c of before.cards) {
  if (!c.face && !c.canvas) problems.push(`${c.name}: 얼굴이 비었다`);
  if (!/다음까지/.test(c.left)) problems.push(`${c.name}: 남은 시간이 없다`);
  if (c.nameH > 30) problems.push(`${c.name}: 이름줄이 ${Math.round(c.nameH)}px — 세로로 쪼개졌다`);
}

/* ② 그림 방송은 캔버스에 실제로 칠해야 한다. 「캔버스가 있다」로는 부족하다 —
   붓이 안 불리거나 크기를 0 으로 재면 캔버스는 멀쩡히 있고 화면만 비어 있다. */
const painted = before.cards.filter((c) => c.canvas);
if (painted.length !== 7) problems.push(`캔버스로 그리는 방송 7개여야 하는데 ${painted.length}개`);
for (const c of painted) {
  if (c.lit < 5) problems.push(`${c.name}: 그림이 아니라 단색이다 (나온 색 ${c.lit}가지)`);
  if (c.box.width < 60 || c.box.height < 60) problems.push(`${c.name}: 칸이 ${c.box.width}×${c.box.height} 로 찌그러졌다`);
}

/* 벤토 = 크기가 다른 격자. 다 같은 크기면 그냥 격자다. */
const widths = new Set(before.cards.map((c) => c.box.width));
if (widths.size < 2) problems.push('벤토인데 카드 너비가 전부 같다');

if (before.past.length !== 6) problems.push(`지나간 박동 6줄이어야 하는데 ${before.past.length}줄`);
if (!/^\d\d:\d\d:\d\d KST$/.test(before.clock)) problems.push(`시계 모양 이상: ${before.clock}`);
if (before.cards.some((c) => c.beating)) problems.push('아직 안 갈렸는데 번쩍였다');

/* **앞으로 올 박동은 안 보여야 한다.** 기다림이 이 도구의 알맹이다. */
const leaked = await page.evaluate(() => document.body.innerText);
if (/앞으로 올 박동/.test(leaked)) problems.push('미리보기가 화면에 남아 있다 — 기다림이 사라진다');

/* 되감기를 볼 방송을 고른다 — 기본 선택은 첫 카드(별밭)라 그대로 두면 엉뚱한 걸 비교한다. */
await page.click('.pl-card:nth-child(2)');
await page.waitForTimeout(200);

const shotIdx = process.argv.indexOf('--shot');
if (shotIdx > 0 && process.argv[shotIdx + 1]) await page.screenshot({ path: process.argv[shotIdx + 1], fullPage: true });

/* ③ 소리 — 켜면 그 자리에서 한 번 울려야 한다(다음 정각까지 한 시간을 기다릴 수는 없다). */
await page.click('#plSound');
await page.waitForTimeout(400);
const afterSound = await page.evaluate(() => window.__osc);
if (afterSound <= before.osc) problems.push(`소리를 켰는데 음이 하나도 안 예약됐다 (${before.osc} → ${afterSound})`);

/* ── 시계를 10분 앞으로 ─────────────────────────────────────── */
await page.clock.runFor(10 * 60 * 1000);
const after = await read();

const idx = before.cards.findIndex((c) => /세 글자/.test(c.name));
if (idx < 0) problems.push('세 글자 방송을 못 찾았다');
else {
  if (after.cards[idx].face === before.cards[idx].face) {
    problems.push(`10분이 지났는데 세 글자가 그대로다 (${before.cards[idx].face})`);
  }
  if (!after.cards[idx].beating) problems.push('갈렸는데 카드가 안 번쩍였다');
  /* 방금 지나간 것은 되감기 맨 위에 있어야 한다 — 저장 없이 다시 계산된다는 주장의 증거. */
  const wasLine = before.cards[idx].body.split('\n')[0];
  if (after.past[0] !== wasLine) problems.push(`되감기가 틀렸다 — 직전 "${wasLine}" · 첫 줄 "${after.past[0]}"`);
}

/* 눈금은 1분마다 다시 그려져야 한다. 얼굴에 글자가 없으므로 **화소 지문**으로만 확인된다. */
const gaugeBefore = before.cards.find((c) => /눈금/.test(c.name));
const gaugeAfter = after.cards.find((c) => /눈금/.test(c.name));
if (gaugeBefore && gaugeAfter && gaugeBefore.sig && gaugeBefore.sig === gaugeAfter.sig) {
  problems.push('눈금이 10분 동안 한 번도 다시 안 그려졌다 (타이머 사망)');
}
/* 반대로 하루 한 번짜리(섬)는 10분 사이에 **바뀌면 안 된다** — 바뀌면 주기를 안 지키는 것이다. */
const isleBefore = before.cards.find((c) => /섬/.test(c.name));
const isleAfter = after.cards.find((c) => /섬/.test(c.name));
if (isleBefore && isleAfter && isleBefore.sig !== isleAfter.sig) {
  problems.push('하루짜리 방송(섬)이 10분 만에 바뀌었다');
}

/* ── 타임라인 ─────────────────────────────────────────────── */
await page.click('#plViewFeed');
await page.waitForTimeout(600);
const feed = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.pl-item')];
  const stamps = items.map((el) => el.querySelector('time').textContent);
  return {
    count: items.length,
    thumbs: items.filter((el) => el.querySelector('canvas')).length,
    gridHidden: document.querySelector('.pl-grid').style.display === 'none',
    stamps,
    descending: stamps.every((s, i) => i === 0 || stamps[i - 1] >= s)
  };
});
if (feed.count < 20) problems.push(`타임라인이 ${feed.count}줄뿐이다`);
if (!feed.gridHidden) problems.push('타임라인으로 갔는데 벤토가 그대로 있다');
if (feed.thumbs < 3) problems.push(`타임라인에 그림 조각이 ${feed.thumbs}개뿐이다`);
if (!feed.descending) problems.push('타임라인이 최신순이 아니다');

/* 다른 도구에 갔다 돌아와도 멀쩡한지 — 카드가 늘거나 얼굴이 멎으면 뒷정리를 안 맡긴 것이다. */
await page.goto(BASE + '/apps/karmolab/index.html#conch', { waitUntil: 'load', timeout: 30000 });
await page.clock.runFor(500);
await page.goto(BASE + '/apps/karmolab/index.html#pulse', { waitUntil: 'load', timeout: 30000 });
/* 시계를 우리가 쥐고 있으므로 rAF 도 우리가 돌려야 한다 — 안 돌리면 셸의 등장 연출이
   영영 안 끝나고, 카드는 DOM 에 있는데 「안 보이는」 상태로 남는다(그래서 여기서 한 번 멈췄다). */
await page.waitForSelector('.pl-card', { state: 'attached', timeout: 20000 });
await page.clock.runFor(2000);
const back = await read();
if (back.cards.length !== 12) problems.push(`돌아왔더니 카드가 ${back.cards.length}개 (12개여야 한다)`);
if (back.cards.some((c) => !c.face && !c.canvas)) problems.push('돌아왔더니 얼굴이 빈 카드가 있다');

await browser.close();
server.close();

console.log(`[smoke-pulse] 방송 ${before.cards.length}개 (그림 ${painted.length}) · 시계 ${before.clock} → ${after.clock}`);
console.log(`[smoke-pulse] 소리 음 예약 ${before.osc} → ${afterSound} · 타임라인 ${feed.count}줄(그림 ${feed.thumbs})`);
for (const c of after.cards) {
  const face = c.canvas ? `🖼 색 ${c.lit}가지` : c.body.split('\n')[0];
  console.log(`  ${c.name.replace(/\s+/g, ' ')} :: ${face.slice(0, 46)}`);
}

if (errors.length) problems.push(...errors.map((e) => '오류: ' + e));
if (problems.length) {
  console.error('[smoke-pulse] 실패\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('[smoke-pulse] OK');
