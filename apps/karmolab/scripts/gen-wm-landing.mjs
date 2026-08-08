/**
 * gen-wm-landing: data/worldbook.json → wm/index.html (WM 소개 한 장, TASK-KL-162)
 *
 * 왜: KarmoLab 이 WM 의 메인 웹이 된다(정본 memo/projects/karmolab/wm-hub.md § A1).
 * 그 첫 장은 **손으로 쓴 소개문이면 안 된다** — WM 은 개발 중이라 설정이 자주 바뀌고,
 * 손글씨는 조용히 낡는다(사이트만 옛말을 한다). 그래서 이 페이지의 모든 문장은
 * memo 정본에서 온다. 문서가 바뀌면 다음 배포에 페이지가 따라 바뀐다.
 *
 * 못 찾은 조각은 **그 자리만 빠진다** — 페이지는 산다. 대신 무엇이 빠졌는지 찍는다.
 * (조용한 백지 금지: 인물이 0명이면 실패로 세운다.)
 *
 * 나온 파일은 gen-shell-pages.mjs 가 셸에 얹어 /karmolab/wm/ 로 낸다.
 *
 * 사용: node scripts/gen-wm-landing.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOK_PATH = path.join(ROOT, 'data/worldbook.json');
const OUT_PATH = path.join(ROOT, 'wm/index.html');
const REPO_URL = 'https://github.com/Mascari4615/Witch-Mendokusai';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

if (!fs.existsSync(BOOK_PATH)) {
  console.error(`[wm-landing] 도감 데이터가 없다: ${BOOK_PATH} — 먼저 npm run build:worldbook`);
  process.exit(1);
}
const book = JSON.parse(fs.readFileSync(BOOK_PATH, 'utf8'));
const byId = new Map(book.docs.map((d) => [d.id, d]));
const missing = [];

/** 본문에서 「## 제목」 아래 덩어리 하나. 없으면 빈 문자열(그 자리만 빠진다). */
function section(doc, headingRe) {
  if (!doc || !doc.body) return '';
  const lines = doc.body.split('\n');
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{2,4})\s+(.+)$/.exec(lines[i]);
    if (!m) continue;
    if (start < 0 && headingRe.test(m[2])) { start = i + 1; level = m[1].length; continue; }
    if (start >= 0 && m[1].length <= level) return lines.slice(start, i).join('\n').trim();
  }
  return start >= 0 ? lines.slice(start).join('\n').trim() : '';
}

/** 「**이름:**」 굵은 이름표 아래 목록 덩어리. 제목(##)이 아닌 이름표도 정본에서 흔히 쓴다. */
function labeledBlock(doc, labelRe) {
  if (!doc || !doc.body) return '';
  const lines = doc.body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*\*\*(.+?):?\*\*:?\s*$/.exec(lines[i]);
    if (!m || !labelRe.test(m[1])) continue;
    const buf = [];
    for (let j = i + 1; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t === '') { if (buf.length > 0) break; continue; }
      if (/^#{1,6}\s/.test(t) || /^\*\*.+\*\*:?$/.test(t)) break;
      buf.push(t);
    }
    return buf.join('\n');
  }
  return '';
}

/** 「- **이름** → 뜻」 목록 → [{term, gloss}]. 형식이 달라지면 빈 배열(그 칸만 빠진다). */
function glossaryList(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const m = /^-\s*"?\*{0,2}(.+?)\*{0,2}"?\s*(?:→|->|:)\s*(.+)$/.exec(line.trim());
    if (!m) continue;
    const term = m[1].replace(/^["“]|["”]$/g, '').trim();
    const gloss = m[2].replace(/\*\*/g, '').trim();
    if (term && gloss) out.push({ term, gloss });
  }
  return out;
}

/** 첫 인용(>) 한 줄 — 핵심 테마처럼 크게 걸 문장. */
function firstQuote(doc) {
  if (!doc || !doc.body) return '';
  const m = doc.body.match(/^>\s*(.+)$/m);
  return m ? m[1].replace(/\*\*/g, '').trim() : '';
}

function need(id) {
  const d = byId.get(id);
  if (!d) missing.push(id);
  return d;
}

// ── 재료 ────────────────────────────────────────────────────────────────────────────────────
const oneLiner = need('vision/one-liner');
const branding = need('vision/branding');
const coreLoop = need('vision/core-loop');

const tagline = section(oneLiner, /한 줄 정의/) || (oneLiner ? oneLiner.summary : '');
const theme = firstQuote(oneLiner);
const title = (section(branding, /^타이틀/) || '').split('\n')[0].replace(/\*\*/g, '').trim();
const forWhom = glossaryList(labeledBlock(branding, /공유 언어/) || section(branding, /공유 언어/));
const audience = section(branding, /팬 100명/)
  .split('\n')
  .filter((l) => /^-\s/.test(l.trim()))
  .map((l) => l.trim().replace(/^-\s*/, '').replace(/\*\*/g, ''))
  .slice(0, 4);

/** 인물 — 정본에 있는 순서가 아니라 「이야기에 들어오는 순서」로 세운다. */
const CAST_ORDER = ['characters/yawn', 'characters/ring', 'characters/alisa', 'characters/fourth'];
const cast = CAST_ORDER.map((id) => byId.get(id)).filter(Boolean);
const extraCast = book.docs
  .filter((d) => d.kind === 'characters' && !CAST_ORDER.includes(d.id) && !/원칙|시스템|친밀도/.test(d.title))
  .slice(0, 4);

if (cast.length === 0) {
  console.error('[wm-landing] 인물이 0명 — 소개 페이지가 백지가 된다');
  process.exit(1);
}

// ── 조각 ────────────────────────────────────────────────────────────────────────────────────
function castCard(d) {
  const name = d.title.replace(/\s*\(.*?\)\s*$/, '').trim();
  const sub = (d.title.match(/\((.+?)\)/) || [, ''])[1];
  const line = d.summary || '';
  return `<article class="wm-cast-card">
        <h3>${esc(name)}${sub ? ` <span class="wm-cast-en">${esc(sub)}</span>` : ''}</h3>
        <p>${esc(line)}</p>
        <a class="wm-cast-more" href="/karmolab/?wb=${encodeURIComponent(d.id)}#wm">도감에서 보기 →</a>
      </article>`;
}

const loopSteps = (coreLoop ? coreLoop.summary : '')
  .split(/[↓→]/)
  .map((s) => s.trim())
  .filter((s) => s.length > 1)
  .slice(0, 5);

if (!tagline) missing.push('한 줄 정의');
if (loopSteps.length === 0) missing.push('핵심 루프');

const body = `<section class="wm-hero">
      <p class="wm-kicker">Witch-Mendokusai</p>
      <h1 class="wm-title">${esc(title || '귀찮은 마녀')}</h1>
      <p class="wm-tagline">${esc(tagline)}</p>
      ${theme ? `<blockquote class="wm-theme">${esc(theme)}</blockquote>` : ''}
      <div class="wm-cta">
        <a class="wm-btn wm-btn-main" href="/karmolab/#wm">세계 도감 보기</a>
        <a class="wm-btn" href="${REPO_URL}" rel="noopener">개발 저장소</a>
      </div>
    </section>

    <section class="wm-block">
      <h2>어떤 게임인가</h2>
      ${loopSteps.length > 0 ? `<ol class="wm-loop">${loopSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}
    </section>

    <section class="wm-block">
      <h2>사는 사람들</h2>
      <div class="wm-cast">
        ${cast.map(castCard).join('\n        ')}
      </div>
      ${extraCast.length > 0
        ? `<p class="wm-more-cast">그리고 ${extraCast.map((d) => `<a href="/karmolab/?wb=${encodeURIComponent(d.id)}#wm">${esc(d.title.replace(/\s*\(.*$/, ''))}</a>`).join(' · ')}</p>`
        : ''}
    </section>

    ${audience.length > 0 ? `<section class="wm-block">
      <h2>이런 사람에게</h2>
      <ul class="wm-audience">${audience.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
    </section>` : ''}

    ${forWhom.length > 0 ? `<section class="wm-block">
      <h2>이 세계의 말</h2>
      <dl class="wm-glossary">${forWhom
        .map(({ term, gloss }) => `<div><dt>${esc(term)}</dt><dd>${esc(gloss)}</dd></div>`)
        .join('')}</dl>
    </section>` : ''}

    <section class="wm-block wm-foot">
      <p>이 페이지의 모든 문장은 개발 노트(<code>memo/wm/design</code>)에서 자동으로 옵니다 — 설정이 바뀌면 여기도 바뀝니다.</p>
      <p class="wm-stamp">문서 ${book.counts.docs}건 기준 · ${book.generatedAt.slice(0, 10)}</p>
    </section>`;

const style = `
      :root { --wm-ink: #e8e3f5; --wm-dim: #a49cc0; --wm-line: rgba(180,160,230,.22); --wm-accent: #c4a7ff; }
      body { color: var(--wm-ink); }
      .wm-hero { padding: 3.2rem 0 2.4rem; border-bottom: 1px solid var(--wm-line); }
      .wm-kicker { letter-spacing: .28em; text-transform: uppercase; font-size: .72rem; color: var(--wm-dim); margin: 0 0 .8rem; }
      .wm-title { font-size: clamp(2.1rem, 6vw, 3.4rem); margin: 0 0 .9rem; line-height: 1.15; }
      .wm-tagline { font-size: clamp(1rem, 2.4vw, 1.22rem); color: var(--wm-ink); margin: 0 0 1.2rem; max-width: 34em; }
      .wm-theme { margin: 0 0 1.6rem; padding: .7rem 0 .7rem 1rem; border-left: 3px solid var(--wm-accent); color: var(--wm-dim); font-style: italic; }
      .wm-cta { display: flex; gap: .6rem; flex-wrap: wrap; }
      .wm-btn { display: inline-block; padding: .62rem 1.15rem; border: 1px solid var(--wm-line); border-radius: 999px; text-decoration: none; color: var(--wm-ink); font-size: .92rem; }
      .wm-btn:hover { border-color: var(--wm-accent); }
      .wm-btn-main { background: var(--wm-accent); color: #1b1330; border-color: transparent; font-weight: 600; }
      .wm-block { padding: 2.2rem 0; border-bottom: 1px solid var(--wm-line); }
      .wm-block h2 { font-size: 1.12rem; letter-spacing: .04em; margin: 0 0 1.1rem; color: var(--wm-dim); font-weight: 600; }
      .wm-loop { margin: 0; padding-left: 1.1rem; display: grid; gap: .45rem; color: var(--wm-ink); }
      .wm-cast { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
      .wm-cast-card { border: 1px solid var(--wm-line); border-radius: 14px; padding: 1rem 1.05rem; background: rgba(255,255,255,.02); }
      .wm-cast-card h3 { margin: 0 0 .45rem; font-size: 1.02rem; }
      .wm-cast-en { color: var(--wm-dim); font-size: .78rem; font-weight: 400; }
      .wm-cast-card p { margin: 0 0 .7rem; color: var(--wm-dim); font-size: .9rem; line-height: 1.6; }
      .wm-cast-more { font-size: .82rem; color: var(--wm-accent); text-decoration: none; }
      .wm-more-cast { margin: 1rem 0 0; color: var(--wm-dim); font-size: .88rem; }
      .wm-more-cast a { color: var(--wm-ink); }
      .wm-audience { margin: 0; padding-left: 1.1rem; display: grid; gap: .4rem; color: var(--wm-dim); }
      .wm-glossary { margin: 0; display: grid; gap: .55rem; }
      .wm-glossary div { display: grid; grid-template-columns: minmax(6.5em, auto) 1fr; gap: .8rem; align-items: baseline; }
      .wm-glossary dt { color: var(--wm-accent); font-weight: 600; }
      .wm-glossary dd { margin: 0; color: var(--wm-dim); }
      .wm-foot { border-bottom: 0; color: var(--wm-dim); font-size: .85rem; }
      .wm-stamp { opacity: .7; }
`;

const description = (tagline || 'Witch-Mendokusai — 귀찮은 마녀').slice(0, 150);
const html = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <title>Witch-Mendokusai — 귀찮은 마녀</title>
    <meta name="description" content="${esc(description)}">
    <meta property="og:title" content="Witch-Mendokusai — 귀찮은 마녀">
    <meta property="og:description" content="${esc(description)}">
    <style>${style}    </style>
  </head>
  <body>
    ${body}
  </body>
</html>
`;

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, html, 'utf8');

for (const m of missing) console.warn(`[wm-landing] ⚠ 못 찾은 조각: ${m} — 그 자리는 비워 둔다`);
console.log(`[wm-landing] 씀: wm/index.html (인물 ${cast.length}명 · 말 ${forWhom.length}개 · 루프 ${loopSteps.length}단계)`);
