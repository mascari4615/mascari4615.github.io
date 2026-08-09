/**
 * 언어 단추가 **정말 도는지** 본다 (TASK-KL-203 S3-b)
 *
 * 왜 필요한가: 이 단추는 「눌러야」 처음 쓰인다. 화면에 그려진 것만 보고는 목록이 열리는지,
 * 고른 뒤 제 주소로 옮겨 가는지 알 수 없다 — 눌러도 아무 일 없는 단추가 제일 나쁘고, 그건
 * 오류도 안 남긴다. 그래서 **검사가 직접 누른다**.
 *
 * 보는 것 넷:
 *  ① 단추가 화면에 있고 지금 언어 두 글자를 보여 준다
 *  ② 누르면 목록이 열리고, 켠 언어가 전부 **제 나라 말 이름**으로 들어 있다
 *  ③ 고르면 그 언어의 **같은 화면 주소**로 옮겨 간다
 *  ④ 그 사이 콘솔에 오류가 없다 (조용히 죽는 것을 잡는다)
 *
 * 사용: node scripts/smoke-lang-switch.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES as ENABLED_LOCALES } from './lib/locales.mjs';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const PORT = 8829;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/* 앱을 그대로 띄우려면 주소 규칙(`/apps/karmolab/js/…`)이 살아 있어야 한다 —
   레포 뿌리를 그대로 낸다. Jekyll 앞머리는 화면에 글자로 보이지만 동작에는 지장이 없다. */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(repoRoot, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('no');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

const fail = [];
const base = `http://127.0.0.1:${PORT}/apps/karmolab/index.html`;
await page.goto(base, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.getElementById('langBtn'), { timeout: 5000 });

/* ① */
const code = (await page.locator('#langBtn .lang-btn-code').textContent())?.trim();
if (code !== 'KO') fail.push(`단추 글자가 KO 가 아니다: ${code}`);

/* ② */
await page.click('#langBtn');
const menu = page.locator('.lang-menu');
if (!(await menu.count())) fail.push('눌러도 목록이 안 열린다');
else {
  const text = await menu.innerText();
  for (const l of ENABLED_LOCALES) {
    if (!text.includes(l.endonym)) fail.push(`목록에 ${l.endonym} 이 없다`);
  }
}

/* ③ — 기본 언어가 아닌 첫 언어를 고른다. */
const target = ENABLED_LOCALES.find((l) => l.prefix);
if (target && (await menu.count())) {
  await page.getByRole('option').filter({ hasText: target.endonym }).click();
  await page.waitForTimeout(300);
  const to = page.url();
  /* 이 검사판은 `index.html` 을 직접 열었으므로 옮겨 간 주소도 그 규칙을 따른다 —
     중요한 것은 **그 언어의 앞머리가 붙었는가**다. */
  if (!to.includes(target.prefix)) fail.push(`고른 뒤 ${target.prefix} 로 안 옮겨 갔다: ${to}`);
}

/* ④ — **검사판 사정과 진짜 고장을 가른다.**
   여기서 걸러지는 것: 없는 장으로 옮겨 가 생긴 404, 그리고 바깥 서버(yawnbot)의 CORS 거절.
   후자는 이 검사가 `127.0.0.1` 에서 도는 탓이지 코드가 깨진 게 아니다 — 실서비스 주소에서는
   허용돼 있다. 이걸 안 가르면 검사가 늘 빨갛고, 그러면 사람이 검사를 꺼 버린다.
   그리고 `AbortError: Transition was skipped` — 화면 전환 애니메이션 도중에 우리가 주소를
   옮겨 버려서 나는 것이다. 언어를 고르면 페이지가 떠나는 게 **맞는 동작**이고, 떠나는 쪽이
   이긴 흔적이 이 줄이다. */
const real = errors.filter(
  (e) => !/404|Failed to load resource|CORS policy|Access to fetch|Transition was skipped/i.test(e)
);
if (real.length) fail.push('콘솔 오류: ' + real.slice(0, 3).join(' | '));

await browser.close();
server.close();

if (fail.length) {
  for (const f of fail) console.error('[lang-switch] ' + f);
  process.exit(1);
}
console.log(`[lang-switch] 단추 정상 — 글자 ${code} · 목록 ${ENABLED_LOCALES.length}개 · 고르면 주소 이동`);
