/**
 * 놀이마다 한 장씩. 검색으로 들어오는 문 (TASK-KL-151 ⑪)
 *
 * 왜 있나: 놀이는 전부 앱 안 해시 주소(`/#worldcup`)로만 살았다. 크롤러는 해시를
 * 안 보므로 **검색에 걸릴 글이 한 줄도 없었고**, 링크를 붙여도 미리보기가 안 떴다.
 * 관문(`/play/`)이 있긴 하지만 사람은 놀이터로 검색하지 않는다 . 
 * 이상형 월드컵, 반응속도 테스트로 검색한다.
 *
 * 왜 도구 상세 페이지 틀을 안 쓰나: 한 번 그렇게 했다가 쓰는 법, 자주 묻는 것 틀이 딸려 와
 * 놀이가 글에 파묻혔다(higher.ts 주석). 여기는 **짧은 소개 + 바로 시작**만 있는 제 틀이다.
 *
 * 무엇이 정본인가: 어떤 놀이가 있나 = `apps/play/games.json`. 그 놀이를 뭐라고 설명하나 =
 * `data/play-seo.json`. 둘이 갈리면 여기서 멈춘다(한쪽에만 있는 id 는 실패로 본다).
 *
 * 사용: node scripts/gen-play-pages.mjs [--out ../blog]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadShell, shellCommon, replaceMeta, asStaticPage } from './lib/shell-page.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(root));
const SITE = 'https://blog.mascari4615.com';
const outArg = process.argv.indexOf('--out');
const OUT = path.resolve(root, outArg >= 0 ? process.argv[outArg + 1] : '../blog');

const roster = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/play/games.json'), 'utf8')).games;
const copy = JSON.parse(fs.readFileSync(path.join(root, 'data/play-seo.json'), 'utf8')).games;

const problems = [];
for (const g of roster) if (!copy[g.id]) problems.push(`${g.id}: 놀이 목록엔 있는데 소개 글이 없다 (data/play-seo.json)`);
for (const id of Object.keys(copy)) if (!roster.some((g) => g.id === id)) problems.push(`${id}: 소개 글은 있는데 놀이 목록에 없다`);
if (problems.length) {
  console.error('[gen-play-pages] 목록과 소개가 어긋났다');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shell = loadShell(root);

/**
 * 한 장의 본문.
 *
 * 첫 화면에 **시작 단추**가 있어야 한다. 검색으로 온 사람은 설명을 읽으러 온 게 아니다.
 * 글은 그 아래에 둔다(크롤러는 순서를 안 따진다).
 */
function body(game, text) {
  const others = roster
    .filter((g) => g.id !== game.id)
    .slice(0, 6)
    .map((g) => `<a class="play-card" href="/play/${g.id}/"><span class="play-emoji">${esc(g.emoji)}</span><strong>${esc(g.title)}</strong><span>${esc(g.lead)}</span></a>`)
    .join('\n');

  return `
<article class="play-page">
  <nav class="tool-crumb" aria-label="위치"><a href="/">KarmoLab</a><i aria-hidden="true">›</i><a href="/play/">놀이터</a><i aria-hidden="true">›</i><span aria-current="page">${esc(game.title)}</span></nav>

  <header class="play-head">
    <span class="play-head-emoji">${esc(game.emoji)}</span>
    <h1>${esc(text.title)}</h1>
    <p class="play-head-lead">${esc(game.lead)}</p>
    <p><a class="btn btn-primary play-go" href="${esc(game.url)}">${esc(game.title)} 시작하기</a></p>
  </header>

  <p class="play-desc">${esc(text.description)}</p>

  <section class="play-block">
    <h2>어떻게 하나요</h2>
    <ol>${text.howto.map((h) => `<li>${esc(h)}</li>`).join('')}</ol>
  </section>

  ${
    text.points && text.points.length
      ? `<section class="play-block"><h2>이 놀이의 규칙</h2><ul>${text.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></section>`
      : ''
  }

  <section class="play-block">
    <h2>다른 놀이</h2>
    <div class="play-grid">${others}</div>
  </section>
</article>`;
}

/** 이 페이지들만 쓰는 결. 셸 색을 그대로 쓰고 새 색 이름을 만들지 않는다. */
const STYLE = `<style>
  .play-page { max-width: 760px; margin: 0 auto; }
  .play-head { text-align: center; padding: 8px 0 4px; }
  .play-head-emoji { font-size: 44px; display: block; }
  .play-head h1 { margin: 6px 0 4px; font-size: var(--font-size-xl); }
  .play-head-lead { margin: 0 0 14px; color: var(--text-secondary); }
  .play-go { text-decoration: none; }
  .play-desc { color: var(--text-secondary); line-height: 1.75; }
  .play-block { margin-top: 26px; }
  .play-block h2 { font-size: var(--font-size-md); margin: 0 0 8px; }
  .play-block ol, .play-block ul { margin: 0; padding-left: 20px; line-height: 1.9; color: var(--text-secondary); }
  .play-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .play-card { display: block; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-lg);
    text-decoration: none; color: inherit; background: var(--bg-secondary); }
  .play-card:hover { border-color: var(--accent); }
  .play-card .play-emoji { font-size: 22px; display: block; }
  .play-card strong { display: block; margin: 4px 0 2px; }
  .play-card span:last-child { font-size: var(--font-size-xs); color: var(--text-tertiary); }
</style>`;

/**
 * 놀이 한 장의 구조화 데이터 (2026-08-29)
 *   - 왜: 도구 장에는 있는데 놀이 장에는 하나도 없었음. 검색 결과에서 그냥 파란 줄 하나
 *   - 지어내지 않음. 이름, 설명, 주소, 무료, 웹, 한국어, 어느 사이트 것인지만
 *   - 별점, 평가 수 같은 없는 값은 안 적음. 없는 것을 적으면 통째로 무시당함
 */
function jsonLdBlock(game, text, permalink) {
  const card = `img/og/${game.id}.jpg`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: text.title,
    url: `${SITE}${permalink}`,
    description: text.description,
    applicationCategory: 'GameApplication',
    gamePlatform: 'Web',
    operatingSystem: 'Web',
    inLanguage: 'ko-KR',
    isPartOf: { '@type': 'WebSite', name: 'KarmoLab', url: `${SITE}/` },
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    ...(fs.existsSync(path.join(root, card)) ? { image: `${SITE}/apps/karmolab/${card}` } : {}),
  };
  /* 빵부스러기. 본문의 tool-crumb 와 같은 셋. 도구 장에는 있었고 놀이 장에는 없었다 (2026-09-05) */
  const crumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'KarmoLab', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: '놀이터', item: `${SITE}/play/` },
      { '@type': 'ListItem', position: 3, name: game.title, item: `${SITE}${permalink}` }
    ]
  };
  return `
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<script type="application/ld+json">${JSON.stringify(crumb)}</script>`;
}

/* 오락실로 옮겨 간 놀이의 옛 주소. 색인이 붙어 있던 장이라 빈 404 대신 새 주소로 넘김
   (change.arcade-absorbs-play). noindex 라 사이트맵에서 빠지고, canonical 은 새 장.
   한 달 뒤 삭제 판정 */
const MOVED = { worldcup: '/t/arcade/worldcup/' };
for (const [id, to] of Object.entries(MOVED)) {
  const url = `${SITE}${to}`;
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>${esc(id)} moved</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${to}">
</head><body><p>이 놀이는 오락실로 옮겨 갔습니다. <a href="${to}">${url}</a></p></body></html>
`;
  const dir = path.join(OUT, 'play', id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
}

let made = 0;
for (const game of roster) {
  const text = copy[game.id];
  const permalink = `/play/${game.id}/`;
  let html = shellCommon(shell, { permalink, lastModified: new Date().toISOString(), bootPaths: [] });
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(text.title)} | KarmoLab</title>`);
  html = replaceMeta(html, 'name', 'description', text.description);
  html = replaceMeta(html, 'property', 'og:title', text.title);
  html = replaceMeta(html, 'property', 'og:description', text.description);
  html = replaceMeta(html, 'property', 'og:url', `${SITE}${permalink}`);
  /* 놀이마다 찍어 둔 공유 카드를 쓴다 (2026-08-29). 카드가 있는데도 default.jpg 가 나가고 있었음 */
  const card = `img/og/${game.id}.jpg`;
  if (fs.existsSync(path.join(root, card))) {
    html = replaceMeta(html, 'property', 'og:image', `${SITE}/apps/karmolab/${card}`);
  }
  /* 대표 주소를 제 주소로 (2026-08-29). 셸에서 온 뿌리 canonical 을 안 갈면 이 장은
     뿌리의 사본 취급이라 색인에서 통째로 빠진다. `/play/worldcup/` 이 그렇게 빠져 있었고
     그 검색어 수요가 3개월 93.1K 다 */
  html = html.replace(
    `<link rel="canonical" href="${SITE}/">`,
    `<link rel="canonical" href="${SITE}${permalink}">`
  );
  html = asStaticPage(html, { kind: 'play', bodyHtml: body(game, text), head: STYLE + jsonLdBlock(game, text, permalink) });

  const dir = path.join(OUT, 'play', game.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
  made += 1;
}

console.log(`[gen-play-pages] 놀이 소개 ${made}장 (${roster.map((g) => g.id).join(', ')})`);
