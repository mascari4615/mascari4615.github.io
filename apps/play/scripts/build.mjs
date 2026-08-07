/**
 * 놀이터 관문(/karmolab/play/) 만들기 + 목록 검사 (TASK-KL-089)
 *
 * 놀이가 셋이 되면서 「무엇이 있나」를 한 자리에서 보여 줄 곳이 필요해졌다.
 * 목록은 `games.json` 하나뿐이고, 관문도 각 놀이의 전환 줄도 전부 거기서 나온다.
 *
 * 막는 것: 적어 둔 주소가 실제로 없는 경우 · 이름이나 한 줄 소개가 빈 경우 · id 겹침.
 * (주소가 죽으면 관문에서 눌러도 없는 곳으로 간다 — 사람이 바로 겪는 손해다.)
 *
 * 사용: node scripts/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { games, STRIP_CSS, stripHtml } from './strip.mjs';

const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const apps = path.dirname(here);
const list = games();
const problems = [];
const seen = new Set();

/** 그 주소를 실제로 내주는 파일이 있는가 — 앱마다 어디에 사는지는 여기 한 번만 적는다. */
const WHERE = {
  '/daily/': path.join(apps, 'daily/dist/index.html'),
  '/karmolab/#higher': path.join(apps, 'karmolab/js/widgets/higher.js'),
  '/karmolab/#quest': path.join(apps, 'karmolab/js/widgets/quest.js')
};

for (const g of list) {
  if (!g.id || seen.has(g.id)) problems.push(`${g.id || '(id 없음)'}: id 가 없거나 겹친다`);
  seen.add(g.id);
  if (!g.title || !g.lead) problems.push(`${g.id}: 이름이나 한 줄 소개가 비었다`);
  const file = WHERE[g.url];
  if (!file) problems.push(`${g.id}: 「${g.url}」 가 어디서 나오는지 모른다 — 이 파일의 WHERE 에 적어라`);
  else if (!fs.existsSync(file)) problems.push(`${g.id}: 「${g.url}」 를 내주는 파일이 없다 — 그 놀이를 먼저 만들어야 한다`);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cards = list
  .map(
    (g) =>
      `      <a class="play-card" href="${esc(g.url)}"><span class="play-emoji">${esc(g.emoji)}</span><strong>${esc(g.title)}</strong><span>${esc(g.lead)}</span></a>`
  )
  .join('\n');

const html = `---
layout: none
permalink: /karmolab/play/
---
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>놀이터 — 하루 한 판씩 | KarmoLab</title>
<meta name="description" content="KarmoLab 의 놀이 ${list.length}가지. 오늘의 하나 맞히기, 높은 쪽 고르기, 도구로 푸는 하루 한 문제. 하나 하다 다른 것으로 바로 건너갈 수 있습니다.">
<link rel="canonical" href="https://blog.mascari4615.com/karmolab/play/">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta property="og:type" content="website">
<meta property="og:title" content="놀이터 — 하루 한 판씩">
<meta property="og:description" content="맞히기 · 고르기 · 풀기. 하나 하다 다른 것으로 바로 건너갑니다.">
<meta property="og:url" content="https://blog.mascari4615.com/karmolab/play/">
<meta property="og:image" content="https://blog.mascari4615.com/apps/karmolab/img/og/hub.jpg">
<meta property="og:locale" content="ko_KR">
<link rel="icon" href="/apps/karmolab/img/favicon.ico">
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 1.8rem 1rem 3rem; background: #0f0f12; color: #f2f2ee; font-family: 'Noto Sans KR', system-ui, sans-serif; line-height: 1.6; }
main { max-width: 38rem; margin: 0 auto; }
.crumb { font-size: 0.78rem; color: #8b8b85; margin-bottom: 0.7rem; }
.crumb a { color: inherit; }
h1 { font-size: 1.5rem; margin: 0 0 0.2rem; letter-spacing: -0.02em; }
.lead { color: #b9b9b2; font-size: 0.9rem; margin: 0 0 1.4rem; }
.play-grid { display: grid; gap: 0.6rem; }
.play-card {
  display: grid; grid-template-columns: 2.2rem 1fr; grid-template-rows: auto auto; gap: 0.1rem 0.6rem;
  padding: 0.9rem 1rem; text-decoration: none; color: inherit;
  background: #17171c; border: 1px solid #26262e; border-radius: 14px;
}
.play-card:hover, .play-card:focus-visible { border-color: #d4a849; }
.play-emoji { grid-row: 1 / span 2; font-size: 1.6rem; align-self: center; }
.play-card strong { font-size: 1.02rem; }
.play-card span:last-child { color: #8b8b85; font-size: 0.86rem; }
.play-mine {
  grid-column: 2; margin-top: 4px; justify-self: start;
  padding: 1px 8px; font-size: 0.78rem;
  color: var(--accent); border: 1px solid var(--border-strong); border-radius: 999px;
}
footer { margin-top: 2rem; font-size: 0.8rem; color: #8b8b85; }
footer a { color: #b9b9b2; }
${STRIP_CSS}</style>
</head>
<body>
<main>
  <nav class="crumb"><a href="/karmolab/">KarmoLab</a> › <a href="/karmolab/t/">도구</a> › <span aria-current="page">놀이터</span></nav>
  <h1>놀이터</h1>
  <p class="lead">하루 한 판씩. 하나 하다 다른 것으로 바로 건너가세요.</p>
  <div class="play-grid">
${cards}
  </div>
  <footer>도구가 필요하면 — <a href="/karmolab/t/">도구 전체 목록</a> · <a href="/karmolab/">KarmoLab</a></footer>
<script>
(function () {
  /* 관문이 정적이라 「오늘 내가 뭘 했나」가 안 보였다 (TASK-KL-089).
   * 각 놀이가 이 브라우저에 남겨 둔 것만 읽어 카드에 한 줄 붙인다 —
   * 여기서 새로 저장하는 것은 없다. 못 읽으면 아무 줄도 안 붙는다(사생활 모드도 그냥 조용하다). */
  var read = function (k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  };
  var kstDay = function () {
    var d = new Date(Date.now() + 9 * 3600e3);
    return d.getUTCFullYear() + '. ' + (d.getUTCMonth() + 1) + '. ' + d.getUTCDate() + '.';
  };
  var lines = {};

  // 하나 맞히기 — 주제·모드마다 따로 두므로, 오늘 끝낸 판이 하나라도 있으면 「오늘 했음」.
  try {
    var done = 0, playing = 0;
    Object.keys(localStorage).forEach(function (k) {
      if (!/^daily:[^:]+:[^:]+$/.test(k)) return;
      var v = read(k);
      if (!v || !v.day) return;
      if (v.status === 'won' || v.status === 'lost') done++;
      else if ((v.guesses || []).length) playing++;
    });
    if (done) lines.daily = '오늘 ' + done + '판 끝냈어요';
    else if (playing) lines.daily = '풀던 판이 있어요';
  } catch (e) { /* 조용히 */ }

  // 오늘의 문제 — 오늘 날짜 기록이 있으면 맞혔는지까지.
  var q = read('karmolab_quest');
  if (q && q[kstDay()]) lines.quest = q[kstDay()].win ? '오늘 맞혔어요 (' + q[kstDay()].tries + '번)' : '오늘은 아쉬웠어요';

  // 높은 쪽 고르기 — 판마다 최고 연승 중 가장 큰 것.
  var h = read('karmolab_higher_best');
  if (h) {
    var top = 0;
    Object.keys(h).forEach(function (t) { if (h[t] > top) top = h[t]; });
    if (top) lines.higher = '최고 ' + top + '연승';
  }

  [].forEach.call(document.querySelectorAll('.play-card'), function (card) {
    var id = (card.getAttribute('href') || '').indexOf('/daily/') === 0 ? 'daily'
      : card.getAttribute('href').indexOf('quest') >= 0 ? 'quest' : 'higher';
    if (!lines[id]) return;
    var tag = document.createElement('span');
    tag.className = 'play-mine';
    tag.textContent = lines[id];
    card.appendChild(tag);
  });
})();
</script>
</main>
</body>
</html>
`;

if (problems.length) {
  console.error(`[play] 놀이 목록이 어긋났다 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}

fs.writeFileSync(path.join(here, 'index.html'), html, 'utf8');
console.log(`[play] 관문 만듦 — 놀이 ${list.length}개 (${list.map((g) => g.title).join(' · ')})`);
