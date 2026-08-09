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
import { launchOrSkip } from './lib/browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES as ENABLED_LOCALES, catalog } from './lib/locales.mjs';

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

const browser = await launchOrSkip('lang-switch');
if (!browser) process.exit(0);
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

/* 이 장이 가진 언어 = 짝 표시. 생성기·검사와 같은 규칙이다. */
const tags = await page.$$eval('link[rel="alternate"][hreflang]', (els) =>
  els.map((e) => e.getAttribute('hreflang'))
);
const expected = ENABLED_LOCALES.filter((l) => tags.includes(l.htmlLang));
const names = Object.fromEntries(expected.map((l) => [l.code, catalog(l.code, 'widgets')]));

/* ① */
const code = (await page.locator('#langBtn .lang-btn-code').textContent())?.trim();
/* 단추는 언어 두 글자 뒤에 **지역 깃발**을 붙인다(「KO 🇰🇷」, TASK-KL-203 S12) — 언어만 적으면
   지역이 짐작으로 정해진 것을 아무도 모른다. 여기서는 앞의 언어 글자만 못 박는다. */
if (!/^KO(\s|$)/.test(code || '')) fail.push(`단추가 KO 로 시작하지 않는다: ${code}`);

/* ② */
await page.click('#langBtn');
const menu = page.locator('.lang-menu');
if (!(await menu.count())) fail.push('눌러도 목록이 안 열린다');
else {
  const text = await menu.innerText();
  /* 기대값 = **이 장이 실제로 가진 언어** (짝 표시 기준). 켠 언어 전부로 재면 안 된다 —
     번역이 덜 찬 언어는 장이 안 찍히고 목록에도 안 올라오는 게 맞는 동작이다. */
  for (const l of expected) {
    if (!text.includes(l.endonym)) fail.push(`목록에 ${l.endonym} 이 없다`);
  }
  for (const l of ENABLED_LOCALES) {
    if (!expected.includes(l) && text.includes(l.endonym))
      fail.push(`장이 없는 ${l.endonym} 이 목록에 있다 — 고르면 404 가 난다`);
  }
}

/* ③ — 기본 언어가 아닌 첫 언어를 고른다. */
const target = expected.find((l) => l.prefix);
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

/* ⑤ 언어 장마다 **도구 이름이 그 언어로** 나오는가 (TASK-KL-203 S5-b·S7).
   이름은 목록이 대입되는 자리에서 갈아 끼운다 — 그 고리가 빠지면 화면은 멀쩡한데 옆줄·목록·⌘K 의
   이름만 한국어로 남는다. 한국어를 읽는 사람 눈에는 안 보이는 종류라 여기서 직접 열어 본다.
   **켠 언어를 전부 돈다** — 언어가 늘 때 이 검사도 저절로 는다(한 언어만 박아 두면 새 언어는
   아무도 안 본 채로 나간다). */
for (const l of expected) {
  if (!l.prefix) continue;
  const tab = await browser.newPage();
  await tab.goto(`http://127.0.0.1:${PORT}/apps/blog${l.prefix}/karmolab/index.html`, {
    waitUntil: 'domcontentloaded'
  });
  const shown = await tab
    .waitForFunction(
      () => {
        const list = window.KARMOLAB_LAZY_META;
        if (!Array.isArray(list) || !list.length) return false;
        const hit = list.find((w) => w.id === 'charcount');
        return hit ? hit.title : false;
      },
      { timeout: 5000 }
    )
    .then((h) => h.jsonValue())
    .catch(() => null);
  const want = names[l.code]['widgets.charcount.title'];
  if (shown !== want) fail.push(`${l.code} 장의 도구 이름이 안 바뀌었다: ${shown} (기대 ${want})`);
  /* 한국어로 남은 이름 = **번역이 있는데 안 갈아 끼운 것**만 잘못이다. 아직 안 옮긴 도구
     (다른 작업이 방금 새로 만든 위젯 등)까지 세면, 누가 도구를 하나 넣을 때마다 이 검사가
     빨개지고 그러면 사람이 검사를 꺼 버린다 — 도구 장 260장이 통째로 멈췄던 것과 같은 덫이다.
     「안 바뀐 것」과 「아직 없는 것」을 가른다. */
  const stillKorean = await tab.evaluate(
    () =>
      (window.KARMOLAB_LAZY_META || [])
        .filter((w) => /[가-힣]/.test(w.title || ''))
        .map((w) => w.id)
  );
  const havingTranslation = stillKorean.filter((id) => {
    const v = names[l.code][`widgets.${id}.title`];
    return !!v && !/[가-힣]/.test(v);
  });
  if (havingTranslation.length) {
    fail.push(`${l.code} 장: 번역이 있는데 이름이 안 바뀌었다 — ${havingTranslation.join(', ')}`);
  } else if (stillKorean.length) {
    console.log(`[lang-switch] ${l.code}: 아직 안 옮긴 도구 ${stillKorean.length}개 (${stillKorean.join(', ')})`);
  }
  await tab.close();
}

await browser.close();
server.close();

if (fail.length) {
  for (const f of fail) console.error('[lang-switch] ' + f);
  process.exit(1);
}
console.log(`[lang-switch] 단추 정상 — 글자 ${code} · 목록 ${expected.length}개(켠 언어 ${ENABLED_LOCALES.length}) · 고르면 주소 이동`);
