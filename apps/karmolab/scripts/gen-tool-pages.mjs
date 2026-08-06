/**
 * 도구 상세 페이지 생성기 (TASK-KL-088)
 *
 * 왜 필요한가: KarmoLab 은 해시 라우팅(`/karmolab/#charcount`) 이라 도구가 몇 개든 URL 이 하나였다.
 * 검색엔진은 fragment 를 별도 문서로 색인하지 않으므로 도구별 노출 면적이 0 이었다.
 * → 위젯 매니페스트 + data/tools-seo.json 을 짝지어 `/karmolab/t/<id>/` 정적 페이지를 찍는다.
 *   각 페이지는 같은 앱 셸을 쓰되 head(제목·설명·canonical·JSON-LD)와 서버 렌더 설명 블록만 다르다.
 *
 * 입력: index.html (앱 셸 템플릿) · data/tools-seo.json · js/widgets-lazy-meta.js (빌드 산출물)
 * 출력: <out>/<id>/index.html + <out>/index.html (허브)
 *
 * 사용: node scripts/gen-tool-pages.mjs [--out ../blog/karmolab/t]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SITE = 'https://blog.mascari4615.com';
const BASE_PATH = '/karmolab/t';

const outArgIndex = process.argv.indexOf('--out');
const outDir = path.resolve(root, outArgIndex >= 0 ? process.argv[outArgIndex + 1] : '../blog/karmolab/t');

/* ── 입력 로드 ─────────────────────────────────────── */

const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;

const lazyMetaPath = path.join(root, 'js/widgets-lazy-meta.js');
if (!fs.existsSync(lazyMetaPath)) {
  console.error('[gen-tool-pages] js/widgets-lazy-meta.js 없음 — `npm run build` 를 먼저 돌려야 합니다.');
  process.exit(1);
}
/** 빌드된 IIFE 는 window 에 배열을 꽂는다. 파서를 새로 쓰지 않고 그 계약을 그대로 쓴다. */
const fakeWindow = {};
new Function('window', fs.readFileSync(lazyMetaPath, 'utf8'))(fakeWindow);
const widgets = fakeWindow.KARMOLAB_LAZY_META || [];
const widgetById = Object.fromEntries(widgets.map((w) => [w.id, w]));

/* ── 교차 검증 (짝 없으면 빌드 실패) ───────────────────── */

const ids = Object.keys(seo);
const orphans = ids.filter((id) => !widgetById[id]);
if (orphans.length) {
  console.error(`[gen-tool-pages] tools-seo.json 에 있으나 위젯 매니페스트에 없는 id: ${orphans.join(', ')}`);
  process.exit(1);
}
for (const id of ids) {
  const t = seo[id];
  for (const field of ['description', 'lead', 'howto', 'faq', 'related']) {
    if (!t[field] || (Array.isArray(t[field]) && !t[field].length)) {
      console.error(`[gen-tool-pages] ${id}: 필수 필드 「${field}」 누락`);
      process.exit(1);
    }
  }
  // layout:'full' 은 페이지 스크롤을 죽인다(.main-content overflow:hidden) → 아래 설명 블록이
  // 화면 밖으로 잘려 크롤러에게도 사용자에게도 안 보인다. 상세 페이지가 있는 도구는 쓸 수 없다.
  // (layout:'full' 은 한때 여기서 막았다. 앱에서 그런 도구는 바깥 스크롤을 꺼서 아래 설명이
  //  잘렸기 때문이다. TASK-KL-089 에서 상세 페이지에 한해 도구 몫의 높이를 정하고 나머지를
  //  흐르게 고쳤으므로 — `tools.css` 의 body.tool-detail 규칙 — 더 막지 않는다.)
  const badRelated = t.related.filter((r) => !seo[r]);
  if (badRelated.length) {
    console.error(`[gen-tool-pages] ${id}: related 가 가리키는 도구 페이지 없음 — ${badRelated.join(', ')}`);
    process.exit(1);
  }
}

/* ── 유틸 ──────────────────────────────────────────── */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** head 의 한 줄짜리 meta/link 를 값만 갈아끼운다 (셸 구조 변화에 둔감하게 attr 매칭). */
function replaceMeta(html, attr, name, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${name}"\\s+content=")[^"]*(">)`);
  if (!re.test(html)) throw new Error(`셸에서 meta ${attr}="${name}" 를 못 찾음 — index.html 구조 변경 확인`);
  return html.replace(re, `$1${esc(content)}$2`);
}

function toolPageUrl(id) {
  return `${SITE}${BASE_PATH}/${id}/`;
}

/**
 * 도구별 공유 카드 (TASK-KL-089). 실물은 저장소에 커밋돼 있고 배포는 복사만 한다.
 *
 * 카드는 폰트가 있는 개발 머신에서 찍으므로, 도구를 추가하고 `npm run gen:og` 를 아직 안 돌린
 * 상태로 배포가 돌 수 있다. 그때 빌드를 세우는 대신 브랜드 공용 카드로 떨어뜨린다 —
 * 없는 그림을 가리켜 카드가 통째로 비는 것이 가장 나쁜 결말이기 때문이다.
 */
const OG_DIR = path.join(root, 'img/og');
const missingOg = [];
function ogImageUrl(id) {
  const has = fs.existsSync(path.join(OG_DIR, `${id}.jpg`));
  if (!has) missingOg.push(id);
  return `${SITE}/apps/karmolab/img/og/${has ? id : 'default'}.jpg`;
}

/** 도구 이름의 단일 정본 = 위젯 매니페스트의 title. 사이드바·페이지 제목이 갈라지지 않게 한다. */
function heading(id) {
  return widgetById[id].title;
}

/* ── 후원·제휴 자리 (TASK-KL-089) ──────────────────── */

/**
 * 도구 페이지에 자리 하나를 미리 잡아 둔다. 채울 것이 없으면 아무것도 그리지 않는다 —
 * 빈 상자나 「준비 중」 표시는 도구를 쓰러 온 사람에게 방해만 되기 때문이다.
 * 도구 본체 위에는 절대 놓지 않는다. 이 자리는 설명 블록 안, 다 쓰고 읽는 데 있다.
 */
const sponsorSlots = (() => {
  const file = path.join(root, 'data/sponsor.json');
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).slots || [];
})();

function sponsorBlock(id) {
  const slot = sponsorSlots.find((s) => {
    if (Array.isArray(s.only) && !s.only.includes(id)) return false;
    if (Array.isArray(s.except) && s.except.includes(id)) return false;
    return true;
  });
  if (!slot) return '';

  const label = esc(slot.label || '후원');
  const body = `<strong>${esc(slot.title)}</strong>${slot.body ? `<span>${esc(slot.body)}</span>` : ''}`;
  const inner = slot.url
    ? `<a class="tool-sponsor-link" href="${esc(slot.url)}" rel="sponsored noopener" target="_blank">${body}</a>`
    : `<div class="tool-sponsor-link">${body}</div>`;

  return `
        <aside class="tool-sponsor" aria-label="${label}">
          <span class="tool-sponsor-label">${label}</span>
          ${inner}
        </aside>
`;
}

/* ── 도구 상세 페이지 ──────────────────────────────── */

function seoBlock(id) {
  const t = seo[id];
  const related = t.related
    .map(
      (r) =>
        `<a href="${BASE_PATH}/${r}/">${esc(heading(r))}<span>${esc(seo[r].lead)}</span></a>`
    )
    .join('\n          ');

  return `<section class="tool-seo">
        <nav class="tool-seo-crumb" aria-label="위치">
          <a href="/karmolab/">KarmoLab</a> / <a href="${BASE_PATH}/">도구</a> / ${esc(heading(id))}
        </nav>
        <h1>${esc(heading(id))}</h1>
        <p class="tool-seo-lead">${esc(t.lead)}</p>
        <p>${esc(t.description)}</p>

        <h2>쓰는 법</h2>
        <ol>
          ${t.howto.map((s) => `<li>${esc(s)}</li>`).join('\n          ')}
        </ol>

        <h2>자주 묻는 질문</h2>
        <dl class="tool-seo-faq">
          ${t.faq.map((f) => `<dt>${esc(f.q)}</dt>\n          <dd>${esc(f.a)}</dd>`).join('\n          ')}
        </dl>

        <h2>다른 도구</h2>
        <div class="tool-seo-related">
          ${related}
        </div>
${sponsorBlock(id)}
        <p class="tool-seo-note">
          입력한 내용은 브라우저 안에서만 처리되며 어디에도 저장·전송되지 않습니다.
          <a href="${BASE_PATH}/">도구 전체 목록</a> · <a href="/karmolab/">KarmoLab</a> · <a href="https://github.com/Mascari4615" rel="me">만든 사람</a>
        </p>
      </section>`;
}

function jsonLd(id) {
  const t = seo[id];
  const blocks = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: heading(id),
      url: toolPageUrl(id),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      description: t.description,
      inLanguage: 'ko-KR',
      isPartOf: { '@type': 'WebSite', name: 'KarmoLab', url: `${SITE}/karmolab/` },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: t.faq.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KarmoLab', item: `${SITE}/karmolab/` },
        { '@type': 'ListItem', position: 2, name: '도구', item: `${SITE}${BASE_PATH}/` },
        { '@type': 'ListItem', position: 3, name: heading(id), item: toolPageUrl(id) }
      ]
    }
  ];
  return blocks
    .map((b) => `<script type="application/ld+json">${JSON.stringify(b)}</script>`)
    .join('\n    ');
}

function buildToolPage(id) {
  const t = seo[id];
  const title = `${heading(id)} | KarmoLab`;
  let html = shell;

  html = html.replace(/^---\nlayout: none\npermalink: \/karmolab\/\n---/, `---\nlayout: none\npermalink: ${BASE_PATH}/${id}/\n---`);
  if (!html.startsWith(`---\nlayout: none\npermalink: ${BASE_PATH}/${id}/`)) {
    throw new Error('셸 front matter 치환 실패 — index.html 앞머리 확인');
  }

  html = html.replace('<title>KarmoLab</title>', `<title>${esc(title)}</title>`);
  html = html.replace(
    '<link rel="canonical" href="https://blog.mascari4615.com/karmolab/">',
    `<link rel="canonical" href="${toolPageUrl(id)}">`
  );
  html = replaceMeta(html, 'name', 'description', t.description);
  html = replaceMeta(html, 'property', 'og:title', `${heading(id)} | KarmoLab`);
  html = replaceMeta(html, 'property', 'og:description', t.description);
  html = replaceMeta(html, 'property', 'og:url', toolPageUrl(id));
  html = replaceMeta(html, 'name', 'twitter:title', `${heading(id)} | KarmoLab`);
  html = replaceMeta(html, 'name', 'twitter:description', t.description);
  // 도구별 공유 카드 (TASK-KL-089, `scripts/gen-og-images.mjs` 산출물).
  // 셸의 기본값은 파비콘(.ico)이라 메신저·SNS 가 그림 없는 카드를 띄운다 — 도구마다 갈아끼운다.
  // (트위터는 twitter:image 가 없으면 og:image 를 쓰므로 큰 카드 지정만으로 충분하다.)
  html = replaceMeta(html, 'property', 'og:image', ogImageUrl(id));
  html = replaceMeta(html, 'name', 'twitter:card', 'summary_large_image');

  // 상세 페이지 표식 — 앱 히어로(제목·설명)가 아래 설명 블록과 겹쳐 두 번 읽히는 것을 막는다
  html = html.replace('<body>', '<body class="tool-detail">');
  const entry = `<script>window.KARMOLAB_ENTRY_TOOL=${JSON.stringify(id)};window.KARMOLAB_TOOL_PAGES=${JSON.stringify(ids)};</script>`;
  html = html.replace('</head>', `    ${entry}\n    ${jsonLd(id)}\n</head>`);

  const anchor = html.match(/<!-- KARMOLAB_TOOL_SEO[\s\S]*?-->/);
  if (!anchor) throw new Error('셸에 KARMOLAB_TOOL_SEO 앵커가 없음 — index.html 확인');
  html = html.replace(anchor[0], seoBlock(id));

  return html;
}

/* ── 허브 페이지 ───────────────────────────────────── */

/**
 * 도구를 묶음별로 나눈다.
 *
 * 도구가 40개를 넘으면서 한 줄로 늘어놓으면 읽히지 않는다. 앱에서 묶어 놓은 그대로
 * 소제목을 달아 나눈다 — 목록의 순서가 실제 화면의 구조와 어긋나지 않게 한다.
 * 묶음 정의는 위젯 소스에서 읽는다 (여기 손으로 적으면 갈라진다).
 */
function groupIds() {
  const bundles = [];
  const claimed = new Set();
  for (const dir of ['tools', 'ref']) {
    for (const file of fs.readdirSync(path.join(root, 'src/widgets', dir))) {
      if (!file.endsWith('.ts')) continue;
      const bundleId = file.slice(0, -3);
      const src = fs
        .readFileSync(path.join(root, 'src/widgets', dir, file), 'utf8')
        .split(String.fromCharCode(13, 10))
        .join(String.fromCharCode(10));
      const raw = src.match(/const (?:PARTS|TABS): Array<\[string, string\]> = \[([\s\S]*?)\n  \];/);
      if (!raw) continue;
      const parts = [...raw[1].matchAll(/\['([^']+)', '[^']*'\]/g)]
        .map((m) => m[1])
        .filter((x) => ids.includes(x));
      if (parts.length < 2) continue;
      const title = src.match(/\n    title: '([^']+)'/);
      bundles.push({ title: title ? title[1] : bundleId, parts, bundleId });
      parts.forEach((x) => claimed.add(x));
    }
  }
  // 묶음 자신이 페이지를 가지면 소제목이 그 링크가 된다 → 낱개 목록에서는 뺀다.
  bundles.forEach((b) => claimed.add(b.bundleId));
  const rest = ids.filter((id) => !claimed.has(id));
  bundles.sort((a, b) => b.parts.length - a.parts.length);
  if (rest.length) bundles.push({ title: '그 밖에', parts: rest, bundleId: null });
  return bundles;
}

function buildHub() {
  const card = (id) =>
    `        <a class="tool-hub-card" href="${BASE_PATH}/${id}/"><strong>${esc(heading(id))}</strong><span>${esc(seo[id].lead)}</span></a>`;
  const cards = groupIds()
    .map((g) => {
      const head =
        g.bundleId && ids.includes(g.bundleId)
          ? `      <h2 class="tool-hub-group"><a href="${BASE_PATH}/${g.bundleId}/">${esc(g.title)}</a></h2>`
          : `      <h2 class="tool-hub-group">${esc(g.title)}</h2>`;
      const grid = g.parts.map(card).join(String.fromCharCode(10));
      return [head, '      <div class="tool-hub-grid">', grid, '      </div>'].join(String.fromCharCode(10));
    })
    .join(String.fromCharCode(10));

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'KarmoLab 도구',
    url: `${SITE}${BASE_PATH}/`,
    inLanguage: 'ko-KR',
    hasPart: ids.map((id) => ({
      '@type': 'SoftwareApplication',
      name: heading(id),
      url: toolPageUrl(id),
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web'
    }))
  };

  return `---
layout: none
permalink: ${BASE_PATH}/
---
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>도구 | KarmoLab</title>
    <meta name="description" content="KarmoLab 의 도구 목록입니다. 각 도구는 독립된 페이지에서 바로 쓸 수 있고, 입력한 내용은 브라우저를 벗어나지 않습니다.">
    <link rel="canonical" href="${SITE}${BASE_PATH}/">
    <meta property="og:type" content="website">
    <meta property="og:title" content="도구 | KarmoLab">
    <meta property="og:description" content="삶을 섞고 술을 바꿀 시간. 손에 잡히는 도구들이 있는 작업실.">
    <meta property="og:url" content="${SITE}${BASE_PATH}/">
    <meta property="og:image" content="${SITE}/apps/karmolab/img/og/default.jpg">
    <meta property="og:locale" content="ko_KR">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" href="/apps/karmolab/img/favicon.ico">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/apps/karmolab/css/toolbox.css">
    <link rel="stylesheet" href="/apps/karmolab/css/tools.css">
    <script>document.documentElement.setAttribute('data-theme', localStorage.getItem('toolbox_theme') || 'dark');</script>
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
    <section class="tool-seo" style="max-width:960px;">
      <nav class="tool-seo-crumb" aria-label="위치"><a href="/karmolab/">KarmoLab</a> / 도구</nav>
      <h1>도구</h1>
      <p class="tool-seo-lead">삶을 섞고 술을 바꿀 시간.</p>
${cards}
      <p class="tool-seo-note">
        각 도구의 계산은 브라우저 안에서만 이뤄지며 입력한 내용은 저장·전송되지 않습니다.
        <a href="/karmolab/">KarmoLab 전체 보기</a> · <a href="https://github.com/Mascari4615" rel="me">만든 사람</a>
      </p>
    </section>
</body>
</html>
`;
}

/* ── 출력 ──────────────────────────────────────────── */

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const id of ids) {
  const dir = path.join(outDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildToolPage(id), 'utf8');
}
fs.writeFileSync(path.join(outDir, 'index.html'), buildHub(), 'utf8');

/* Service Worker 를 `/karmolab/sw.js` 로 서비스한다 (TASK-KL-088).
 * SW 의 제어 범위는 자기 URL 경로로 정해진다 — `/apps/karmolab/sw.js` 에 두면 정작 앱이 사는
 * `/karmolab/` 페이지를 제어하지 못한다. Jekyll front matter 로 위치만 옮긴다. */
const swBuilt = path.join(root, 'sw.js');
if (fs.existsSync(swBuilt)) {
  const parent = path.dirname(outDir);
  fs.mkdirSync(parent, { recursive: true });
  fs.writeFileSync(
    path.join(parent, 'sw.js'),
    `---\nlayout: none\npermalink: /karmolab/sw.js\n---\n${fs.readFileSync(swBuilt, 'utf8')}`,
    'utf8'
  );
} else {
  console.error('[gen-tool-pages] sw.js 없음 — `npm run build` 를 먼저 돌려야 합니다.');
  process.exit(1);
}

if (missingOg.length) {
  const uniq = [...new Set(missingOg)];
  console.warn(
    `[gen-tool-pages] 공유 카드 없는 도구 ${uniq.length}개 — 브랜드 기본 카드로 나갑니다: ${uniq.join(', ')}\n` +
      '  → 개발 머신에서 `npm run gen:og` 후 img/og/ 를 커밋하면 도구별 카드가 붙습니다.'
  );
}

console.log(`[gen-tool-pages] ${ids.length}개 도구 페이지 + 허브 + sw.js 생성 → ${path.relative(process.cwd(), outDir)}`);
