/**
 * 한 장을 **그 언어의 장**으로 만든다 (TASK-KL-203 S2)
 *
 * 셸 손질(`shell-page.mjs`)과 일부러 갈라 뒀다: 저쪽은 「앱 셸을 정적 페이지로」, 이쪽은
 * 「이미 만들어진 한 장을 다른 언어로」다. 도구 상세·목록·봇 소개·홈이 전부 이 함수를 마지막에
 * 한 번 지나면 언어 판이 생긴다 — 생성기마다 머리말 손질을 베껴 쓰지 않는다.
 *
 * 여기서 박는 것 (검색엔진이 언어를 판단하는 데 쓰는 전부):
 *  - `<html lang>` — 화면 읽어 주는 프로그램과 브라우저 번역 제안이 이걸 본다
 *  - `canonical` — 이 언어 판의 제 주소. 원본 주소를 그대로 두면 그 장이 색인에서 통째로 빠진다
 *  - `hreflang` 왕복 + `x-default` — 서로를 다 가리켜야 한 벌로 인정된다
 *  - `og:locale` + `og:locale:alternate` — 공유 카드
 *  - 제목·설명 — 사람이 실제로 읽는 글
 *  - `window.__KARMO_LOCALE` + 그 언어의 `site` 묶음 인라인 — 앱이 뜨자마자 제 말로 시작한다
 *    (여기서 안 박으면 앱이 주소를 보고 다시 정하고, 그 사이 한 번 한국어로 번쩍인다)
 */
import { LOCALES, DEFAULT_LOCALE, meta, localizedPath, hreflangTags, catalog, tr } from './locales.mjs';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** head 의 한 줄 meta 를 값만 갈아끼운다. 없으면 그냥 넘어간다(장마다 있는 것이 다르다). */
function setMeta(html, attr, name, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(">)`);
  return re.test(html) ? html.replace(re, `$1${esc(content)}$2`) : html;
}

/**
 * @param html   원본(기본 언어) 장의 HTML
 * @param code   만들 언어
 * @param bare   언어 앞머리를 뗀 주소 (`/karmolab/t/qr/`)
 * @param site   사이트 뿌리 (`https://…`)
 * @param codes  이 장이 **실제로 존재하는** 언어들 — hreflang 은 이 안에서만 적는다
 * @param namespaces 머리말에 미리 박을 글 묶음 (기본 `site`)
 */
export function toLocalePage(html, { code, bare, site, codes, namespaces = ['site'] }) {
  const m = meta(code);
  const self = site + localizedPath(bare, code);

  /* ① 문서 언어. 앞머리(front matter)의 주소도 같이 옮긴다 — Jekyll 이 이 값으로 파일을 놓는다. */
  html = html.replace(/^(---\nlayout: none\npermalink: )([^\n]*)/, (_w, head, p) => head + localizedPath(p, code));
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${m.htmlLang}">`);

  /* ② 제 주소. canonical 이 원본을 가리키면 이 장은 「원본의 사본」으로 취급돼 색인에서 빠진다. */
  html = html.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${self}$2`);

  /* ③ 서로를 가리키는 표시. 원본 장에도 같은 블록이 들어가야 왕복이 성립한다.
     원본에 박혀 있던 것은 **원본 기준**이라 먼저 걷어 낸다(설명 주석까지). */
  html = html.replace(/\n\s*<!-- 언어 판 왕복 표시[\s\S]*?-->/, '');
  html = html.replace(/\n\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '');
  html = html.replace('</head>', hreflangTags(bare, site, codes) + '\n</head>');

  /* ④ 공유 카드의 언어. */
  html = setMeta(html, 'property', 'og:locale', m.ogLocale);
  html = setMeta(html, 'property', 'og:url', self);
  const others = LOCALES.filter((l) => l.code !== code && (!codes || codes.includes(l.code)));
  if (others.length) {
    html = html.replace(
      /(<meta property="og:locale" content="[^"]*">)/,
      (w) => w + '\n' + others.map((l) => `    <meta property="og:locale:alternate" content="${l.ogLocale}">`).join('\n')
    );
  }

  /* ⑤ 사람이 읽는 글. 장마다 제 제목이 있으면 부르는 쪽이 다시 덮는다. */
  const title = tr(code, 'site.title');
  const desc = tr(code, 'site.description');
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = setMeta(html, 'name', 'description', desc);
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', desc);
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', desc);

  /* ⑥ 앱이 뜨자마자 제 말로. 원본 언어 묶음도 같이 박는다 — 아직 안 옮긴 열쇠가 떨어질 곳이다. */
  const inline = {};
  for (const ns of namespaces) {
    inline[code] = inline[code] || {};
    inline[code][ns] = catalog(code, ns);
    if (code !== DEFAULT_LOCALE) {
      inline[DEFAULT_LOCALE] = inline[DEFAULT_LOCALE] || {};
      inline[DEFAULT_LOCALE][ns] = catalog(DEFAULT_LOCALE, ns);
    }
  }
  const boot =
    `<script>window.__KARMO_LOCALE=${JSON.stringify(code)};` +
    `window.__KARMO_I18N=${JSON.stringify(inline)};</script>`;
  html = html.replace('</head>', `    ${boot}\n</head>`);

  return html;
}

/** 원본(기본 언어) 장에도 같은 왕복 표시를 박는다 — 한쪽만 있으면 통째로 무시된다. */
export function addAlternatesToSource(html, { bare, site, codes }) {
  html = html.replace(/\n\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '');
  return html.replace('</head>', hreflangTags(bare, site, codes) + '\n</head>');
}
