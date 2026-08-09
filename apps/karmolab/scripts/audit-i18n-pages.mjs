/**
 * 언어 판 표시 검사 (TASK-KL-203 S2)
 *
 * 왜 검사가 따로 있나: 언어 표시는 **틀려도 화면이 멀쩡하다**. 짝 표시가 한쪽만 있거나 없는
 * 주소를 가리켜도 사람 눈엔 아무 일도 안 일어나고, 몇 주 뒤 검색 유입이 안 오는 것으로만 드러난다.
 * 국제 사이트의 약 2/3 가 이 표시를 틀린다 — 대부분 **왕복 누락**이다.
 *
 * 보는 것 넷:
 *  ① 원본 장(`index.html`)의 짝 표시가 등록부(`data/locales.json`)와 같은가
 *  ② `x-default` 가 있는가 (어느 언어도 안 맞는 사람에게 무엇을 줄지)
 *  ③ 찍힌 언어 장이 원본을 되가리키는가 (왕복)
 *  ④ 도구 상세 장에 **셸에서 새어 나온** 짝 표시가 없는가 (있으면 129장이 남의 주소를 제 짝이라 우긴다)
 *
 * 사용: node scripts/audit-i18n-pages.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, DEFAULT_LOCALE, localizedPath, pageAvailable, coverage } from './lib/locales.mjs';
import { LOCALE_PAGES } from './lib/locale-page.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';
const BARE = '/karmolab/';
const fail = [];

const links = (html) =>
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => ({
    lang: m[1],
    href: m[2]
  }));

/* ① 원본 장 ────────────────────────────────────────── */
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const PAGE = LOCALE_PAGES.find((p) => p.bare === BARE);
const codes = LOCALES.filter((l) => pageAvailable(l.code, PAGE)).map((l) => l.code);
const want = codes.map((c) => ({ lang: LOCALES.find((l) => l.code === c).htmlLang, href: SITE + localizedPath(BARE, c) }));
want.push({ lang: 'x-default', href: SITE + localizedPath(BARE, DEFAULT_LOCALE) });

const got = links(src);
const key = (x) => `${x.lang} ${x.href}`;
const gotSet = new Set(got.map(key));
for (const w of want) {
  if (!gotSet.has(key(w))) fail.push(`index.html 에 짝 표시가 없다: ${key(w)}`);
}
for (const g of got) {
  if (!want.some((w) => key(w) === key(g))) fail.push(`index.html 에 등록부에 없는 짝 표시: ${key(g)}`);
}

/* ③ 찍힌 언어 장 ──────────────────────────────────── */
for (const code of codes) {
  if (code === DEFAULT_LOCALE) continue;
  const file = path.join(root, '../blog', localizedPath(BARE, code).replace(/^\//, ''), 'index.html');
  if (!fs.existsSync(file)) {
    fail.push(`${code} 장이 안 찍혔다: ${file} — \`npm run gen:locale-pages\` 먼저`);
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const back = links(html);
  if (!back.some((l) => l.href === SITE + localizedPath(BARE, DEFAULT_LOCALE)))
    fail.push(`${code} 장이 원본을 되가리키지 않는다 (왕복 깨짐)`);
  if (!back.some((l) => l.lang === 'x-default')) fail.push(`${code} 장에 x-default 가 없다`);
  const meta = LOCALES.find((l) => l.code === code);
  if (!new RegExp(`<html lang="${meta.htmlLang}">`).test(html)) fail.push(`${code} 장의 <html lang> 이 ${meta.htmlLang} 이 아니다`);
  if (!html.includes(`<link rel="canonical" href="${SITE}${localizedPath(BARE, code)}">`))
    fail.push(`${code} 장의 canonical 이 제 주소가 아니다`);
}

/* ④ 도구 상세 장의 짝 표시 — **제 것을 가리키는가** ────
 *
 * 예전에는 「도구 장에 짝 표시가 하나라도 있으면 실패」였다. 그때는 도구 장에 언어 판이 없었고,
 * 셸에서 새어 나온 표시는 전부 **첫 화면 주소**를 가리켰기 때문이다(129장이 남의 주소를 제 짝이라
 * 우기는 상태). 이제 도구 장에도 언어 판이 있으므로 규칙이 바뀐다: **있어야 하고, 제 id 를
 * 가리켜야 한다.** 없으면 언어 판이 한국어 장을 가리켜도 왕복이 안 돼 양쪽이 통째로 무시된다.
 */
const toolsDir = path.join(root, '../blog/karmolab/t');
if (fs.existsSync(toolsDir) && codes.length > 1) {
  const wrong = [];
  const bare = [];
  for (const id of fs.readdirSync(toolsDir)) {
    const f = path.join(toolsDir, id, 'index.html');
    if (!fs.existsSync(f)) continue;
    const got = links(fs.readFileSync(f, 'utf8'));
    if (!got.length) {
      bare.push(id);
      continue;
    }
    /* 이 장의 주소가 아닌 곳을 가리키면(= 첫 화면이 새어 나옴) 그게 제일 나쁜 종류다. */
    if (got.some((l) => !l.href.endsWith(`/karmolab/t/${id}/`))) wrong.push(id);
  }
  if (wrong.length)
    fail.push(`도구 장 ${wrong.length}개의 짝 표시가 제 주소가 아니다 (예: ${wrong[0]}) — 셸에서 새어 나왔는지 확인`);
  if (bare.length)
    fail.push(
      `도구 장 ${bare.length}개에 짝 표시가 없다 (예: ${bare[0]}) — 언어 판만 한쪽을 가리키면 양쪽이 무시된다. \`npm run gen:tool-pages-locale\``
    );
}

if (fail.length) {
  for (const f of fail) console.error('[i18n-pages] ' + f);
  process.exit(1);
}
/* 덮은 정도를 늘 같이 찍는다 — 「거의 다 차면 낸다」로 바꾼 이상, 남은 구멍이 눈에 보여야 한다. */
const cov = codes
  .filter((c) => c !== DEFAULT_LOCALE)
  .map((c) => `${c} ${(PAGE.itemNamespaces || []).map((ns) => `${ns} ${Math.round(coverage(c, ns) * 100)}%`).join(' · ')}`)
  .join(' | ');
console.log(`[i18n-pages] 짝 표시 정상 — 언어 ${codes.join(', ')} · 왕복 + x-default 확인${cov ? ` · ${cov}` : ''}`);
