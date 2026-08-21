/**
 * **열기 전 화면**이 그 언어로 뜨는가 (TASK-KL-203 S8-cn 뒤).
 *
 * `smoke-widget-i18n` 은 도구를 **연 뒤**를 본다. 그런데 사람이 제일 먼저 보는 것은 열기 전 —
 * 도구 목록·찾기창·첫 화면·머리띠다. 그 자리는 위젯 코드가 아니라 셸이 그리므로, 위젯을 아무리
 * 옮겨도 거기엔 닿지 않는다. 실제로 위젯 180개를 다 옮기고 나서도 「/en/ 첫 화면」의 도구 이름
 * 180개가 전부 한국어였다(S8-cm). 그때는 눈으로 봐서 알았다. 눈은 다음에도 있으리란 보장이 없다.
 *
 * 그래서 여기서 「/en/」 과 「/ja/」 의 첫 화면을 열고, **눈에 보이는 한국어를 센다.**
 *
 * ## 왜 「0」이 아니라 「기준선」인가
 *
 * 지금 남은 한국어 중 일부는 이 검사가 고칠 수 없는 자리다:
 *   · 「한국어 판이 있습니다」 — **일부러** 한국어다(한국어를 찾는 사람에게 보이는 안내).
 *   · 놀이 이름(「스무고개」…) — 서버(yawnbot `/kl/today`)가 보내 준다. 이 저장소 밖이다.
 * 그래서 **지금 보이는 것만 적어 두고, 그보다 늘면 세운다**. 줄면 기준선을 조여 달라고 말한다
 * (`--bless` 로 다시 적는다). 「0 이 될 때까지 빨강」인 검사는 꺼지기 때문이다.
 *
 * 사용: node scripts/smoke-shell-i18n.mjs [--bless]
 */
import { launchOrSkip } from './lib/browser.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const BASELINE = path.join(appRoot, 'i18n/.shell-baseline.json');
/* 자리 번호는 <b>운영체제에게 받는다</b>(0 = 빈 자리 아무거나). 아래 `listen` 주석 참고.
   ⚠ 예전엔 기본값이 8842 였고, 부딪히면 사람이 `PORT` 를 적어 피하라고 열어 뒀다. 그런데
   부딪힘은 EADDRINUSE 로 죽는 것만이 아니었다 — <b>먼저 잡은 남의 서버에 그냥 물어보는</b>
   조용한 갈래가 있었다(2026-08-21 실측). 사람이 매번 안 적어도 되게 기본을 바꾼다. */
const PORT = Number(process.env.PORT || 0);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const BLESS = process.argv.includes('--bless');

const PAGES = [
  ['en', 'apps/blog/en/karmolab/'],
  ['ja', 'apps/blog/ja/karmolab/'],
  /* ★ **사람이 제일 먼저 밟는 자리는 도구 상세 장이다** (2026-08-17). 검색에서 오는 사람은
     첫 화면이 아니라 도구 한 장으로 들어온다 — 그 장은 셸을 복사해 쓰지만 SEO 글이 더 붙어
     나가므로 셸에 없는 한국어가 거기에만 남을 수 있다(같은 이유로 a11y 검사도 한 장을 표본으로 넣었다).
     지금은 깨끗하다(재 봤다: 「한국어」 한 낱말 = 판 바꾸는 링크뿐). 그 상태를 기준선으로 지킨다. */
  ['en-tool', 'apps/blog/en/karmolab/t/loan/'],
  ['ja-tool', 'apps/blog/ja/karmolab/t/loan/'],
];

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
/* ★ **붙박이 자리 번호는 남의 서버에 물어보게 만든다** (2026-08-21, 실측).
 * 기본값 8842 로 띄우는데, 여러 책상이 동시에 검사를 돌리면 그 자리를 <b>먼저 잡은 쪽이 이긴다</b>.
 * 그러면 내 브라우저는 <b>남의 저장소</b>를 보고, 내 장은 404 로 돌아온다.
 * 실측: `netstat` 에 8842 를 다른 프로세스가 잡고 있었고, 그 자리에 내 장을 물으니 404 였다.
 * ⚠ 그런데 이 검사의 통과 조건은 「보이는 한글 0개」다 — 남의 404 화면에도 한글이 0개다.
 *   그래서 <b>남의 서버를 보고도 「정상」이라 답해 왔다.</b> (오늘 바닥을 넣고서야 드러났다.)
 * 0 번을 주면 운영체제가 빈 자리를 준다 — 충돌 자체가 없어진다. `PORT` 를 적으면 그 자리를 쓴다. */
await new Promise((r) => server.listen(PORT, r));
const PORT_IN_USE = server.address().port;

const browser = await launchOrSkip('shell-i18n');
if (!browser) process.exit(0);

/** 화면에 **보이는** 글만 — 숨은 칸의 글자는 사람이 못 읽으므로 세지 않는다. */
async function visibleKorean(tab) {
  return tab.evaluate(() => {
    const HAN = /[가-힣]/;
    const out = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          const text = child.textContent.trim();
          if (text && HAN.test(text)) {
            const el = child.parentElement;
            if (el && el.offsetParent !== null) out.push(text.slice(0, 40));
          }
        } else if (child.nodeType === 1 && !['SCRIPT', 'STYLE', 'TEXTAREA'].includes(child.tagName)) {
          walk(child);
        }
      }
    };
    walk(document.body);
    return [...new Set(out)];
  });
}

/* 일부러 세우는 확인: 기준선에 없는 한국어가 하나라도 늘면 빨강이 되어야 한다.
   (새 방어는 정상 경로부터 찔러 본다 — 늘 초록인 검사는 검사가 아니다.) */
const found = {};
/* ★ **그 판을 보는 사람의 브라우저로 연다** (2026-08-19). 여태 시스템 언어(한국어) 그대로
   열었더니, 셸이 일부러 띄우는 「🌐 한국어 판이 있습니다 / 보러 가기」 띠가 en·ja 판에
   떴고 검사는 그걸 **덜 옮긴 글**로 셌다. 그 띠는 버그가 아니다 — `lang-switch.ts` 가
   「안내는 그 언어로 뜬다, 그래야 필요한 사람이 읽는다」로 일부러 그렇게 그린다.
   재현이 틀리면 판정도 틀린다. en 판을 보는 사람은 en 브라우저다. */
const consoleText = { en: 'en-US', 'en-tool': 'en-US', ja: 'ja-JP', 'ja-tool': 'ja-JP' };
for (const [code, page] of PAGES) {
  const ctx = await browser.newContext({ locale: consoleText[code] || 'en-US' });
  const tab = await ctx.newPage();
  const res = await tab.goto(`http://127.0.0.1:${PORT_IN_USE}/${page}`, { waitUntil: 'domcontentloaded' });
  /* 이름은 말 묶음이 온 뒤에 정해진다 — 받아오기가 끝날 시간을 준다. */
  await tab.waitForTimeout(3500);
  /* ★ **여기서 0 은 「없다」가 아니라 「안 봤다」일 수 있다** (2026-08-21).
   * 이 검사의 통과 조건이 <b>「보이는 한글 0개」</b>다. 그래서 장이 404 라 화면이 비면
   * 0개가 나오고 <b>그대로 초록</b>이 된다 — 아무것도 안 보고 정상이라 적는 것이다.
   * 오늘 옆 검사(`play-smoke`)가 딱 그 꼴로 없는 파일을 보고 있었다. 그쪽은 「카드가 0장」
   * 같은 단이 있어 빨개졌지만, 여기는 <b>0이 곧 합격</b>이라 영영 안 들킨다.
   * 그래서 잰 것이 있는지부터 본다 — 없으면 초록·빨강 어느 쪽으로도 적지 않는다. */
  const bodyLen = await tab.evaluate(() => (document.body?.innerText || '').trim().length);
  if (!res || res.status() !== 200 || bodyLen < 200) {
    console.error(`[shell-i18n] CANNOT-RUN: ${page} 를 못 열었다 (http ${res && res.status()} · 글 ${bodyLen}자).`);
    console.error('  이건 「한글이 안 샌다」가 아니라 **아무것도 안 봤다**는 뜻이다. 통과로 안 센다.');
    process.exit(2);
  }
  found[code] = (await visibleKorean(tab)).sort();
  await tab.close();
  await ctx.close();
}
await browser.close();
server.close();

const before = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

if (BLESS || !before) {
  fs.writeFileSync(BASELINE, JSON.stringify(found, null, 2) + '\n', 'utf8');
  console.log(`[shell-i18n] 기준선을 적었다 — ${PAGES.map(([c]) => `${c} ${found[c].length}`).join(' · ')}`);
  process.exit(0);
}

const fail = [];
for (const [code] of PAGES) {
  const old = new Set(before[code] || []);
  const added = found[code].filter((s) => !old.has(s));
  if (added.length) {
    fail.push(`${code}: 열기 전 화면에 한국어가 늘었다 (${added.length}개) — ${added.slice(0, 5).join(' / ')}`);
  }
  const gone = (before[code] || []).filter((s) => !found[code].includes(s));
  if (gone.length) {
    console.log(`[shell-i18n] ${code}: ${gone.length}개 줄었다 — \`--bless\` 로 기준선을 조여라.`);
  }
}

if (fail.length) {
  for (const f of fail) console.error('[shell-i18n] ' + f);
  console.error('[shell-i18n] 셸이 그리는 자리다 — 위젯이 아니라 index.html·home-page·today·account 쪽을 보라.');
  process.exit(1);
}
console.log(`[shell-i18n] 열기 전 화면 정상 — ${PAGES.map(([c]) => `${c} ${found[c].length}개(기준선 안)`).join(' · ')}`);
