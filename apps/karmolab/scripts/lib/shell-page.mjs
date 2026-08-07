/**
 * 앱 셸에서 **정적으로 찍는 페이지**의 공통 바탕 (TASK-KL-129)
 *
 * 도구 상세 125장 · 도구 목록 · 봇 소개 · 프로필이 전부 여기를 지난다. 예전에는 목록·봇·프로필이
 * 셸 밖에서 손으로 짠 문서였다 — 거기만 머리띠도 옆줄도 테마 단추도 ⌘K 도 없었고, 같은 곳인데
 * 다른 집처럼 보였다. 한 벌로 모아 두면 한쪽만 고쳐져 갈라지는 일이 없다.
 *
 * 파는 것: 셸 읽기 · 공통 손질 · meta 갈아끼우기 · 위젯 파일 주소 규칙.
 * 무엇을 보여 줄지(제목·설명·본문)는 부르는 쪽이 정한다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** apps/karmolab 뿌리 (이 파일은 scripts/lib/ 안에 있다). */
const APP_ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* 셸은 **줄 끝을 맞춰서** 읽는다 (TASK-KL-129).
 * 아래 손질은 전부 「여러 줄이 이 순서로 있다」를 찾아 바꾼다. 그런데 이 파일이 윈도우에서
 * 한 번 저장되면 줄 끝이 CRLF 로 바뀌고(깃은 되돌려 저장하므로 diff 에는 안 보인다),
 * 그 순간 앞머리 치환부터 전부 못 찾아 **생성기가 통째로 죽는다 = 배포 정지**. */
export function loadShell(root) {
  return fs.readFileSync(path.join(root, 'index.html'), 'utf8').split('\r\n').join('\n');
}

/** head 의 한 줄짜리 meta 를 값만 갈아끼운다 (셸 구조 변화에 둔감하게 attr 매칭). */
export function replaceMeta(html, attr, name, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(">)`);
  if (!re.test(html)) throw new Error(`셸에서 meta ${attr}="${name}" 를 못 찾음 — index.html 구조 변경 확인`);
  return html.replace(re, `$1${esc(content)}$2`);
}

/** 위젯 이름 → 실제 파일 자리. 앱이 쓰는 규칙과 같아야 한다(두 벌이면 언젠가 갈라진다). */
/**
 * 이 판(배포)의 표식 — `build.mjs` 가 남긴 것을 그대로 읽는다 (TASK-KL-128 ②-b).
 *
 * 미리받기(preload) 주소는 앱이 실제로 부르는 주소와 **글자 그대로 같아야** 한다.
 * 앱은 위젯 주소에 이 표식을 붙인다(`toolbox.ts` 의 withBuildTag) — 여기서 안 붙이면
 * 같은 위젯을 두 번 받는다: 미리받기로 한 번, 앱이 한 번(실측으로 그랬다).
 * 파일이 없으면 표식 없이 간다 — 그때는 앱도 안 붙이므로 여전히 같다.
 */
const BUILD_TAG = (() => {
  try {
    return fs.readFileSync(path.join(APP_ROOT, '.build-stamp'), 'utf8').trim();
  } catch {
    return '';
  }
})();

/** 위젯 묶음 주소에만 표식을 붙인다 (vendor·world·root 는 앱도 안 붙인다). */
export function preloadHref(p) {
  const file = scriptFile(p);
  return `/apps/karmolab/${file}` + (BUILD_TAG && file.startsWith('js/widgets/') ? `?b=${BUILD_TAG}` : '');
}

export function scriptFile(p) {
  if (typeof p !== 'string') return `js/widgets/${p}.js`;
  if (p.startsWith('world/')) return `world/${p.slice('world/'.length)}.js`;
  if (p.startsWith('vendor/')) return `js/vendor/${p.slice('vendor/'.length)}.js`;
  if (p.startsWith('root/')) return `js/${p.slice('root/'.length)}.js`;
  return `js/widgets/${p}.js`;
}

/**
 * 「이 셸을 이 주소의 한 장으로 만든다」 — 앞머리·부팅 목록·큰제목·안 쓰는 스타일.
 */
export function shellCommon(html, { permalink, lastModified, bootPaths }) {
  // 사이트맵에 실릴 변경일도 여기서 박는다 (jekyll-sitemap 이 front matter 의 이 값을 읽는다).
  html = html.replace(
    /^---\nlayout: none\npermalink: \/karmolab\/\n---/,
    `---\nlayout: none\npermalink: ${permalink}\nlast_modified_at: ${lastModified}\n---`
  );
  if (!html.startsWith(`---\nlayout: none\npermalink: ${permalink}`)) {
    throw new Error('셸 front matter 치환 실패 — index.html 앞머리 확인');
  }

  // 첫 화면용 뽑기 위젯은 정적 페이지에서 쓰이지 않는다.
  html = html.replace(
    /<script defer src="\/apps\/karmolab\/js\/widgets\/randomgen\/randomgen-[a-z]+\.js"><\/script>\s*/g,
    ''
  );
  // 매니페스트 파일이 뒤늦게(defer) 원래 목록을 다시 씌우므로, 그 파일을 부르는 자리를
  // 짧은 목록으로 바꾼다 — 인라인으로 먼저 정해 봐야 defer 가 이긴다.
  const bootTag = '<script defer src="/apps/karmolab/js/widgets-manifest.js"></script>';
  if (!html.includes(bootTag)) throw new Error('셸에서 위젯 매니페스트 자리를 못 찾음 — index.html 확인');
  html = html.replace(
    bootTag,
    `<script>window.KARMOLAB_WIDGETS_BOOT=${JSON.stringify(bootPaths)};</script>`
  );
  html = html.replace(
    '</head>',
    bootPaths.map((p) => `    <link rel="preload" as="script" href="${preloadHref(p)}">
`).join('') + '</head>'
  );

  // 페이지의 큰제목은 하나여야 한다 (TASK-KL-089).
  // 셸에는 큰제목이 둘 더 있다 — 첫 화면 인사말 「KarmoLab」과, 자바스크립트가 채우는 헤더 제목
  // (이쪽은 화면에 아예 안 나온다). 정적 페이지의 주제는 제 본문인데 큰제목이 셋이면
  // 검색엔진이 무엇에 대한 문서인지 흐리게 읽는다. 생김새는 클래스가 정하므로 태그만 바꾼다.
  // 태그를 **통째 문자열로** 찾다가, 셸에 속성 하나(id) 가 붙자 생성기가 통째로 멈췄다.
  // 클래스만 보고 태그 이름을 바꾼다 — 속성이 늘어도 계속 맞는다.
  for (const cls of ['intro-title', 'content-title']) {
    const re = new RegExp(`<h1([^>]*\\bclass="${cls}"[^>]*)>([\\s\\S]*?)</h1>`);
    if (!re.test(html)) throw new Error(`셸에서 큰제목을 못 찾음 — index.html 확인: class="${cls}"`);
    html = html.replace(re, '<div$1>$2</div>');
  }

  // 랜덤 생성기 전용 스타일은 정적 페이지에서 뺀다 (TASK-KL-089).
  // 그 위젯은 앱 첫 화면에만 있고 상세 페이지가 없다. 뽑기 계열 도구(로또·사다리·추첨)도
  // 이 스타일을 쓰지 않는 것을 다섯 페이지에서 확인했다 — 해당 요소가 하나도 안 나온다.
  /* 도구 상세 페이지는 **첫 그림부터** 도구 스타일이 필요하다 — 셸에서는 그리기를 안 막게
     걸어 뒀지만(첫 화면에서는 쓰임 0%), 여기서는 도로 막는 쪽으로 되돌린다.
     안 그러면 글이 먼저 나왔다가 스타일이 와서 자리가 튄다 (TASK-KL-128 ④-c). */
  const TOOLS_CSS_DEFERRED =
    '<link rel="stylesheet" href="/apps/karmolab/css/tools.css" media="print" onload="this.media=&#39;all&#39;">';
  if (!html.includes(TOOLS_CSS_DEFERRED)) throw new Error('셸에서 도구 스타일 자리를 못 찾음 — index.html 확인');
  html = html.replace(TOOLS_CSS_DEFERRED, '<link rel="stylesheet" href="/apps/karmolab/css/tools.css">');

  const RANDOMGEN_CSS =
    '<link rel="stylesheet" href="/apps/karmolab/css/randomgen.css" media="print" onload="this.media=&#39;all&#39;">';
  if (!html.includes(RANDOMGEN_CSS)) throw new Error('셸에서 랜덤 생성기 스타일 자리를 못 찾음 — index.html 확인');
  html = html.replace(RANDOMGEN_CSS, '');

  /* 앱 첫 화면용 크롤러 안내는 여기서 뺀다 — 정적 페이지에는 이미 자기 설명이 있고,
   * 같은 글이 126장에 똑같이 박히면 페이지끼리 닮아 보여 되레 손해다. */
  {
    const before = html;
    html = html.replace(/\s*<!-- KARMOLAB_ROOT_INTRO[\s\S]*?<\/noscript>/, '');
    if (html === before) throw new Error('셸에서 첫 화면 안내 블록을 못 찾음 — index.html 확인');
  }

  /* 앱 첫 화면용 구조 설명도 뺀다 (TASK-KL-089).
   * 그것은 「여기가 KarmoLab 이고 안에서 도구를 찾을 수 있다」는 말이라, 그대로 복사되면
   * 각 장이 자기를 첫 화면이라고 주장하게 된다. 정적 페이지는 제 설명을 따로 박는다. */
  {
    const before = html;
    html = html.replace(/\s*<!-- KARMOLAB_ROOT_LD[\s\S]*?<\/script>/, '');
    if (html === before) throw new Error('셸에서 첫 화면 구조 설명 블록을 못 찾음 — index.html 확인');
  }

  /* 코드 색칠 스타일은 첫 화면을 막지 않게 한다 (TASK-KL-089).
   * 재 보니 도구 125장 중 색칠을 쓰는 페이지가 **하나도 없다** — 그 기능을 쓰는 위젯은
   * 대화 도구 하나뿐이고, 거기엔 도구 페이지가 없다. 그런데 스타일 링크는 모든 장의 머리에
   * 있어서, 매번 첫 화면을 막는 자리를 하나씩 차지했다(0% 사용).
   * 태그 자체는 남긴다 — 색 테마를 고르는 코드가 이 자리를 찾기 때문이다. 나중에 색칠이
   * 실제로 실려 오면 그때 켜 준다(안 그러면 코드가 흑백으로 나오는 조용한 고장이 된다). */
  {
    const before = html;
    html = html.replace(
      /(<link id="prism-css" rel="stylesheet" href="[^"]*")>/,
      '$1 media="print">\n' +
        '    <script>(function(){var el=document.getElementById("prism-css");' +
        'if(!el)return;var t=setInterval(function(){if(window.Prism){el.media="all";clearInterval(t)}},400);' +
        'setTimeout(function(){clearInterval(t)},30000)})()</script>'
    );
    if (html === before) throw new Error('셸에서 코드 색칠 스타일 자리를 못 찾음 — index.html 확인');
  }

  return html;
}

/**
 * 본문이 이미 HTML 에 박혀 있는 정적 페이지로 만든다 (TASK-KL-129).
 *
 * 셸은 그대로 쓰되 화면은 앱이 그리지 않는다 — 여기서 첫 화면을 그리면 적혀 있던 본문 위에
 * 홈이 덮인다. 옆줄·머리띠에서 도구를 고르면 그 도구의 제 주소로 옮겨 간다.
 */
export function asStaticPage(html, { kind, bodyHtml, toolPages = [], buildPrint = '', head = '' }) {
  const entry =
    `<script>window.KARMOLAB_ENTRY_STATIC=${JSON.stringify(kind)};` +
    `window.KARMOLAB_TOOL_PAGES=${JSON.stringify(toolPages)};` +
    `window.KARMOLAB_BUILD_PRINT=${JSON.stringify(buildPrint)};</script>`;
  html = html.replace('</head>', `    ${entry}\n${head ? `    ${head}\n` : ''}</head>`);
  html = html.replace('<body>', `<body class="${kind === 'hub' ? 'tool-hub-page' : 'shell-static-page'}">`);

  // 도구 상세용 설명 자리는 여기선 안 쓴다 — 본문이 곧 이 페이지다.
  html = html.replace(/<!-- KARMOLAB_TOOL_SEO[\s\S]*?-->/, '');

  const slot = '<div class="content-body" id="tool-pages"></div>';
  if (!html.includes(slot)) throw new Error('셸에서 본문 자리를 못 찾음 — index.html 확인');
  return html.replace(slot, `<div class="content-body" id="tool-pages">${bodyHtml}</div>`);
}
