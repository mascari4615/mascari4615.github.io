/**
 * 언어 등록부 읽기 — 생성기·검사가 공유하는 한 벌 (TASK-KL-203)
 *
 * 정본은 `data/locales.json` 하나다. 여기에 없는 언어는 어디에도 없다.
 * 「언어 목록」을 두 군데 적어 두면 반드시 갈라진다 — 실제로 그랬던 파일이 이 레포에 여럿 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

const raw = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'data/locales.json'), 'utf8'));

/** 등록된 전부 (아직 안 켠 것 포함). */
export const ALL_LOCALES = raw.locales;
/** 실제로 화면에 나가는 것 — 페이지를 찍는 쪽은 이것만 돈다. */
export const LOCALES = raw.locales.filter((l) => l.enabled);
export const DEFAULT_LOCALE = raw.default;
/** 글의 원본이 되는 언어 (번역이 비면 여기로 떨어진다). */
export const SOURCE_LOCALE = (raw.locales.find((l) => l.source) || { code: raw.default }).code;

export function meta(code) {
  const hit = raw.locales.find((l) => l.code === code);
  if (!hit) throw new Error(`[locales] 등록에 없는 언어: ${code} — data/locales.json 확인`);
  return hit;
}

/** 언어 앞머리를 붙인 주소. 기본 언어는 앞머리가 없다(기존 주소를 안 깬다). */
export function localizedPath(bare, code) {
  const p = meta(code).prefix;
  return p ? p + bare : bare;
}

/** 한 화면의 모든 언어 주소 — hreflang·사이트맵이 쓴다. */
export function alternates(bare) {
  return LOCALES.map((l) => ({ code: l.code, hreflang: l.htmlLang, path: localizedPath(bare, l.code) }));
}

/* ── 글 꺼내기 (생성기용) ────────────────────────────
 *
 * 브라우저 쪽(`src/lib/i18n.ts`)과 **같은 규칙**이다: 없으면 원본 언어로 떨어지고,
 * 그것도 없으면 열쇠를 그대로 돌려준다. 두 쪽 규칙이 갈리면 사람이 보는 화면과
 * 검색엔진이 읽는 머리말이 갈라진다.
 */

const catalogs = new Map();

export function catalog(code, ns) {
  const key = code + '/' + ns;
  if (!catalogs.has(key)) {
    const file = path.join(APP_ROOT, 'i18n', code, ns + '.json');
    catalogs.set(key, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {});
  }
  return catalogs.get(key);
}

export function tr(code, key, vars) {
  const ns = key.split('.')[0];
  const raw = catalog(code, ns)[key] ?? catalog(SOURCE_LOCALE, ns)[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/**
 * 이 언어에서 그 묶음이 **제 말로** 다 차 있는가 (원본 폴백이 아니라).
 *
 * 왜 필요한가: 번역이 덜 된 채로 `/en/…` 을 찍으면, 영어라고 표시된 주소에 한국어가 실린 장이
 * 검색엔진에 올라간다. 그건 안 만든 것보다 나쁘다(잘못된 언어 표시는 순위에 직접 해가 된다).
 * 그래서 **다 찬 언어의 장만 찍는다** — 번역이 늘면 그 다음 배포에 저절로 늘어난다.
 */
export function translated(code, ns) {
  return coverage(code, ns) >= 1;
}

/** 그 언어가 이 묶음을 얼마나 덮었나 (0~1). 원본 언어는 언제나 1. */
export function coverage(code, ns) {
  if (code === SOURCE_LOCALE) return 1;
  const src = catalog(SOURCE_LOCALE, ns);
  const mine = catalog(code, ns);
  const keys = Object.keys(src);
  if (!keys.length) return 0;
  return keys.filter((k) => mine[k] != null).length / keys.length;
}

/**
 * 이 장을 그 언어로 낼 수 있나 — **절벽을 없앤 판정** (TASK-KL-203 S8-b).
 *
 * 처음에는 「쓰는 묶음이 전부 100%」였다. 그런데 다른 사람이 위젯을 **하나** 등록하자마자
 * 영어 장이 통째로 사라졌다(실측 676개 중 2개 부족). 도구가 계속 느는 저장소에서 그 규칙은
 * 「누군가 뭔가 만들면 영어 사이트가 내려간다」와 같은 말이다 — 그건 지킬 수 없는 규칙이고,
 * 지킬 수 없는 규칙은 결국 꺼진다.
 *
 * 그래서 둘로 나눈다:
 *  - **틀(chrome)** = 머리띠·옆줄·머리말처럼 **장마다 똑같이 나오는 글**. 여기 구멍이 나면
 *    화면 전체가 반쯤 다른 말로 보인다 → **100% 아니면 안 낸다.** 개수가 적어 지킬 수 있다.
 *  - **항목(item)** = 도구 이름·설명처럼 **줄마다 따로인 글**. 하나 빠지면 그 줄만 원본 언어로
 *    보인다(옆줄 하나가 한국어). 나머지 수백 줄을 못 보게 만들 이유가 없다 → **거의 다 차면 낸다.**
 *
 * 「거의」의 값(95%)은 임의가 아니라 **새 도구 하나가 못 넘어뜨리는 선**이다: 항목 186개에서
 * 하나 빠짐 = 99.5%. 반대로 언어를 새로 켠 직후(0%)는 당연히 못 넘는다.
 */
export const ITEM_COVERAGE_MIN = 0.95;

export function pageAvailable(code, { namespaces = [], itemNamespaces = [] }) {
  if (!namespaces.every((ns) => coverage(code, ns) >= 1)) return false;
  return itemNamespaces.every((ns) => coverage(code, ns) >= ITEM_COVERAGE_MIN);
}

/**
 * head 에 넣을 hreflang 줄들.
 *
 * `x-default` 를 반드시 같이 넣는다 — 어느 언어도 안 맞는 사람에게 무엇을 보여 줄지 정하는
 * 줄이고, 이게 빠지면 검색엔진이 임의로 고른다. 그리고 **모든 언어 판이 서로를 다 가리켜야**
 * 한다(왕복 표시). 한쪽만 가리키면 통째로 무시된다 — 다국어 사이트가 제일 흔하게 틀리는 곳이다.
 */
export function hreflangTags(bare, site, codes) {
  /* **실제로 찍은 장만** 적는다. 없는 주소를 가리키는 hreflang 은 그 페이지의 표시 전체를
     무효로 만든다 — 번역이 덜 된 언어를 미리 적어 두면 다 적은 것보다 나쁘다. */
  const rows = alternates(bare)
    .filter((a) => !codes || codes.includes(a.code))
    .map((a) => `    <link rel="alternate" hreflang="${a.hreflang}" href="${site}${a.path}">`);
  rows.push(`    <link rel="alternate" hreflang="x-default" href="${site}${localizedPath(bare, DEFAULT_LOCALE)}">`);
  return rows.join('\n');
}

/* ── 눈에 보이는 언어 링크 (TASK-KL-244) ─────────────
 *
 * hreflang 은 「이 장의 다른 말 판은 저기」라고 **말해 줄 뿐**, 크롤러가 타고 갈 길은 아니다.
 * 화면의 언어 단추(`#langBtn`)는 JS 가 목록을 만들어서 HTML 에 `<a>` 가 한 개도 없었다 —
 * 그래서 en/ja 274장이 sitemap 에만 있고 **내부 링크 0** 인 고아 상태였다(2026-08-13 실측).
 * 여기서 찍는 `<a>` 가 그 길이다. 단추는 그대로 두고 나란히 둔다(사람은 단추, 크롤러는 링크).
 *
 * hreflang 과 **같은 인자**(bare·codes)로 만든다 — 둘이 갈라지면 없느니만 못하므로 한 함수에서.
 */
export function langLinksHtml(bare, current, codes) {
  return alternates(bare)
    .filter((a) => (!codes || codes.includes(a.code)) && a.code !== current)
    .map((a) => {
      const m = meta(a.code);
      return (
        `<a href="${a.path}" class="sidebar-dev-links sidebar-lang-link" hreflang="${m.htmlLang}" lang="${m.htmlLang}" title="${m.endonym}">` +
        `<span class="sidebar-dev-links-icon" aria-hidden="true">◐</span>` +
        `<span class="sidebar-dev-links-text">${m.endonym}</span></a>`
      );
    })
    .join('');
}

/** 셸에 박아 둔 언어 링크 칸을 **이 장의** 링크로 갈아 끼운다. 칸이 없으면 던진다 —
 *  조용히 안 바뀌면 274장이 다시 고아가 되고, 아무도 몇 달 동안 모른다. */
export function withLangLinks(html, { bare, current, codes }) {
  const re = /(<div class="sidebar-lang-links"[^>]*>)[\s\S]*?(<\/div>)/;
  if (!re.test(html)) throw new Error(`[lang-links] 언어 링크 칸을 못 찾았다 — ${bare} (index.html 의 .sidebar-lang-links 확인)`);
  return html.replace(re, `$1${langLinksHtml(bare, current, codes)}$2`);
}
