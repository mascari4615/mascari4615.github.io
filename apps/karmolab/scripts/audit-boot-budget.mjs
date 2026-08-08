/**
 * 화면이 **뜨기 전에 받는 양**에 천장을 둔다 (TASK-KL-128 ⑲)
 *
 * 왜 있나: 이번 회차에 도구 화면 부팅 JS 를 39.5 → 17.2KB(gz) 로 줄였다. 그런데 이건
 * **한 줄이면 도로 돌아간다** — 셸 `index.html` 에 `<script src>` 를 하나 더 적으면 화면
 * 130장이 그날부터 다시 받는다. 화면은 멀쩡하고 검사도 다 초록이라 아무도 모른다.
 * 실제로 그렇게 쌓여서 여기까지 왔다(팔레트·검색목록·계정·배경장식·데스크톱껍데기).
 *
 * 재는 법: 브라우저를 안 띄운다. 화면 HTML 의 `<script src>`·`<link rel=stylesheet>` 만
 * 세면 그것이 곧 **첫 그림을 기다리게 하는 것**이다. 나중에 코드로 데려오는 것(마스코트·
 * 계정·액정놀이·팔레트)은 태그가 아니라 스크립트 안에 있으므로 저절로 빠진다 — 그게 요점이다.
 * 크기는 실제 나가는 모양대로 **gzip 한 값**을 쓴다.
 *
 * 천장을 올리려면: 왜 올려야 하는지 여기 한 줄 남기고 올려라. 조용히 올리지 마라.
 *
 * 사용: node scripts/audit-boot-budget.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const blogRoot = path.dirname(root);

/* 천장 이력 — **올릴 때는 왜 올렸는지 여기 한 줄 남긴다. 조용히 올리지 마라.**
 * · 2026-08-08 도구 화면 JS 21 → 23: 셸에 `copresence.js` 가 부팅 태그로 붙어 18.7 → 21.7KB.
 *   내 작업이 아니라 되돌리지 않았다. 그 화면에 첫 그림부터 필요한지는 올린 쪽이 판단할 것.
 *
 * 천장(gz, KB). 2026-08-08 KL-128 ①-c/⑱ 직후 실측값 + 여유 10%.
 * 실측: 첫 화면 JS 35.1 / CSS 47.3 · 도구 화면·목록 JS 18.7 / CSS 62.1.
 * 첫 화면 JS 가 큰 것은 **맞다** — 팔레트가 그 화면의 본체라 미룰 수 없다(도구 화면에선 뺐다). */
const BUDGET = {
  '앱 첫 화면': { file: path.join(root, 'index.html'), js: 39, css: 52 },
  '도구 화면': { file: path.join(blogRoot, 'blog/karmolab/t/loan/index.html'), js: 23, css: 68 },
  '도구 목록': { file: path.join(blogRoot, 'blog/karmolab/t/index.html'), js: 23, css: 68 }
};

const gz = (p) => {
  try {
    return zlib.gzipSync(fs.readFileSync(p)).length / 1024;
  } catch {
    return null;
  }
};

/** 배포 주소(`/apps/karmolab/…`) → 디스크 자리. 지문·판 표식은 떼고 본다. */
const onDisk = (url) => {
  const clean = url.split('?')[0];
  if (!clean.startsWith('/apps/karmolab/')) return null;
  return path.join(root, clean.slice('/apps/karmolab/'.length));
};

const problems = [];
const rows = [];

for (const [label, spec] of Object.entries(BUDGET)) {
  if (!fs.existsSync(spec.file)) {
    /* 도구 화면은 배포 때 찍는 생성물이라 새 체크아웃엔 없다 — 그건 실패가 아니다. */
    rows.push(`  ${label.padEnd(10)} 건너뜀 (찍힌 화면이 없다)`);
    continue;
  }
  const html = fs.readFileSync(spec.file, 'utf8');

  /* `media="print"` 로 걸린 스타일은 첫 그림을 안 막는다 — 세지 않는다. */
  const cssUrls = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*>/g)]
    .filter((m) => !/media="print"/.test(m[0]))
    .map((m) => (m[0].match(/href="([^"]+)"/) || [])[1])
    .filter(Boolean);
  const jsUrls = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].map((m) => m[1]);

  const sum = (urls) => urls.reduce((s, u) => {
    const p = onDisk(u);
    const k = p && gz(p);
    return s + (k || 0);
  }, 0);

  const js = sum(jsUrls);
  const css = sum(cssUrls);
  rows.push(`  ${label.padEnd(10)} JS ${js.toFixed(1)}KB / ${spec.js}  ·  CSS ${css.toFixed(1)}KB / ${spec.css}  (파일 ${jsUrls.length}+${cssUrls.length}개)`);
  if (js > spec.js) problems.push(`${label}: 뜨기 전 JS ${js.toFixed(1)}KB — 천장 ${spec.js}KB 를 넘었다`);
  if (css > spec.css) problems.push(`${label}: 뜨기 전 CSS ${css.toFixed(1)}KB — 천장 ${spec.css}KB 를 넘었다`);
}

console.log('[audit-boot-budget] 뜨기 전에 받는 양 (gzip)');
rows.forEach((r) => console.log(r));

if (problems.length) {
  console.error('[audit-boot-budget] 천장을 넘은 화면 ' + problems.length + '개');
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → 새로 넣은 것이 **첫 그림에 정말 필요한가** 부터 봐라.');
  console.error('    나중에 써도 되는 것이면 태그로 걸지 말고, 쓸 때 데려와라(팔레트·계정이 그렇게 빠졌다).');
  process.exit(1);
}
console.log('[audit-boot-budget] 전부 천장 안');
