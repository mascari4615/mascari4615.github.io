/**
 * 언어별 장 찍기 (TASK-KL-203 S2)
 *
 * 지금 찍는 것: 앱 첫 화면의 언어 판 (`/en/karmolab/` …). 도구 상세 129장은 제 글이 아직
 * 안 옮겨졌으므로 여기서 안 찍는다 — **번역이 덜 된 장을 그 언어 주소로 올리는 건 안 올린
 * 것보다 나쁘다**(영어라고 적힌 주소에 한국어가 실린다). `tools-seo` 가 차면 여기 목록에 는다.
 *
 * 왜 앱 첫 화면부터인가: 그 한 장이 언어 바탕 전체가 실제로 도는지 보여 주는 제일 짧은 고리다 —
 * 주소·머리말·왕복 표시·앱 부팅 언어가 한 번에 걸린다. 되는 것을 하나 세워 두고 늘린다.
 *
 * 사용: node scripts/gen-locale-pages.mjs [--out ../blog] [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, DEFAULT_LOCALE, translated, localizedPath } from './lib/locales.mjs';
import { toLocalePage } from './lib/locale-page.mjs';
import { loadShell } from './lib/shell-page.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';
const CHECK = process.argv.includes('--check');
const outArg = process.argv.indexOf('--out');
const outRoot = path.resolve(root, outArg >= 0 ? process.argv[outArg + 1] : '../blog');

/** 지금 언어 판을 찍을 장들. 늘 때는 여기에 한 줄 는다. */
const PAGES = [{ bare: '/karmolab/', namespaces: ['site', 'shell'] }];

const shell = loadShell(root);
const made = [];

for (const page of PAGES) {
  /* 이 장이 존재할 언어 = 그 장이 쓰는 묶음이 **다 찬** 언어. 원본은 언제나 있다. */
  const codes = LOCALES.filter((l) => page.namespaces.every((ns) => translated(l.code, ns))).map((l) => l.code);

  for (const code of codes) {
    if (code === DEFAULT_LOCALE) continue; // 원본은 Jekyll 이 index.html 을 그대로 낸다
    const html = toLocalePage(shell, { code, bare: page.bare, site: SITE, codes, namespaces: page.namespaces });
    const rel = path.join(localizedPath(page.bare, code).replace(/^\//, ''), 'index.html');
    const dest = path.join(outRoot, rel);
    if (!CHECK) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, html, 'utf8');
    }
    made.push({ code, path: localizedPath(page.bare, code), dest, exists: fs.existsSync(dest) });
  }

  /* 원본 장에도 같은 왕복 표시가 있어야 한다. 원본은 `index.html` 그 자체라 여기서 못 찍는다 —
     대신 **거기 박혀 있는지 검사**한다 (`scripts/audit-i18n-pages.mjs`). 한쪽만 가리키면
     양쪽 표시가 통째로 무시되므로, 이 짝은 반드시 같이 있어야 한다. */
}

if (CHECK) {
  const missing = made.filter((m) => !m.exists);
  if (missing.length) {
    console.error('[gen-locale-pages] 안 찍힌 언어 장: ' + missing.map((m) => m.path).join(', '));
    process.exit(1);
  }
  console.log(`[gen-locale-pages] 언어 장 ${made.length}개 확인`);
} else {
  console.log(`[gen-locale-pages] ${made.length}개 찍음: ${made.map((m) => m.path).join(', ') || '(없음)'}`);
}
