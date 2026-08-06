/**
 * 정적 페이지 생성 (TASK-KAR-202) — 번들러 없음, 의존성 없음.
 * data/*.json 을 훑어 **주제 × 모드**마다 페이지 하나 + 허브 하나를 만든다.
 * **주제를 늘릴 때 이 파일은 안 고친다** — 표를 넣으면 페이지가 생긴다.
 *
 * 모드는 데이터가 아니라 *행동*이라 여기 산다. 그림이 다 있는 주제엔 실루엣판이 자동으로 붙는다.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const dist = join(app, 'dist');
// 정본 주소는 커스텀 도메인이다 — github.io 는 여기로 301 한다. 검색 주소가 갈리면 유입이 쪼개진다.
const SITE = 'https://blog.mascari4615.com';
const BASE = '/daily';

// 캐시가 옛 파일을 붙들지 못하게 주소에 도장을 찍는다 (블로그 루트 서비스워커가 cache-first 다).
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const topics = readdirSync(join(app, 'data'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(app, 'data', f), 'utf8')))
  .sort((a, b) => a.title.localeCompare(b.title, 'ko'));

if (!topics.length) throw new Error('data/ 에 주제 표가 하나도 없다');

/** 한 주제가 낼 수 있는 판들. 실루엣은 그림이 있어야 성립한다. */
function pagesOf(topic) {
  const list = [
    {
      mode: 'classic',
      path: topic.id,
      depth: 1,
      label: `오늘의 ${topic.title}`,
      short: '속성',
      lede: `${topic.subtitle ?? ''} 속성이 맞으면 초록, 비슷하면 노랑. 숫자는 ▲▼ 로 방향을 알려준다.`,
      desc: `${topic.title} ${topic.items.length}개 중 오늘의 하나를 ${topic.maxGuesses ?? 8}번 안에 맞혀 보세요. 매일 새 문제.`,
    },
  ];
  if (topic.items.every((i) => i.img)) {
    list.push({
      mode: 'silhouette',
      path: `${topic.id}/silhouette`,
      depth: 2,
      label: `${topic.title} 실루엣`,
      short: '실루엣',
      lede: '까맣게 칠한 그림 하나. 틀릴 때마다 조금씩 밝아진다.',
      desc: `까맣게 칠한 ${topic.title} 그림을 6번 안에 맞혀 보세요. 틀릴수록 밝아집니다. 매일 새 문제.`,
    });
  }
  return list;
}

const all = topics.flatMap((topic) => pagesOf(topic).map((page) => ({ topic, ...page })));

function head({ title, desc, url, up }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta name="twitter:card" content="summary">
<link rel="stylesheet" href="${up}style.css?v=${stamp}">
</head>
<body>`;
}

const foot = (hub = false, past = null) => `<div class="foot">하루에 하나. 자정(KST)에 새 문제.<br>
${past ? `<a href="${BASE}/${past}/past/">지난 문제</a> · ` : ''}${hub ? '' : `<a href="${BASE}/">다른 판 보기</a> · `}<a href="/karmolab/">KarmoLab</a></div>`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'data'), { recursive: true });

for (const page of all) {
  const { topic } = page;
  const up = '../'.repeat(page.depth);
  const url = `${SITE}${BASE}/${page.path}/`;

  // 끝낸 사람을 그냥 보내지 않는다 — 오늘 아직 안 푼 판을 건넨다.
  // 같은 계열 게임끼리 서로 보내는 것이 이런 물건의 가장 큰 유입 경로다.
  const others = all
    .filter((o) => o.path !== page.path)
    .map((o) => ({ href: `${BASE}/${o.path}/`, label: o.label, emoji: o.topic.emoji, topic: o.topic.id, mode: o.mode }));

  const tabs = pagesOf(topic)
    .map((m) =>
      m.mode === page.mode
        ? `<span class="tab on">${esc(m.short)}</span>`
        : `<a class="tab" href="${BASE}/${m.path}/">${esc(m.short)}</a>`,
    )
    .join('');

  const shot = page.mode === 'silhouette' ? '<div class="shot"><img alt="오늘의 실루엣"></div>' : '';

  const html = `${head({ title: `${page.label} 맞히기`, desc: page.desc, url, up })}
<div class="wrap" id="app" data-topic="${esc(topic.id)}" data-mode="${page.mode}" data-stamp="${stamp}"
     data-data="${up}data/${esc(topic.id)}.json" data-others="${esc(JSON.stringify(others))}">
  <div class="top">
    <h1>${esc(topic.emoji ?? '')} ${esc(page.label)}</h1>
    <div><span class="no"></span> <a class="home" href="${BASE}/">전체</a></div>
  </div>
  <div class="tabs">${tabs}<span class="streak"></span></div>
  <p class="lede">${esc(page.lede)}</p>
  ${shot}
  <div class="guessbar">
    <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(topic.title)} 이름" placeholder="${esc(topic.title)} 이름 입력…">
    <div class="sug" role="listbox"></div>
  </div>
  <p class="left"></p>
  <div class="rows"></div>
  <div class="done" hidden></div>
  ${foot(false, topic.id)}
</div>
<script type="module" src="${up}app.mjs?v=${stamp}"></script>
</body></html>
`;
  mkdirSync(join(dist, page.path), { recursive: true });
  writeFileSync(join(dist, page.path, 'index.html'), html);
}

for (const topic of topics) writeFileSync(join(dist, 'data', `${topic.id}.json`), JSON.stringify(topic));

// ── 지난 문제 ──
// 정답이 결정론적이라 페이지는 하나면 된다 — 목록은 브라우저가 그날그날 다시 센다.
// (배포 때 굳혀 두면 다음 배포까지 멈춘 목록이 남는다.)
for (const topic of topics) {
  const url = `${SITE}${BASE}/${topic.id}/past/`;
  const html = `${head({
    title: `${topic.title} 지난 문제 정답 모아보기`,
    desc: `오늘의 ${topic.title} 맞히기의 지난 30일 정답. 오늘 답은 들어 있지 않습니다.`,
    url,
    up: '../../',
  })}
<div class="wrap" id="past" data-topic="${esc(topic.id)}" data-stamp="${stamp}" data-data="../../data/${esc(topic.id)}.json">
  <div class="top">
    <h1>${esc(topic.emoji ?? '')} ${esc(topic.title)} 지난 문제</h1>
    <a class="home" href="${BASE}/${esc(topic.id)}/">오늘 풀기</a>
  </div>
  <p class="lede past-note"></p>
  <table class="past"><tbody></tbody></table>
  ${foot()}
</div>
<script type="module" src="../../past.mjs?v=${stamp}"></script>
</body></html>
`;
  mkdirSync(join(dist, topic.id, 'past'), { recursive: true });
  writeFileSync(join(dist, topic.id, 'past', 'index.html'), html);
}

// ── 허브 ──
const hub = `${head({
  title: '오늘의 하나 맞히기',
  desc: `매일 새 문제 ${all.length}판. ${topics.map((t) => t.title).join(' · ')} — 속성 힌트와 실루엣으로 맞히고 결과를 자랑하세요.`,
  url: `${SITE}${BASE}/`,
  up: '',
})}
<div class="wrap">
  <div class="top"><h1>오늘의 하나 맞히기</h1><a class="home" href="/karmolab/">KarmoLab</a></div>
  <p class="lede">판을 고르면 오늘의 문제가 하나. 매일 자정(KST)에 바뀐다.</p>
  <div class="cards">
${all
  .map(
    (p) => `    <a class="card" href="${BASE}/${p.path}/">
      <div class="em">${esc(p.topic.emoji ?? '🎯')}</div>
      <h2>${esc(p.label)}</h2>
      <p>${esc(p.mode === 'silhouette' ? '그림만 보고 맞히기' : p.topic.subtitle ?? '')}</p>
      <div class="cnt">${p.topic.items.length.toLocaleString('ko-KR')}개 중 하나</div>
    </a>`,
  )
  .join('\n')}
  </div>
  ${foot(true)}
</div>
</body></html>
`;
writeFileSync(join(dist, 'index.html'), hub);

// 검색 로봇이 판마다 따로 찾아오게 — 주소가 늘면 유입 경로도 늘어난다.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[`${SITE}${BASE}/`, ...all.map((p) => `${SITE}${BASE}/${p.path}/`), ...topics.map((t) => `${SITE}${BASE}/${t.id}/past/`)]
  .map((u) => `  <url><loc>${u}</loc><changefreq>daily</changefreq></url>`)
  .join('\n')}
</urlset>
`;
writeFileSync(join(dist, 'sitemap.xml'), sitemap);

for (const f of ['engine.mjs', 'app.mjs', 'past.mjs', 'style.css']) copyFileSync(join(app, f), join(dist, f));

console.log(`dist/ 생성 — 판 ${all.length}개 (${all.map((p) => p.path).join(', ')}), 도장 ${stamp}`);
