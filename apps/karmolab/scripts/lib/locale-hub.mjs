/**
 * 도구 **목록(허브)** 장의 언어 판 (TASK-KL-203 S4-d)
 *
 * 도구 장 258개가 전부 이 한 장을 가리킨다 — 여기가 없으면 언어 판에서 「도구 전체 목록」을
 * 누르는 순간 한국어로 되돌아간다(404 는 아니지만 언어가 끊긴다).
 *
 * **분류 이름은 새로 옮길 게 없다.** 허브의 분류 제목은 곧 그 묶음 도구의 이름이고
 * (「계산기」 = `calc` 위젯), 그건 `widgets` 묶음에 이미 3개 언어로 다 있다. 그래서 여기서는
 * **id 만 보고 이름을 다시 붙인다** — 화면의 글자를 짜깁기하지 않으므로 원본 모양이 바뀌어도
 * 조용히 깨지지 않는다(못 찾으면 그대로 남고, 그건 눈에 띈다).
 */
import { tr, localizedPath } from './locales.mjs';
import { toLocalePage } from './locale-page.mjs';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param source 한국어 허브 HTML
 * @param code   만들 언어
 * @param opts   { site, codes, count, href } — `href(bare, code)` = 그 언어 판이 있는 주소만 앞머리
 */
export function toLocaleHub(source, code, { site, codes, count, href }) {
  const bare = '/karmolab/t/';
  let html = toLocalePage(source, {
    code,
    bare,
    site,
    codes,
    namespaces: ['site', 'shell', 'widgets', 'widgets-desc', 'toolpage', 'tools']
  });

  const L = (key, vars) => tr(code, key, vars);
  const title = L('toolpage.hub.title');
  const desc = L('toolpage.hub.description', { n: count });

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  for (const [attr, name, val] of [
    ['name', 'description', desc],
    ['property', 'og:description', desc],
    ['name', 'twitter:description', desc],
    ['property', 'og:title', title],
    ['name', 'twitter:title', title],
    ['property', 'og:image:alt', L('toolpage.hub.ogAlt')]
  ]) {
    html = html.replace(new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(">)`), `$1${esc(val)}$2`);
  }

  /* 큰제목 · 빵부스러기. */
  html = html.replace(/<h1>[^<]*<\/h1>/, `<h1>${esc(L('toolpage.hub.h1', { n: count }))}</h1>`);
  html = html.replace(
    /<nav class="tool-crumb"[\s\S]*?<\/nav>/,
    `<nav class="tool-crumb" aria-label="${esc(L('toolpage.crumb.aria'))}">` +
      `<a href="${href('/karmolab/', code)}">KarmoLab</a><i aria-hidden="true">›</i>` +
      `<span aria-current="page">${esc(L('toolpage.crumb.tools'))}</span></nav>`
  );

  /* 분류 제목과 그 위 바로가기 — **id 로 이름을 다시 붙인다**. */
  html = html.replace(
    /(<h2 class="tool-hub-group" id="c-([^"]+)"><a href="[^"]*">)([^<]*)(<\/a>)/g,
    (whole, open, id, _old, close) => {
      const name = tr(code, `widgets.${id}.title`);
      return name === `widgets.${id}.title` ? whole : open + esc(name) + close;
    }
  );
  html = html.replace(/(<a href="#c-([^"]+)">)([^<]*)(<\/a>)/g, (whole, open, id, _old, close) => {
    const name = tr(code, `widgets.${id}.title`);
    /* 묶음이 아닌 자리(「그 밖에」)는 id 가 위젯이 아니다 — 그때는 라벨 묶음에서 가져온다. */
    if (name !== `widgets.${id}.title`) return open + esc(name) + close;
    return open + esc(L('toolpage.hub.other')) + close;
  });
  html = html.replace(
    /(<h2 class="tool-hub-group"[^>]*>)([^<]+)(<span class="tool-hub-count")/g,
    (whole, open, _old, tail) => open + esc(L('toolpage.hub.other')) + tail
  );

  /* 도구 카드 — 이름과 한 줄 소개. `title` 속성(마우스 올렸을 때)도 같은 글이다. */
  html = html.replace(
    /(<a class="tool-hub-card"[^>]*href="[^"]*\/karmolab\/t\/([^/"]+)\/"[^>]*>)<strong>([\s\S]*?)<\/strong><span title="[^"]*">[^<]*<\/span>/g,
    (whole, open, id, inner) => {
      const name = tr(code, `widgets.${id}.title`);
      const lead = tr(code, `tools.${id}.lead`);
      if (name === `widgets.${id}.title`) return whole;
      /* 이름 뒤에 「새로 나옴」 배지가 붙은 카드가 있다. 처음엔 `<strong>이름</strong>` 만 찾다가
         배지 달린 8장을 통째로 놓쳤다 — 그 카드만 한국어로 남았다(실측). 배지는 그대로 살린다. */
      const badge = /<em class="tool-hub-new">[\s\S]*?<\/em>/.exec(inner);
      const one = lead === `tools.${id}.lead` ? '' : lead;
      return `${open}<strong>${esc(name)}${badge ? badge[0] : ''}</strong><span title="${esc(one)}">${esc(one)}</span>`;
    }
  );

  /* 나머지 라벨. */
  const swaps = [
    [/<em class="tool-hub-new">[^<]*<\/em>/g, `<em class="tool-hub-new">${esc(L('toolpage.hub.new'))}</em>`],
    [/(<nav class="tool-hub-toc" aria-label=")[^"]*(")/, `$1${esc(L('toolpage.hub.tocAria'))}$2`],
    [/(<section class="tool-hub-mine"[^>]*aria-label=")[^"]*(")/, `$1${esc(L('toolpage.hub.mineAria'))}$2`],
    [/(<input type="search" id="hubFind" aria-label=")[^"]*(")/, `$1${esc(L('toolpage.hub.findAria'))}$2`],
    [/(<input type="search" id="hubFind"[^>]*placeholder=")[^"]*(")/, `$1${esc(L('toolpage.hub.findPlaceholder'))}$2`],
    [/(<p class="tool-hub-empty"[^>]*>)[^<]*(<\/p>)/, `$1${esc(L('toolpage.hub.empty'))}$2`],
    [
      /(<h2 class="tool-hub-group tool-hub-mine-title">)[^<]*(<\/h2>)/,
      `$1${esc(L('toolpage.hub.mineTitle'))}$2`
    ],
    [/(<p class="tool-seo-lead">)[^<]*(<\/p>)/, `$1${esc(tr(code, 'site.tagline'))}$2`]
  ];
  for (const [re, to] of swaps) html = html.replace(re, to);

  /* 바닥 안내 — 링크 이름까지 통째로 다시 짓는다. */
  html = html.replace(
    /<p class="tool-seo-note">[\s\S]*?<\/p>/,
    `<p class="tool-seo-note">
        ${esc(L('toolpage.hub.note'))}
        ` +
      `<a href="${href('/karmolab/', code)}">${esc(L('toolpage.nav.seeAll'))}</a> · ` +
      `<a href="https://github.com/Mascari4615" rel="me">${esc(L('toolpage.nav.maker'))}</a>
      </p>`
  );

  /* 「… — 놀다 가세요」 꼬리. 앞의 두 링크 이름은 위젯 이름이라 도구 이름 표가 이미 바꿨다. */
  html = html.replace(/<p class="tool-hub-quest">[\s\S]*?<\/p>/, (whole) => {
    /* 링크 이름은 위젯 이름이다 — 주소에서 id 를 뽑아 그 언어 이름을 붙인다. */
    const links = [...whole.matchAll(/<a href="([^"]*\/karmolab\/([^/"]+)\/)"[^>]*>[^<]*<\/a>/g)];
    if (!links.length) return whole;
    const body = links
      .map(([, url, id]) => `<a href="${url}">${esc(tr(code, `widgets.${id}.title`))}</a>`)
      .join(' · ');
    return `<p class="tool-hub-quest">${body} — ${esc(L('toolpage.hub.playTail'))}</p>`;
  });

  return html;
}
