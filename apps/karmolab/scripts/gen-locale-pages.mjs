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
import { LOCALES, DEFAULT_LOCALE, translated, localizedPath, hreflangTags } from './lib/locales.mjs';
import { toLocalePage, LOCALE_PAGES } from './lib/locale-page.mjs';
import { loadShell } from './lib/shell-page.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';
const CHECK = process.argv.includes('--check');
const outArg = process.argv.indexOf('--out');
const outRoot = path.resolve(root, outArg >= 0 ? process.argv[outArg + 1] : '../blog');

/** 지금 언어 판을 찍을 장들 (정본 = lib/locale-page.mjs). 늘 때는 거기 한 줄 는다. */
const PAGES = LOCALE_PAGES;

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

  /* 원본 장(`index.html`)의 짝 표시도 **여기서 맞춰 준다** (TASK-KL-203 S6).
   *
   * 처음에는 그 세 줄을 손으로 적어 두고 검사만 했다. 그랬더니 일본어를 켠 순간 —
   * 등록부에 `enabled: true` 한 줄만 바꿨는데 — 게이트가 「셸에 ja 짝 표시가 없다」로 섰다.
   * 그게 **언어를 늘릴 때 유일하게 손이 가는 자리**였다. 목표가 「켜기만 하면 는다」였으므로
   * 그 자리를 없앤다: 등록부에서 뽑아 그 블록을 다시 쓴다. 손으로 적을 곳이 하나 줄었다. */
  if (page.bare === '/karmolab/') {
    const file = path.join(root, 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const block = hreflangTags(page.bare, SITE, codes).split('\n').map((l) => l.trim());
    const re = /( *)<link rel="alternate" hreflang="[^"]*" href="[^"]*">(?:\n *<link rel="alternate" hreflang="[^"]*" href="[^"]*">)*/;
    const m = re.exec(html);
    if (!m) {
      console.error('[gen-locale-pages] index.html 에서 짝 표시 자리를 못 찾음 — 셸 구조 확인');
      process.exit(1);
    }
    const indent = m[1];
    const next = html.replace(re, block.map((l) => indent + l).join('\n'));
    if (next !== html) {
      if (CHECK) {
        console.error('[gen-locale-pages] index.html 의 짝 표시가 등록부와 어긋남 — `npm run gen:locale-pages` 후 커밋');
        process.exit(1);
      }
      fs.writeFileSync(file, next, 'utf8');
      console.log('[gen-locale-pages] index.html 짝 표시 갱신');
    }
  }
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
