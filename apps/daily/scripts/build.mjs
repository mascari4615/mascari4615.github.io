/**
 * 정적 페이지 생성 (TASK-KAR-202) — 번들러 없음, 의존성 없음.
 * data/*.json 을 훑어 주제마다 페이지 하나 + 허브 하나를 만든다.
 * **주제를 늘릴 때 이 파일은 안 고친다** — 표를 넣으면 페이지가 생긴다.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const dist = join(app, 'dist');
const SITE = 'https://mascari4615.github.io';
const BASE = '/daily';

// 캐시가 옛 파일을 붙들지 못하게 주소에 도장을 찍는다 (블로그 루트 서비스워커가 cache-first 다).
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const topics = readdirSync(join(app, 'data'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(app, 'data', f), 'utf8')))
  .sort((a, b) => a.title.localeCompare(b.title, 'ko'));

if (!topics.length) throw new Error('data/ 에 주제 표가 하나도 없다');

function head({ title, desc, url, extra = '' }) {
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
<link rel="stylesheet" href="${extra}style.css?v=${stamp}">
</head>
<body>`;
}

const foot = (hub = false) => `<div class="foot">하루에 하나. 자정(KST)에 새 문제.<br>
${hub ? '' : `<a href="${BASE}/">다른 주제</a> · `}<a href="/karmolab/">KarmoLab</a></div>`;

// ── 주제별 페이지 ──
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'data'), { recursive: true });

for (const topic of topics) {
  const url = `${SITE}${BASE}/${topic.id}/`;
  const desc = `${topic.title} ${topic.items.length}개 중 오늘의 하나를 ${topic.maxGuesses ?? 8}번 안에 맞혀 보세요. 매일 새 문제.`;
  const html = `${head({ title: `오늘의 ${topic.title} 맞히기`, desc, url, extra: '../' })}
<div class="wrap" id="app" data-topic="${esc(topic.id)}" data-stamp="${stamp}">
  <div class="top">
    <h1>${esc(topic.emoji ?? '')} 오늘의 ${esc(topic.title)}</h1>
    <div><span class="no"></span> <a class="home" href="${BASE}/">주제</a></div>
  </div>
  <p class="lede">${esc(topic.subtitle ?? '')} 속성이 맞으면 초록, 비슷하면 노랑. 숫자는 ▲▼ 로 방향을 알려준다.</p>
  <div class="guessbar">
    <input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(topic.title)} 이름" placeholder="${esc(topic.title)} 이름 입력…">
    <div class="sug" role="listbox"></div>
  </div>
  <p class="left"></p>
  <div class="rows"></div>
  <div class="done" hidden></div>
  ${foot()}
</div>
<script type="module" src="../app.mjs?v=${stamp}"></script>
</body></html>
`;
  mkdirSync(join(dist, topic.id), { recursive: true });
  writeFileSync(join(dist, topic.id, 'index.html'), html);
  writeFileSync(join(dist, 'data', `${topic.id}.json`), JSON.stringify(topic));
}

// ── 허브 ──
const hub = `${head({
  title: '오늘의 하나 맞히기',
  desc: `매일 새 문제. ${topics.map((t) => t.title).join(' · ')} — 속성 힌트로 좁혀 맞히고 결과를 자랑하세요.`,
  url: `${SITE}${BASE}/`,
})}
<div class="wrap">
  <div class="top"><h1>오늘의 하나 맞히기</h1><a class="home" href="/karmolab/">KarmoLab</a></div>
  <p class="lede">주제를 고르면 오늘의 문제가 하나. 속성 힌트로 좁혀 나간다. 매일 자정(KST)에 바뀐다.</p>
  <div class="cards">
${topics
  .map(
    (t) => `    <a class="card" href="${BASE}/${t.id}/">
      <div class="em">${esc(t.emoji ?? '🎯')}</div>
      <h2>오늘의 ${esc(t.title)}</h2>
      <p>${esc(t.subtitle ?? '')}</p>
      <div class="cnt">${t.items.length.toLocaleString('ko-KR')}개 중 하나 · ${t.maxGuesses ?? 8}번 안에</div>
    </a>`,
  )
  .join('\n')}
  </div>
  ${foot(true)}
</div>
</body></html>
`;
writeFileSync(join(dist, 'index.html'), hub);

for (const f of ['engine.mjs', 'app.mjs', 'style.css']) copyFileSync(join(app, f), join(dist, f));

console.log(`dist/ 생성 — 주제 ${topics.length}개 (${topics.map((t) => t.id).join(', ')}), 도장 ${stamp}`);
