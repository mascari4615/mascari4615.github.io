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

/**
 * 언어 판을 찍는 장들 — **찍는 쪽과 검사하는 쪽이 같은 목록을 본다** (TASK-KL-203 S6).
 *
 * 따로 적어 뒀더니 곧바로 갈라졌다: 생성기는 「이름까지 다 찬 언어만」으로 좁혔는데 검사는
 * 예전 기준(설명만)이라, 안 찍힌 장을 찾다가 빨간불이 났다. 목록은 한 곳에만 둔다.
 */
export const LOCALE_PAGES = [
  {
    bare: '/karmolab/',
    /** 틀 — 100% 아니면 그 언어로 안 낸다. */
    namespaces: ['site', 'shell'],
    /** 항목 — 거의 다 차면 낸다. 빠진 줄만 원본 언어로 보인다. */
    itemNamespaces: ['widgets', 'widgets-desc']
  }
];

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 화면에 박힌 글을 그 언어로 바꾼다 — **표식이 붙은 것만** (TASK-KL-203 S3).
 *
 * 표식 두 가지:
 *   `data-i18n="shell.nav.tools"`        → 그 태그 안의 글
 *   `data-i18n-title="shell.nav.tools"`  → 그 태그의 `title` 값 (aria-label 등도 같은 꼴)
 *
 * **왜 실행 중이 아니라 찍을 때 바꾸나**: 한국어 장은 `index.html` 그 자체다. 여기 글을 코드로
 * 그리게 바꾸면 스크립트가 안 도는 사람과 크롤러에게는 빈 화면이 된다(지금 그 두 쪽 다 챙기고
 * 있다 — noscript 안내까지 박아 뒀다). 그래서 **원본은 한국어 그대로 두고, 다른 언어 장을 찍을
 * 때만** 갈아 끼운다. 실행 중 바꾸기는 언어 단추가 눌렸을 때만 필요한데, 그때는 어차피 그 언어의
 * 주소로 옮겨 가므로 다시 찍힌 장이 온다.
 *
 * 표식이 곧 목록이라 **빠뜨림이 눈에 보인다** — 표식 없는 글은 안 바뀌고, 그건 `audit-i18n-dom.mjs`
 * 가 「이 장에 표식 없는 한국어가 N개」로 센다.
 */
export function applyDomStrings(html, code) {
  /* ① 태그 안의 글. 안에 다른 태그가 없는 것만 바꾼다 — 표식은 글을 직접 담은 태그에 붙인다. */
  html = html.replace(
    /(<(\w+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g,
    (_w, open, _tag, key, _old, close) => open + esc(tr(code, key)) + close
  );

  /* ② 속성값 (title·aria-label·placeholder…). 같은 태그 안에서만 찾는다. */
  html = html.replace(/<\w+\b[^>]*>/g, (tag) => {
    if (!tag.includes('data-i18n-')) return tag;
    let out = tag;
    for (const [, attr, key] of tag.matchAll(/\bdata-i18n-([\w-]+)="([^"]+)"/g)) {
      const re = new RegExp(`\\b${attr}="[^"]*"`);
      /* 표식만 있고 바꿀 속성이 없으면 그대로 둔다 — 조용히 새 속성을 만들지 않는다
         (오타 하나로 `titel="…"` 같은 게 생기면 아무도 못 찾는다). 그건 검사가 잡는다. */
      if (re.test(out)) out = out.replace(re, `${attr}="${esc(tr(code, key))}"`);
    }
    return out;
  });

  return html;
}

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

  /* ⑦ 도구 이름·설명. 목록이 만들어지는 자리에서 한 번에 갈아 끼우도록 표를 미리 박아 둔다
     (`src/widgets-lazy-meta.ts` 끝의 한 줄이 이걸 읽는다). 읽는 곳이 넷이라 읽는 쪽에서
     바꾸면 한 곳을 빠뜨린다 — 그 누락은 한국어를 읽는 사람 눈에 안 보인다. */
  const names = {};
  for (const [key, val] of Object.entries(catalog(code, 'widgets'))) {
    const id = key.slice('widgets.'.length, -'.title'.length);
    (names[id] ||= {}).title = val;
  }
  for (const [key, val] of Object.entries(catalog(code, 'widgets-desc'))) {
    const id = key.slice('widgets-desc.'.length, -'.desc'.length);
    (names[id] ||= {}).desc = val;
  }
  if (Object.keys(names).length) {
    /* **대입되는 순간에 건다.**
     *
     * 처음에는 목록을 만드는 파일 끝에서 한 번 바꿨는데, 안 바뀌었다. 이 목록을 만드는 곳이
     * **둘**이기 때문이다 — 원본(`widgets-lazy-meta`)과 빌드가 따로 구워 두는 가벼운 사본
     * (`widgets-index`). 뒤에 오는 쪽이 통째로 덮어써서 앞에서 바꾼 것이 사라졌다(실측).
     *
     * 그래서 「누가 만드느냐」를 신경 쓰지 않는 자리로 옮긴다: 이 이름의 **대입 자체**를 가로채
     * 들어오는 목록마다 갈아 끼운다. 만드는 쪽이 셋이 되든 순서가 바뀌든 계속 맞는다.
     * 한국어 화면에는 이 조각이 아예 안 실린다. */
    const hook = `<script>(function(){var M=${JSON.stringify(names)},v;
Object.defineProperty(window,'KARMOLAB_LAZY_META',{configurable:true,
get:function(){return v},
set:function(a){v=a;if(Array.isArray(a))for(var i=0;i<a.length;i++){var m=M[a[i].id];if(m){if(m.title)a[i].title=m.title;if(m.desc)a[i].desc=m.desc}}}});
})();</script>`;
    html = html.replace('</head>', `    ${hook}\n</head>`);
  }

  /* ⑧ 화면에 박힌 글. 표식(`data-i18n`)이 붙은 것만 바뀐다. */
  html = applyDomStrings(html, code);

  return html;
}

/** 원본(기본 언어) 장에도 같은 왕복 표시를 박는다 — 한쪽만 있으면 통째로 무시된다. */
export function addAlternatesToSource(html, { bare, site, codes }) {
  html = html.replace(/\n\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g, '');
  return html.replace('</head>', hreflangTags(bare, site, codes) + '\n</head>');
}
