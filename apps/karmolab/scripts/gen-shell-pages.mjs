/**
 * 셸 밖에 있던 한 장짜리 페이지들을 앱 안으로 들인다 (TASK-KL-129)
 *
 * 왜: 봇 소개(`/karmolab/bot/`)와 프로필(`/karmolab/u/`)은 손으로 짠 문서였다. 도구를 쓰다
 * 그리로 가면 머리띠도 옆줄도 테마 단추도 ⌘K 도 없는 **다른 집**으로 떨어졌고, 돌아오는 길은
 * 작은 링크 하나뿐이었다. 도구 목록을 셸 안으로 들이면서 쓴 바탕(`lib/shell-page.mjs`)을
 * 그대로 쓴다 — 새 정적 페이지는 이제 「본문만 쓰면」 셸이 따라온다.
 *
 * 어떻게: 원본 문서에서 **머리(제목·설명·공유 카드)와 몸통과 제 스타일**만 뽑아 셸에 얹는다.
 * 원본은 그대로 둔다(거기가 여전히 내용의 주인이다). 원본의 스타일은 페이지 안으로 가둔다 —
 * `:root` 에 색 이름을 다시 정의하고 있어서, 안 가두면 셸 전체 색이 그 페이지에서 바뀐다.
 *
 * 곁들여 사라지는 것: 봇 소개가 남의 서버에서 받아 오던 글꼴 세 벌(수백 KB). 셸은 우리가
 * 구운 글꼴을 쓴다.
 *
 * 사용: node scripts/gen-shell-pages.mjs [--out ../blog/karmolab]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell, shellCommon, replaceMeta, asStaticPage } from './lib/shell-page.mjs';

// 셸(apps/karmolab/index.html)의 제목을 이 장의 제목으로 바꾼다.
// 예전엔 `'<title>KarmoLab</title>'` 리터럴을 찾아 바꿨는데, 셸 제목에 한 글자만 붙어도
// **아무 말 없이 안 바뀐 채** 129장이 전부 셸 제목으로 나갔다 (2026-08-13에 실제로 밟음).
// 그래서 모양이 아니라 자리로 찾고, 못 찾으면 그 자리에서 세운다.
function replaceTitle(html, title) {
  const next = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  if (next === html) throw new Error(`[title] 셸에서 <title> 을 못 찾았다 — 바꾸려던 제목: ${title}`);
  return next;
}


const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';
const outArg = process.argv.indexOf('--out');
const OUT = path.resolve(root, outArg >= 0 ? process.argv[outArg + 1] : '../blog/karmolab');

/** 들일 페이지들. `src` 가 내용의 주인, `permalink` 가 사람이 보는 주소. */
const PAGES = [
  {
    kind: 'bot',
    src: 'bot/index.html',
    permalink: '/karmolab/bot/',
    out: 'bot',
    // 저 혼자 살 때 달았던 제 머리띠(「← KarmoLab」 + 부르기)는 뺀다 — 셸 머리띠 바로 아래에
    // 또 하나가 붙어 두 겹이 된다. 같은 자리의 「서버에 부르기」는 본문 첫 화면에 그대로 있다.
    strip: [/<div class="top">[\s\S]*?<\/div><\/div>\n?/],
  },
  { kind: 'profile', src: 'u/index.html', permalink: '/karmolab/u/', out: 'u' },
  // TASK-KL-162: WM 소개 한 장. 원본(`wm/index.html`)은 손으로 쓰지 않는다 —
  // `scripts/gen-wm-landing.mjs` 가 memo 정본에서 찍는다(설정이 바뀌면 페이지도 바뀐다).
  { kind: 'wm', src: 'wm/index.html', permalink: '/karmolab/wm/', out: 'wm' },
];

const shell = loadShell(root);

/** 원본에서 한 조각 꺼내기 — 없으면 빈 문자열(있으면 좋고 없어도 되는 것들이다). */
function pick(html, re) {
  const m = html.match(re);
  return m ? m[1] : '';
}

/**
 * 원본의 스타일을 이 페이지 안으로 가둔다.
 *
 * 왜 전부 가둬야 하나: 이 문서들은 저 혼자 살던 시절의 규칙을 들고 있다 — `:root` 에 색 이름을
 * 다시 정의하고, `.btn` `.wrap` 같은 흔한 이름을 쓴다. 그대로 얹으면 ① 머리띠·옆줄 색이 이
 * 페이지에서만 바뀌고 ② 셸의 같은 이름 규칙과 서로 이긴다(단추가 화면 폭을 다 먹었다).
 *
 * 어떻게: 규칙마다 앞에 이름을 붙이는 대신 **통째로 한 겹 안에 넣는다**(CSS 중첩).
 * 그 안의 규칙은 자동으로 「이 상자 안에서만」이 된다. 다만 `@font-face`·`@keyframes` 는
 * 규칙 안에 들어가면 무효라 밖으로 꺼내 둔다.
 */
function scopeStyles(css, scope) {
  const hoisted = [];
  let rest = '';
  for (let i = 0; i < css.length; ) {
    const at = css.slice(i).search(/@(font-face|keyframes|-webkit-keyframes|import|charset)\b/);
    if (at < 0) { rest += css.slice(i); break; }
    rest += css.slice(i, i + at);
    let j = i + at;
    const open = css.indexOf('{', j);
    if (open < 0) { rest += css.slice(j); break; }
    let depth = 0, k = open;
    for (; k < css.length; k++) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}' && --depth === 0) { k++; break; }
    }
    hoisted.push(css.slice(j, k));
    i = k;
  }
  /* 저 혼자 살 때 「문서 전체」에 칠하던 바탕은 안 가져온다 (TASK-KL-129).
   * 그대로 두면 셸의 배경 위에 검은 판이 한 장 얹혀 그 페이지만 도려낸 것처럼 보인다.
   * 바탕은 셸이 깐다 — 그래야 같은 곳에 있는 것처럼 보인다. 글자색·글꼴은 그대로 쓴다. */
  rest = rest.replace(/(^|[},;])(\s*)(html|body)(\s*\{)([^}]*)\}/g, (all, pre, ws, tag, open, decls) =>
    `${pre}${ws}${tag}${open}${decls.replace(/(^|;)\s*(background(-color|-image)?|min-height)\s*:[^;}]*;?/g, '$1')}}`
  );
  // 저 혼자 살 때의 「문서 전체」 = 이제 이 상자다.
  const inner = rest.replace(/(^|[},;])(\s*)(html|body)\b/g, '$1$2&');
  return `${hoisted.join('\n')}\n${scope} {\n${inner.replace(/:root\b/g, '&')}\n}`;
}

/** 셸이 이미 쓰고 있는 클래스 이름 — 여기 든 이름을 페이지가 또 쓰면 서로 이긴다. */
const SHELL_CLASSES = (() => {
  const names = new Set();
  for (const f of ['css/toolbox.css', 'css/tools.css', 'css/randomgen.css']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, 'utf8').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) names.add(m[1]);
  }
  return names;
})();

/**
 * 이름이 부딪히면 갈아준다 (TASK-KL-129).
 *
 * 이 문서들은 저 혼자 살 때 `.btn` `.wrap` 같은 흔한 이름을 썼다. 셸에도 같은 이름이 있어서,
 * 한 겹 안에 넣어도 **셸에만 있는 선언**(예: `.btn-primary { width: 100% }`)은 그대로 살아난다
 * — 부르기 단추가 화면 폭을 다 먹었다. 겹치는 이름만 이 페이지 것으로 바꾼다.
 */
function renameCollisions(css, body, kind, srcName) {
  const own = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const clash = [...own].filter((n) => SHELL_CLASSES.has(n)).sort((a, b) => b.length - a.length);
  for (const name of clash) {
    const to = `${kind}-${name}`;
    css = css.replace(new RegExp(`\\.${name}(?![\\w-])`, 'g'), `.${to}`);
    // class="a b" 안의 그 이름만 바꾼다 (글 속의 같은 낱말은 안 건드린다)
    body = body.replace(/class="([^"]*)"/g, (all, list) => {
      const next = list.split(/\s+/).map((c) => (c === name ? to : c)).join(' ');
      return `class="${next}"`;
    });
    // 스크립트가 그 이름으로 화면을 찾고 있으면 조용히 깨진다 — 그때는 멈춘다.
    if (new RegExp(`['"\`][^'"\`]*\\.${name}(?![\\w-])`).test(body)) {
      throw new Error(`${srcName}: 스크립트가 「.${name}」 를 찾고 있는데 그 이름이 셸과 겹친다 — 원본에서 이름을 바꿔라`);
    }
  }
  return { css, body, clash };
}

let made = 0;
for (const page of PAGES) {
  const srcPath = path.join(root, page.src);
  if (!fs.existsSync(srcPath)) throw new Error(`들일 원본이 없다 — ${page.src}`);
  const src = fs.readFileSync(srcPath, 'utf8').split('\r\n').join('\n');

  const title = pick(src, /<title>([\s\S]*?)<\/title>/).trim();
  const description = pick(src, /<meta name="description" content="([^"]*)"/);
  const ogTitle = pick(src, /<meta property="og:title" content="([^"]*)"/) || title;
  const ogDesc = pick(src, /<meta property="og:description" content="([^"]*)"/) || description;
  const noindex = /<meta name="robots" content="noindex/.test(src);
  if (!title || !description) throw new Error(`${page.src}: 제목이나 설명이 없다 — 셸에 얹을 수 없다`);

  const styles = [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  let body = pick(src, /<body[^>]*>([\s\S]*)<\/body>/).trim();
  if (!body) throw new Error(`${page.src}: 몸통을 못 찾았다`);
  for (const re of page.strip || []) {
    const before = body;
    body = body.replace(re, '');
    if (body === before) throw new Error(`${page.src}: 빼려던 자리를 못 찾았다 — ${re}`);
  }

  const renamed = renameCollisions(styles, body, page.kind, page.src);
  body = renamed.body;

  const scope = `.shell-page-${page.kind}`;
  let html = shellCommon(shell, {
    permalink: page.permalink,
    lastModified: new Date(fs.statSync(srcPath).mtime).toISOString().slice(0, 10),
    bootPaths: [],
  });

  html = replaceTitle(html, title);
  html = html.replace(
    '<link rel="canonical" href="https://blog.mascari4615.com/karmolab/">',
    `<link rel="canonical" href="${SITE}${page.permalink}">`
  );
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'property', 'og:title', ogTitle);
  html = replaceMeta(html, 'property', 'og:description', ogDesc);
  html = replaceMeta(html, 'property', 'og:url', `${SITE}${page.permalink}`);
  html = replaceMeta(html, 'name', 'twitter:title', ogTitle);
  html = replaceMeta(html, 'name', 'twitter:description', ogDesc);
  // 사람마다 다른 내용이 스크립트로 채워지는 페이지는 색인하지 않는다 — 원본의 뜻을 그대로 잇는다.
  if (noindex) html = replaceMeta(html, 'name', 'robots', 'noindex, follow');

  html = asStaticPage(html, {
    kind: page.kind,
    head: renamed.css.trim() ? `<style>\n${scopeStyles(renamed.css, scope)}\n    </style>` : '',
    bodyHtml: `<div class="shell-page ${scope.slice(1)}">\n${body}\n</div>`,
  });

  const dir = path.join(OUT, page.out);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  made++;
}

console.log(`[gen-shell-pages] 셸 안으로 들인 페이지 ${made}장 → ${path.relative(root, OUT)}`);
