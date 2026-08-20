/**
 * 페이지가 부르는 파일이 실제로 만들어졌는가 (TASK-KL-098)
 *
 * 왜 있나: 2026-08-07, 다른 작업과 합쳐지는 과정에서 `build.mjs` 의 항목 두 개가 **조용히
 * 사라졌다**. 소스는 멀쩡했고, 타입 검사도 통과했고, 배포도 초록불이었다. 그런데 페이지가
 * 부르는 파일이 아예 안 만들어져 404 가 됐고 — **실서비스의 로그인이 통째로 죽어 있었다.**
 * 아무 검사도 이걸 못 잡았다. 화면을 열어 봐야만 알 수 있었다.
 *
 * 보는 것 하나: HTML 이 `<script src="/apps/karmolab/js/…">` 로 부르는 파일이 빌드 뒤에
 * 디스크에 있는가. 없으면 그 자리에서 배포를 세운다.
 *
 * **반드시 `node build.mjs` 뒤에 돌려야 한다** — 앞에 두면 늘 실패한다.
 *
 * 사용: node scripts/audit-page-scripts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 검사할 HTML — 이 앱이 내보내는 페이지 전부. */
function htmlPages() {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 2) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'js' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith('.html')) found.push(full);
    }
  };
  walk(root, 0);
  return found;
}

const SRC_RE = /<script[^>]+src=["'](\/apps\/karmolab\/js\/[^"']+\.js)["']/g;

const missing = [];
const noForeign = [];
let checked = 0;

for (const page of htmlPages()) {
  const html = fs.readFileSync(page, 'utf8');
  for (const match of html.matchAll(SRC_RE)) {
    const url = match[1];
    const file = path.join(root, url.replace('/apps/karmolab/', ''));
    checked += 1;
    if (!fs.existsSync(file)) {
      missing.push(`${path.relative(root, page)} → ${url}`);
    }
  }
}

/* ★ **부르는 자리가 HTML 만은 아니다** (2026-08-17, 실주소 404 로 들켰다). 늦게 받는 것들의
   주소를 인라인에서 `src/boot-late.ts` 로 옮겼더니 이 검사의 눈 밖으로 나갔고, 그 사이
   `copresence.js`·`alarm-fire.js` 가 안 지어진 채 배포돼 **404** 였다 — 화면은 멀쩡하고
   검사도 전부 초록인데 그 기능만 조용히 죽었다. 이 검사가 태어난 사고(로그인 404)와 같은 꼴이다.
   그러니 소스에 적힌 주소도 같이 본다. 찾을 곳은 「HTML」이 아니라 **그 주소가 적힌 어디든**이다. */
const sourceUrl = /['"](\/apps\/karmolab\/js\/[^'"]+\.js)['"]/g;
function sources(dir, out = [], 깊이 = 4) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (깊이 > 0) sources(full, out, 깊이 - 1); }
    else if (/[.](ts|mts|js|mjs)$/.test(e.name)) out.push(full);
  }
  return out;
}
for (const file of sources(path.join(root, 'src'))) {
  const body = fs.readFileSync(file, 'utf8');
  for (const m of body.matchAll(sourceUrl)) {
    const url = m[1];
    const hits = path.join(root, url.replace('/apps/karmolab/', ''));
    /* `vendor/` 는 **남이 만든 것을 그대로 두는 자리**다 — 우리가 짓지 않으므로 여기서 막지 않는다
       (`entry-points.mjs` 도 같은 규약). 대신 없으면 **말은 한다**: 지금 `mermaid.min.js` 가
       그렇게 빠져 있고 실주소에서 404 다(문서 도구의 그림이 안 그려진다). 남의 파일을 내가
       임의로 들이는 것은 사람 결정이라 알리기만 한다. */
    if (url.includes('/vendor/')) {
      if (!fs.existsSync(hits)) noForeign.push(`${path.relative(root, file)} → ${url}`);
      continue;
    }
    checked += 1;
    if (!fs.existsSync(hits)) missing.push(`${path.relative(root, file)} → ${url}`);
  }
}
if (noForeign.length) {
  console.log(`[audit-page-scripts] ⚠ 남의 파일이 빠져 있다 ${noForeign.length}건 — 막지는 않는다(사람이 들일지 정한다):`);
  for (const l of noForeign) console.log('  · ' + l);
}

if (missing.length) {
  console.error(`[audit-page-scripts] 페이지가 부르는데 만들어지지 않은 파일 ${missing.length}개 — 그 화면은 죽는다`);
  for (const line of missing) console.error(`  - ${line}`);
  console.error('  고치는 법: build.mjs 에 그 소스의 항목이 있는지 보세요 (합쳐지며 사라졌을 수 있습니다).');
  process.exit(1);
}

/* ★ **0개를 「전부 있다」로 말하면 안 된다** (2026-08-16).
   이 검사가 생긴 이유가 「부르는 파일이 조용히 안 만들어져 로그인이 죽었다」인데,
   찾는 자리(HTML 의 <script src="/apps/karmolab/js/…">)가 0건이면 그건 통과가 아니라
   **못 돌린 것**이다 — 페이지 구조가 바뀌었거나(모듈·importmap) 여기 정규식이 낡은 것이다.
   그대로 두면 잡으라고 만든 바로 그 사고를 초록으로 넘긴다. */
if (checked === 0) {
  console.error('[audit-page-scripts] CANNOT-RUN: 페이지가 부르는 js 를 한 건도 못 찾았다');
  console.error('  → HTML 이 부르는 방식이 바뀌었거나(모듈·importmap) 이 검사의 정규식이 낡았다.');
  console.error('  → 0건은 통과가 아니다. 이 검사는 로그인이 죽은 사고(2026-08-07)에서 나왔다.');
  process.exit(2);
}

console.log(`[audit-page-scripts] 페이지가 부르는 파일 ${checked}개 전부 만들어져 있다`);
