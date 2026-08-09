/**
 * 첫 그림에 필요 없는 스타일을 뒤로 뺀다 (TASK-KL-128 ④-b)
 *
 * 왜: `toolbox.css` 한 장이 화면 그리기를 막는다. 그런데 구역별로 실제로 쓰이는지 재 봤더니,
 * **처음 화면에 아예 없는 것들**이 섞여 있었다 (1280px 실측):
 *   · 명령 팔레트 8.3KB — 첫 화면 31%, 목록·도구 화면 **0%** (⌘K 를 눌러야 생긴다)
 *   · 첫 화면 큰 소개 7.1KB — 첫 화면 55%, 목록·도구 화면 6~9%
 *   · 옆줄 차림 4.6KB — 어디서나 1% (그 차림을 고른 사람만 쓴다)
 * 셋 다 **눌러야/골라야 나타나는 것**이라, 글이 나오기를 막을 이유가 없다.
 *
 * 어떻게: `css/toolbox.css` 는 **읽기만 한다** — 손으로 고치는 정본은 그대로 두고, 여기서
 * 구역 배너(`═══ 제목 ═══`)를 기준으로 두 벌을 만들어 낸다. 그래서 이 스크립트가 정본을
 * 건드리지 않고, 다른 사람이 `toolbox.css` 를 고쳐도 다음 빌드에 그대로 반영된다.
 *
 * 안전: 두 벌을 도로 이으면 원본과 **한 바이트도 달라선 안 된다**. 다르면 세운다.
 * 뒤로 뺀 셋은 저마다 제 이름표(클래스·속성)로 갇혀 있어 순서가 바뀌어도 서로 안 밟는다.
 *
 * 사용: node scripts/split-css.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, 'css/toolbox.css');

/** 뒤로 뺄 구역 (배너 제목 앞부분으로 찾는다 — 제목 뒤에 설명이 붙어 있어도 걸린다).
 *
 * **여기에 함부로 더 넣지 마라.** 「쓰임 0%」로 보인다고 뒤로 빼면 안 되는 것이 있다 —
 * 재 보고 알았다(밀림 = 글이 자리를 잡았다가 다시 튀는 정도, 0.1 이하가 좋음):
 *   · 첫 화면 큰 소개(LANDING PAGE) + 옆줄 차림(SIDEBAR NAV) 을 같이 빼 봤더니 목록 화면
 *     밀림이 0.011 → **0.636** 이 됐다. 옆줄 차림만 빼도 똑같이 0.636 이다.
 *     둘은 「그 차림을 고른 사람만 쓰는 것」처럼 보이지만 실제로는 자리를 잡는 데 관여한다.
 *   · 명령 팔레트만 빼면 밀림 그대로(0.011/0.061/0.03/0.022). 이건 화면 위에 덮이는 것이라
 *     아래 글의 자리에 관여하지 않는다.
 * 새로 넣을 때는 **반드시 `npm run measure:speed` 로 밀림을 전후 비교**해라. */
const DEFERRED = ['명령 팔레트'];

const NAMES = { critical: 'css/shell-critical.css', deferred: 'css/shell-deferred.css' };

function sections(text) {
  const lines = text.split('\n');
  const marks = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\/\*\s*═+/.test(lines[i])) {
      const inline = lines[i].replace(/^\/\*\s*═+\s*/, '').replace(/\s*═+.*$/, '').trim();
      marks.push({ line: i, title: inline || (lines[i + 1] || '').trim() });
    }
  }
  if (!marks.length) throw new Error('[split-css] 구역 배너를 못 찾았다 — toolbox.css 머리 모양 확인');
  return marks.map((m, i) => ({
    title: m.title,
    text: lines.slice(i === 0 ? 0 : m.line, i + 1 < marks.length ? marks[i + 1].line : lines.length).join('\n')
  }));
}

const src = fs.readFileSync(SRC, 'utf8');
const secs = sections(src);

if (secs.map((s) => s.text).join('\n') !== src) {
  console.error('[split-css] 구역을 잘랐다 도로 이었더니 원본과 다르다 — 자르는 규칙이 틀렸다');
  process.exit(1);
}

const isDeferred = (title) => DEFERRED.some((d) => title.startsWith(d));
const found = DEFERRED.filter((d) => secs.some((s) => s.title.startsWith(d)));
if (found.length !== DEFERRED.length) {
  // 구역 이름이 바뀌면 조용히 아무것도 안 빼는 상태가 된다 — 그건 「느려졌는데 아무도 모름」이다.
  console.error('[split-css] 뒤로 뺄 구역을 못 찾았다: ' + DEFERRED.filter((d) => !found.includes(d)).join(', '));
  console.error('  → toolbox.css 의 구역 이름이 바뀌었다. 이 파일의 DEFERRED 를 맞춰라.');
  process.exit(1);
}

const head = (what) =>
  `/* 이 파일은 \`scripts/split-css.mjs\` 가 \`css/toolbox.css\` 에서 뽑아 만든다 — 손으로 고치지 마라.\n` +
  `   고칠 곳은 \`css/toolbox.css\` 다 (TASK-KL-128). 이 벌: ${what} */\n`;

/**
 * **설명은 소스에, 사람에게. 브라우저에는 규칙만.**
 *
 * 이 저장소의 CSS 는 설명이 두껍다 — 그게 좋아서 그렇게 쓴다. 그런데 그 설명이 **첫 그림을
 * 막는 파일에 그대로 실려** 모든 방문자가 매번 받고 있었다. 실측(2026-08-09):
 *
 *     막는 CSS gzip  28.97KB  →  주석만 빼면  13.46KB      (절반 이상이 설명)
 *
 * 정본(`css/toolbox.css`)의 설명은 **한 줄도 안 지운다** — 고치는 사람은 거기를 본다.
 * 여기서 뽑아 내보낼 때만 뺀다.
 *
 * 문자열 안의 `/*` 는 CSS 에서 사실상 안 쓰이지만(`url()` 도 따옴표 밖), 그래도 따옴표 안은
 * 건드리지 않게 훑는다 — 조용히 규칙 하나가 깨지면 화면이 어긋난 채로 나간다.
 */
function stripComments(css) {
  let out = '';
  let quote = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += css[++i] ?? ''; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; out += c; continue; }
    if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) break; // 안 닫힌 주석 — 나머지는 통째 설명이다
      i = end + 1;
      continue;
    }
    out += c;
  }
  /* 설명이 있던 자리에 남는 빈 줄을 접는다 — 안 하면 뺀 만큼 줄바꿈이 남는다. */
  const NL = String.fromCharCode(10);
  return out.split(NL).map((l) => l.replace(/[ 	]+$/, '')).filter((l, k, arr) => l.trim() !== '' || (arr[k - 1] || '').trim() !== '').join(NL);
}

const outputs = {
  [NAMES.critical]:
    head('첫 그림에 필요한 것 — 화면 그리기를 막고 기다린다') +
    secs.filter((s) => !isDeferred(s.title)).map((s) => s.text).join('\n') + '\n',
  [NAMES.deferred]:
    head('눌러야/골라야 나타나는 것 — 화면이 그려진 뒤에 온다') +
    secs.filter((s) => isDeferred(s.title)).map((s) => s.text).join('\n') + '\n'
};

const changed = [];
for (const [rel, raw] of Object.entries(outputs)) {
  /* 내보내는 벌에서만 설명을 뺀다 (머리말 한 줄은 남긴다 — 이 파일을 손으로 고치려는 사람을 막아야 한다). */
  const body = raw.slice(0, raw.indexOf('*/') + 3) + stripComments(raw.slice(raw.indexOf('*/') + 3));
  const p = path.join(root, rel);
  const old = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (old !== body) changed.push(rel);
  if (!process.argv.includes('--check')) fs.writeFileSync(p, body, 'utf8');
}

if (process.argv.includes('--check')) {
  if (changed.length) {
    console.error('[split-css] 다시 뽑으면 달라진다 — ' + changed.join(', '));
    process.exit(1);
  }
  console.log('[split-css] 최신이다');
} else {
  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + 'KB';
  console.log(
    `[split-css] 구역 ${secs.length}개 → 막는 것 ${kb(outputs[NAMES.critical])} · 뒤로 뺀 것 ${kb(outputs[NAMES.deferred])}`
  );
}
