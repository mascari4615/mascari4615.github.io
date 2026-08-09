/**
 * 박동이 **진짜로 갈리는지 / 되감기가 진짜인지 / 공유 그림이 실제로 나오는지** 본다 (TASK-KL-207)
 *
 * 이 도구의 주장은 넷이고, 넷 다 「그려졌나」로는 안 잡힌다:
 *   ① 시각이 지나면 판이 갈린다 → 10분을 기다릴 수 없으니 **브라우저 시계를 돌린다**
 *   ② 지나간 판을 누르면 **그때 그 판 그대로** 무대에 올라온다 → 화소 지문을 맞춰 본다
 *   ③ 무대에 보이는 것이 **그대로 공유된다** → 공유를 눌러 나온 PNG 를 가로채 크기를 잰다
 *   ④ 앞으로 올 박동은 **안 보인다** → 화면 글자에 있으면 실패
 *
 * 여기 없는 것(사람 귀, 판이 예쁜지)은 이 검사가 대신 못 한다 — 그건 사람 몫이다.
 *
 * 사용: node scripts/smoke-pulse.mjs [--shot out.png]   (npm run test:pulse)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchOrSkip } from './lib/browser.mjs';
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

const browser = await launchOrSkip('pulse', { args: ['--autoplay-policy=no-user-gesture-required'] });
if (!browser) process.exit(0);
const ctx = await browser.newContext({ viewport: { width: 1200, height: 1200 }, serviceWorkers: 'block' });
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
  /* 공유 그림을 가로챈다 — 이 기계엔 공유 창이 없으니 클립보드 길로 온다.
     받아 낸 바이트 수가 「그림이 실제로 만들어졌다」의 유일한 증거다. */
  window.__shared = 0;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      write: async (items) => {
        for (const it of items) {
          const blob = await it.getType('image/png');
          window.__shared = blob.size;
        }
      },
      writeText: async () => {}
    }
  });
});

await page.clock.install({ time: new Date('2026-08-09T05:03:17+09:00') });

const problems = [];
await page.goto(BASE + '/apps/karmolab/index.html#pulse', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('.pl-stage canvas', { timeout: 20000 });
await page.clock.runFor(1500);

/** 캔버스 하나를 지문 + 색 가짓수로 줄인다. 「그렸나」와 「다시 그렸나」를 둘 다 여기서 본다. */
const READ = () => page.evaluate(() => {
  const scan = (canvas) => {
    if (!canvas || !canvas.width) return { sig: '', colors: 0 };
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set();
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4 * 11) {
      if (d[i + 3] < 8) continue;
      seen.add(((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4));
      h ^= d[i] + d[i + 1] * 3 + d[i + 2] * 7;
      h = Math.imul(h, 16777619);
    }
    return { sig: String(h >>> 0), colors: seen.size };
  };
  const stageEl = document.querySelector('.pl-stage');
  const stage = scan(stageEl.querySelector('canvas'));
  return {
    stage,
    /* 무대가 어느 판을 그렸는지 — 무대와 작은 판은 해상도가 달라 화소 지문끼리 못 맞춘다.
       그래서 「누른 판이 올라왔나」는 판 번호로만 확인된다. */
    stageTick: stageEl.dataset.tick,
    thumbTicks: [...document.querySelectorAll('.pl-thumb')].map((el) => el.dataset.t),
    beating: document.querySelector('.pl-stage').classList.contains('beating'),
    chips: [...document.querySelectorAll('.pl-chip[data-id]')].map((el) => ({
      id: el.dataset.id,
      label: el.textContent.trim().replace(/\s+/g, ' '),
      on: el.classList.contains('on')
    })),
    thumbs: [...document.querySelectorAll('.pl-thumb')].map((el) => scan(el.querySelector('canvas'))),
    left: document.querySelector('#plLeft').textContent,
    clock: document.querySelector('#plNow').textContent,
    osc: window.__osc,
    shared: window.__shared,
    text: document.body.innerText
  };
});

const before = await READ();

/* 방송 목록 — 글자 다섯이 앞에 있어야 한다. 이 도구의 중심이 글자다. */
if (before.chips.length !== 12) problems.push(`방송 12개여야 하는데 ${before.chips.length}개`);
const wantFirst = ['roman3', 'hangul3', 'roman4', 'hangul4', 'sigil3'];
const gotFirst = before.chips.slice(0, 5).map((c) => c.id);
if (wantFirst.join() !== gotFirst.join()) problems.push(`앞머리가 글자 방송이 아니다: ${gotFirst.join()}`);
for (const gone of ['moth', 'isle', 'garden', 'aquarium']) {
  if (before.chips.some((c) => c.id === gone)) problems.push(`걷어낸 방송이 남아 있다: ${gone}`);
}

/* 무대가 실제로 칠해졌나. 「여백의 판」이라 색은 적지만 단색(1가지)이면 안 된다. */
if (before.stage.colors < 2) problems.push(`무대가 단색이다 (색 ${before.stage.colors}가지)`);
if (before.thumbs.length !== 8) problems.push(`지나간 판 8칸이어야 하는데 ${before.thumbs.length}칸`);
if (before.thumbs.some((t) => t.colors < 2)) problems.push('지나간 판 중 빈 것이 있다');
if (before.beating) problems.push('아직 안 갈렸는데 번쩍였다');
if (!/^\d\d:\d\d:\d\d KST$/.test(before.clock)) problems.push(`시계 모양 이상: ${before.clock}`);
if (/앞으로 올 박동/.test(before.text)) problems.push('미리보기가 화면에 남아 있다 — 기다림이 사라진다');

const shotIdx = process.argv.indexOf('--shot');
if (shotIdx > 0 && process.argv[shotIdx + 1]) await page.screenshot({ path: process.argv[shotIdx + 1], fullPage: true });

/* ③ 공유 — 무대에 보이는 것이 그대로 그림이 되어 나가는가. */
await page.click('#plShare');
await page.waitForTimeout(1200);
const shared = await page.evaluate(() => window.__shared);
if (!shared) problems.push('공유를 눌렀는데 그림이 안 만들어졌다');
else if (shared < 2000) problems.push(`공유 그림이 ${shared}바이트뿐이다 (빈 판일 가능성)`);

/* 소리 — 켜면 그 자리에서 한 번 울려야 한다. */
await page.click('#plSound');
await page.waitForTimeout(400);
const osc = await page.evaluate(() => window.__osc);
if (osc <= before.osc) problems.push(`소리를 켰는데 음이 하나도 안 예약됐다 (${before.osc} → ${osc})`);

/* ① 시계를 10분 앞으로 — 세 글자는 10분마다다.
 *
 * **`runFor` 가 아니라 `fastForward`.** 둘 다 시계를 옮기지만 무엇을 시키느냐가 다르다:
 *   · `runFor(10분)`   — 그 사이의 초를 **하나씩 다 살아 낸다**. 이 화면은 1초마다 다시 그리니
 *                        틱이 600번, 다시 그리기도 600번. 이 한 줄이 **8분 넘게** 걸렸다.
 *   · `fastForward(10분)` — 껑충 뛴다. 밀린 타이머는 **한 번만** 부른다.
 * 여기서 보려는 것은 「10분 뒤의 판」이지 「그 600초를 다 겪었는가」가 아니다. 화면은 지금
 * 시각을 읽어 다시 그리므로 한 번이면 충분하다 — 판정은 그대로, 시간만 사라진다.
 * (2026-08-09: 이 검사 하나가 빌드 10분 중 5분이었다.) */
await page.clock.fastForward(10 * 60 * 1000);
const after = await READ();
if (after.stage.sig === before.stage.sig) problems.push('10분이 지났는데 무대가 그대로다');
if (!after.beating) problems.push('갈렸는데 무대가 안 번쩍였다');

/* ② 되감기 — 맨 앞 지나간 판을 누르면 그 판이 그대로 무대에 올라와야 한다.
   방금 지나간 것 = 돌리기 전 무대에 있던 그 판이다. */
if (after.thumbs[0] && after.thumbs[0].sig === after.stage.sig) {
  problems.push('지나간 판과 지금 판이 같다 — 되감기가 무의미하다');
}
const firstThumbTick = after.thumbTicks[0];
await page.click('.pl-thumb');
await page.waitForTimeout(400);
const rewound = await READ();
if (rewound.stageTick !== firstThumbTick) {
  problems.push(`지나간 판을 눌렀는데 무대가 그 판이 아니다 (눌림 ${firstThumbTick} · 무대 ${rewound.stageTick})`);
}
if (rewound.stage.sig === after.stage.sig) problems.push('되감았는데 무대 그림이 그대로다');
if (!/지나간 판을 보고 있어요/.test(rewound.left)) problems.push('되감기 중인데 안내가 없다');

/* 방송을 바꾸면 무대도 바뀐다. */
await page.click('.pl-chip[data-id="hangul3"]');
await page.waitForTimeout(500);
const switched = await READ();
if (switched.stage.sig === rewound.stage.sig) problems.push('방송을 바꿨는데 무대가 그대로다');
if (!switched.chips.find((c) => c.id === 'hangul3')?.on) problems.push('바꾼 방송에 표시가 안 됐다');

/* 다른 도구에 갔다 돌아와도 멀쩡한지 — 뒷정리를 안 맡기면 여기서 어긋난다. */
await page.goto(BASE + '/apps/karmolab/index.html#conch', { waitUntil: 'load', timeout: 30000 });
await page.clock.runFor(500);
await page.goto(BASE + '/apps/karmolab/index.html#pulse', { waitUntil: 'load', timeout: 30000 });
await page.waitForSelector('.pl-stage canvas', { state: 'attached', timeout: 20000 });
await page.clock.runFor(2000);
const back = await READ();
if (back.chips.length !== 12) problems.push(`돌아왔더니 방송이 ${back.chips.length}개`);
if (back.stage.colors < 2) problems.push('돌아왔더니 무대가 비었다');

await browser.close();
server.close();

console.log(`[smoke-pulse] 방송 ${before.chips.length}개 · 시계 ${before.clock} → ${after.clock}`);
console.log(`[smoke-pulse] 공유 그림 ${shared}바이트 · 음 예약 ${osc}회 · 무대 색 ${before.stage.colors}가지`);
console.log(`[smoke-pulse] 방송 목록: ${before.chips.map((c) => c.label).join(' / ')}`);

if (errors.length) problems.push(...errors.map((e) => '오류: ' + e));
if (problems.length) {
  console.error('[smoke-pulse] 실패\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log('[smoke-pulse] OK');
