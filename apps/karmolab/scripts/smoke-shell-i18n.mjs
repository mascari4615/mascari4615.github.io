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
const PORT = 8842;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const BLESS = process.argv.includes('--bless');

const PAGES = [
  ['en', 'apps/blog/en/karmolab/'],
  ['ja', 'apps/blog/ja/karmolab/'],
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
await new Promise((r) => server.listen(PORT, r));

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
for (const [code, page] of PAGES) {
  const tab = await browser.newPage();
  await tab.goto(`http://127.0.0.1:${PORT}/${page}`, { waitUntil: 'domcontentloaded' });
  /* 이름은 말 묶음이 온 뒤에 정해진다 — 받아오기가 끝날 시간을 준다. */
  await tab.waitForTimeout(3500);
  found[code] = (await visibleKorean(tab)).sort();
  await tab.close();
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
