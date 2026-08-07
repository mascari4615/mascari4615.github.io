/**
 * 정적 페이지 생성 (TASK-KAR-202) — 번들러 없음, 의존성 없음.
 * data/*.json 을 훑어 **주제 × 모드**마다 페이지 하나 + 허브 하나를 만든다.
 * **주제를 늘릴 때 이 파일은 안 고친다** — 표를 넣으면 페이지가 생긴다.
 *
 * 모드는 데이터가 아니라 *행동*이라 여기 산다. 그림이 다 있는 주제엔 실루엣판이 자동으로 붙는다.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kstDayNumber, EPOCH_DAY_NUMBER } from '../engine.mjs';
import { modesOf, pastRow } from '../past-row.mjs';
import { assertDenied } from './lib-pwa-deny.mjs';

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

/**
 * 표 검사 — 여기서 막지 않으면 화면에서 이상하게 드러난다.
 * 실제로 두 번 당했다: 롤은 이벤트 스킨판이 같은 이름으로 또 들어왔고,
 * 원신은 여행자가 원소·성별별로 12개였다. 이름이 겹치면 정답이 여럿이라 놀이가 성립하지 않는다.
 */
for (const topic of topics) {
  const die = (why) => {
    throw new Error(`표 「${topic.id}」 ${why}`);
  };
  if (!topic.id || !topic.title) die('에 id 나 title 이 없다');
  if (!topic.fields?.length) die('에 속성이 하나도 없다');
  for (const f of topic.fields) {
    if (!['number', 'set', 'category'].includes(f.kind)) die(`의 속성 ${f.key} 종류가 이상하다: ${f.kind}`);
  }
  if (!topic.items?.length) die('에 항목이 없다');

  /**
   * 표는 조용히 낡는다. 새 챔피언·새 포켓몬이 나와도 우리 표는 그대로라, 그 이름은
   * 자동완성에도 없고 정답으로도 안 나온다 — 사람은 「낡은 사이트」로 읽고 떠나는데
   * 우리는 아무 신호도 못 받는다. 그래서 날짜를 박고, 너무 오래되면 빌드를 세운다.
   * 푸는 법은 `node scripts/fetch-<주제>.mjs` 한 줄이다.
   */
  const STALE_DAYS = 180;
  if (!topic.fetchedAt) die('에 표 만든 날짜(fetchedAt)가 없다');
  const age = Math.floor((Date.now() - Date.parse(`${topic.fetchedAt}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(age)) die(`의 표 만든 날짜가 이상하다: ${topic.fetchedAt}`);
  if (age > STALE_DAYS) die(`표가 ${age}일 됐다 (${topic.fetchedAt}) — scripts/fetch-${topic.id}.mjs 로 새로 받아라`);
  if (age > STALE_DAYS - 30) console.warn(`[daily] 표 「${topic.id}」 가 ${age}일 됐다 — 곧 새로 받아야 한다`);

  const seen = new Set();
  for (const item of topic.items) {
    if (!item.name) die('에 이름 없는 항목이 있다');
    const key = item.name.trim().toLowerCase();
    if (seen.has(key)) die(`에 같은 이름이 두 번 있다: ${item.name} (정답이 여럿이 된다)`);
    seen.add(key);
    for (const f of topic.fields) {
      if (item[f.key] === undefined || item[f.key] === null) die(`의 ${item.name} 에 ${f.label}(${f.key}) 이 비어 있다`);
      // 0 은 「없음」의 다른 이름인 경우가 많다 — 롤 신규 챔피언 여섯이 난이도 0 으로 와서
      // 「난이도 0」 이라는 거짓 힌트가 떴다. 숫자 속성이 0 이면 원본이 안 채운 것으로 본다.
      if (f.kind === 'number' && item[f.key] === 0) {
        die(`의 ${item.name} 에 ${f.label} 이 0 이다 — 원본이 안 채운 값일 가능성이 크다 (힌트가 거짓말을 한다)`);
      }
    }
  }
}

/**
 * 블로그 쪽에서 같은 주소를 쓰는 페이지가 있으면 **우리 페이지가 통째로 덮인다.**
 *
 * 실제로 당했다 (2026-08-07): 사이드바 입구를 `_tabs/daily.md` 로 만들었더니 Jekyll 이
 * 그걸 `/daily/` 로 내보냈고, 게임 허브가 사라지고 그 자리에 자기 자신으로 넘기는
 * 무한 새로고침 페이지가 앉았다. 페이지는 멀쩡히 200 이라 주소만 찔러서는 절대 안 잡힌다.
 *
 * 그래서 만들기 전에 본다. 남의 파일은 안 고치고, 겹친다는 사실만 말한다.
 */
function checkBlogCollision() {
  const tabs = join(app, '../blog/_tabs');
  if (!existsSync(tabs)) return;
  const mine = new Set(['daily', ...topics.map((t) => t.id)]);
  for (const file of readdirSync(tabs).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(tabs, file), 'utf8');
    const explicit = text.match(/^permalink:\s*(\S+)/m)?.[1];
    // permalink 가 없으면 Jekyll 이 파일 이름을 주소로 쓴다 — 그게 이 사고의 원인이었다.
    const path = (explicit ?? `/${file.replace(/\.md$/, '')}/`).replace(/^\/|\/$/g, '');
    if (mine.has(path)) {
      throw new Error(
        `블로그 탭 「${file}」 이 우리 주소 /${path}/ 를 가져간다 — 그 페이지가 통째로 덮인다. ` +
          `그 파일 앞머리에 permalink 를 따로 박아라 (예: /${path}-go/).`,
      );
    }
  }
}
checkBlogCollision();

/**
 * 블로그 루트의 서비스워커는 **cache-first** 다 — 한 번 담아 둔 주소는 새로 안 받아 온다.
 * 우리 페이지가 거기 걸리면 **어제 문제가 계속 나온다.** 매일 바뀌는 물건에서 이건 치명적이고,
 * 화면은 멀쩡해 보이므로 아무도 못 알아챈다 (KarmoLab 이 실제로 이걸로 배포가 고착됐었다).
 *
 * 지금은 제대로 빠져 있다. 빠져 있는 지금 잠근다 — 나중에 누가 지우면 여기서 막힌다.
 */
function checkPwaCache() {
  const conf = join(app, '../blog/_config.yml');
  if (!existsSync(conf)) return;
  assertDenied(readFileSync(conf, 'utf8'), BASE);
}
checkPwaCache();

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
      desc: `${topic.title} ${topic.items.length}개 중 오늘의 하나. 보통 서너 번이면 맞히고 1분이면 끝납니다. 매일 새 문제, 로그인 없음.`,
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
      desc: `까맣게 칠한 ${topic.title} 그림 하나. 틀릴수록 밝아집니다. 1분이면 끝나고 매일 새 문제, 로그인 없음.`,
    });
  }
  return list;
}

const all = topics.flatMap((topic) => pagesOf(topic).map((page) => ({ topic, ...page })));

/**
 * 검색 로봇에게 「이건 무료로 바로 하는 웹 게임」이라고 말해 준다.
 * 없으면 그냥 글 한 장으로 읽힌다 — 유입이 목적인 물건에서 그건 손해다.
 * 사실이 아닌 것은 안 적는다(별점·후기 같은 것). 적는 건 이름·설명·주소·언어·무료뿐이다.
 */
function gameLd({ name, desc, url }) {
  return `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    applicationCategory: 'GameApplication',
    name,
    description: desc,
    url,
    inLanguage: 'ko',
    isAccessibleForFree: true,
    operatingSystem: 'Any',
    browserRequirements: 'JavaScript',
  }).replace(/</g, '\\u003c')}</script>`;
}

function head({ title, desc, url, up, image, ld = '' }) {
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
<meta name="twitter:card" content="summary_large_image">
<meta property="og:image" content="${SITE}${BASE}/img/og/${image ?? 'hub'}.png?v=${stamp}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<link rel="stylesheet" href="${up}style.css?v=${stamp}">
${ld}
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

  const html = `${head({
    title: `${page.label} 맞히기`,
    desc: page.desc,
    url,
    up,
    image: page.path.replace('/', '-'),
    ld: gameLd({ name: `${page.label} 맞히기`, desc: page.desc, url }),
  })}
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
    <input type="text" role="combobox" aria-expanded="false" aria-controls="sug-list" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${esc(topic.title)} 이름" placeholder="${esc(topic.title)} 이름 · 첫 자음만 쳐도 돼요">
    <div class="sug" id="sug-list" role="listbox" aria-label="추천 이름"></div>
  </div>
  <div class="seeds"></div>
  <p class="left"></p>
  <div class="rows" aria-live="polite" aria-label="추측 기록"></div>
  <div class="done" role="status" hidden></div>
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
// 답을 **HTML 에 미리 박는다.** 여태 브라우저가 다 그렸는데, 검색 로봇은 자바스크립트를
// 안 돌려 주는 쪽이 많다 — 로봇 눈엔 답이 하나도 없는 빈 표였다. 이 페이지의 값은 거기 있다.
// 오늘 것은 절대 안 박는다. 배포 뒤로 지나간 날은 브라우저가 위에 얹는다(past.mjs).
const PAST_BAKED = 30;
for (const topic of topics) {
  const url = `${SITE}${BASE}/${topic.id}/past/`;
  // 어제까지만. 오늘 답이 HTML 에 들어가는 순간 게임이 끝장난다.
  const newest = kstDayNumber() - 1;
  const modes = modesOf(topic);
  const rows = [];
  for (let d = newest; d >= Math.max(EPOCH_DAY_NUMBER, newest - PAST_BAKED + 1); d -= 1) {
    rows.push(pastRow(topic, d, modes));
  }
  const html = `${head({
    title: `${topic.title} 지난 문제 정답 모아보기`,
    desc: `오늘의 ${topic.title} 맞히기의 지난 30일 정답. 오늘 답은 들어 있지 않습니다.`,
    url,
    up: '../../',
    image: topic.id,
  })}
<div class="wrap" id="past" data-topic="${esc(topic.id)}" data-stamp="${stamp}" data-data="../../data/${esc(topic.id)}.json">
  <div class="top">
    <h1>${esc(topic.emoji ?? '')} ${esc(topic.title)} 지난 문제</h1>
    <a class="home" href="${BASE}/${esc(topic.id)}/">오늘 풀기</a>
  </div>
  <p class="lede past-note"></p>
  <div class="past-reveal"><button type="button" aria-pressed="false">답 모두 보기</button></div>
  <div class="past-scroll"><table class="past hide"><tbody>${rows.join('')}</tbody></table></div>
  <div class="past-more"></div>
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
  desc: `매일 새 문제 ${all.length}판. ${topics.map((t) => t.title).join(' · ')} — 한 판 1분, 로그인 없이 바로. 결과는 정답이 안 새는 이모지 격자로 자랑.`,
  url: `${SITE}${BASE}/`,
  up: '',
  image: 'hub',
  ld: gameLd({
    name: '오늘의 하나 맞히기',
    desc: `매일 새 문제 ${all.length}판. ${topics.map((t) => t.title).join(' · ')}`,
    url: `${SITE}${BASE}/`,
  }),
})}
<div class="wrap">
  <div class="top"><h1>오늘의 하나 맞히기</h1><a class="home" href="/karmolab/">KarmoLab</a></div>
  <p class="lede">판을 고르면 오늘의 문제가 하나. <b>보통 서너 번이면 맞고 1분이면 끝난다.</b> 매일 자정(KST)에 바뀐다.</p>
  <div class="hub-jump"></div>
  <p class="hub-note"></p>
${topics
  .map(
    (t) => `  <section class="group">
    <h2 class="group-t">${esc(t.emoji ?? '🎯')} ${esc(t.title)} <span>${t.items.length.toLocaleString('ko-KR')}개 중 하나 · <a href="${BASE}/${t.id}/past/" aria-label="${esc(t.title)} 지난 문제">지난 문제</a></span></h2>
    <div class="cards">
${pagesOf(t)
  .map(
    (p) => `      <a class="card" href="${BASE}/${p.path}/" data-topic="${esc(t.id)}" data-mode="${p.mode}">
        <h3>${esc(p.short === '실루엣' ? '실루엣' : '속성 맞히기')}</h3>
        <p>${esc(p.mode === 'silhouette' ? '까만 그림, 틀릴수록 밝아진다' : '초록·노랑·▲▼ 힌트로 좁힌다')}</p>
        <div class="cnt"></div>
      </a>`,
  )
  .join('\n')}
    </div>
  </section>`,
  )
  .join('\n')}
  <details class="how">
    <summary>어떻게 하는 거예요?</summary>
    <ol>
      <li>아무거나 하나 떠올려 이름을 넣는다. 몰라도 된다 — 아무거나로 시작한다.</li>
      <li><b>속성 판</b>은 칸이 초록이면 맞음, 노랑이면 비슷함, ▲▼ 는 정답이 더 크다·작다.</li>
      <li><b>실루엣 판</b>은 까만 그림이 틀릴 때마다 조금씩 밝아진다.</li>
      <li>이름은 <b>첫 자음만 쳐도</b> 찾아진다 — 「ㅍㅋㅊ」 하면 피카츄.</li>
      <li>놓친 날은 <b>지난 문제</b>에서 지금 풀 수 있다. 거기 답은 누를 때까지 가려져 있다.</li>
      <li>맞히면 결과가 이모지 격자로 나온다 — <b>정답 이름은 안 들어간다.</b> 그대로 자랑하면 된다.</li>
    </ol>
    <p>답은 매일 자정(한국 시각)에 바뀐다. 로그인 없음, 기록은 이 기기에만 남는다.</p>
  </details>
  ${foot(true)}
</div>
<script type="module" src="hub.mjs?v=${stamp}"></script>
</body></html>
`;
writeFileSync(join(dist, 'index.html'), hub);

// 사이트맵은 따로 안 만든다 — 블로그 루트의 것이 이 폴더의 html 을 이미 자동으로 거둬 간다
// (실측: /sitemap.xml 에 /daily/, /daily/pokemon/, /daily/lol/ 이 들어 있었다).
// 여기서 하나 더 찍으면 아무도 안 읽는 파일이 남는다.

for (const f of ['engine.mjs', 'app.mjs', 'past.mjs', 'past-row.mjs', 'hub.mjs', 'count.mjs', 'style.css']) copyFileSync(join(app, f), join(dist, f));

// 공유 카드 그림 (scripts/gen-og.mjs 가 만들어 커밋해 둔 것 — 배포에선 만들지 않는다).
mkdirSync(join(dist, 'img/og'), { recursive: true });
for (const f of readdirSync(join(app, 'img/og'))) copyFileSync(join(app, 'img/og', f), join(dist, 'img/og', f));

console.log(`dist/ 생성 — 판 ${all.length}개 (${all.map((p) => p.path).join(', ')}), 도장 ${stamp}`);
