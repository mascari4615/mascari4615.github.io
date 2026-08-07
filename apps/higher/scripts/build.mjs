/**
 * 「높은 쪽 고르기」 — 표 만들기 + 표 검사 (TASK-KL-089)
 *
 * 이 놀이의 규칙도 하나다: **판을 늘릴 때 코드는 안 고친다.** 옆 놀이(`/daily/`)가 이미 모아 둔
 * 표에서 *숫자 속성*만 뽑아 온다 — 그림 주소와 이름, 그리고 「키·몸무게·체력」 같은 견줄 값.
 *
 * 왜 베껴 오나: 그쪽 표는 파일이 크고(포켓몬 1025마리) 놀이에 필요 없는 것이 많다. 필요한
 * 것만 뽑으면 받는 양이 몇 분의 일이 된다. 그리고 그쪽 표가 바뀌어도 이 놀이가 조용히
 * 깨지지 않는다 — 여기서 한 번 걸러진다.
 *
 * 막는 것: 숫자 속성이 없는 주제 · 이름 겹침 · 값이 비었거나 숫자가 아닌 항목 ·
 *          견줄 값이 죄다 같아서 놀이가 안 되는 속성.
 *
 * 사용: node scripts/build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampStrip } from '../../play/scripts/strip.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, '../daily/data');
const OUT = path.join(root, 'data');

const problems = [];
const boards = [];

for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
  const topic = file.replace(/\.json$/, '');
  const numeric = (raw.fields || []).filter((f) => f.kind === 'number');
  if (!numeric.length) {
    problems.push(`${topic}: 견줄 숫자 속성이 하나도 없다 — 이 놀이에는 못 쓴다`);
    continue;
  }

  const names = new Set();
  const items = [];
  for (const it of raw.items || []) {
    if (!it.name || !it.img) continue;
    if (names.has(it.name)) {
      problems.push(`${topic}: 「${it.name}」 이 두 번 있다 — 어느 쪽이 큰지가 말이 안 된다`);
      continue;
    }
    names.add(it.name);
    const vals = {};
    for (const f of numeric) {
      const v = it[f.key];
      if (typeof v === 'number' && Number.isFinite(v)) vals[f.key] = v;
    }
    if (Object.keys(vals).length) items.push({ n: it.name, i: it.img, v: vals });
  }

  /* 값이 죄다 같은 속성은 뺀다 — 「어느 쪽이 큰가」에 답이 없다. */
  const fields = numeric
    .filter((f) => new Set(items.map((x) => x.v[f.key]).filter((v) => v !== undefined)).size >= 5)
    .map((f) => ({ key: f.key, label: f.label, unit: f.unit || '' }));
  if (!fields.length) {
    problems.push(`${topic}: 견줄 만큼 값이 벌어진 속성이 없다`);
    continue;
  }
  if (items.length < 20) {
    problems.push(`${topic}: 항목이 ${items.length}개뿐 — 너무 금방 같은 것이 또 나온다`);
    continue;
  }

  fs.writeFileSync(
    path.join(OUT, `${topic}.json`),
    `---\nlayout: none\npermalink: /karmolab/higher/${topic}.json\n---\n` +
      JSON.stringify({ title: raw.title || topic, emoji: raw.emoji || '', fields, items }),
    'utf8'
  );
  boards.push({ topic, title: raw.title || topic, emoji: raw.emoji || '', n: items.length, fields: fields.map((f) => f.label) });
}

if (!boards.length) problems.push('만들어진 판이 하나도 없다');

/* 스크립트를 안 돌려도 무엇이 있는 곳인지 읽히게, 판 목록을 페이지에 박는다. */
const htmlPath = path.join(root, 'index.html');
if (fs.existsSync(htmlPath)) {
  let html = fs.readFileSync(htmlPath, 'utf8');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = boards
    .map((b) => `      <li>${esc(b.emoji)} ${esc(b.title)} — ${b.n}개 · 견줄 것: ${esc(b.fields.join(' · '))}</li>`)
    .join('\n');
  /* 박을 것이 셋이다 — 판 목록·놀이 전환 줄·판 이름표. 셋을 다 고친 **뒤에 한 번** 저장한다.
   * (예전에는 중간에 한 번 저장하고 마지막 것만 「달라졌으면 저장」이라 다른 둘이 묻혔다.) */
  const original = html;
  html = html.replace(/(<ul id="boards">)[\s\S]*?(<\/ul>)/, `$1\n${list}\n    $2`);
  if (!/<ul id="boards">/.test(html)) problems.push('페이지에서 판 목록 자리를 못 찾았다');

  // 놀이끼리 오가는 줄 — 목록은 apps/play/games.json 하나뿐이다.
  const stamped = stampStrip(html, 'higher');
  if (!stamped.ok) problems.push('페이지에서 놀이 전환 줄 자리를 못 찾았다 (PLAY_STRIP 표식)');
  else html = stamped.html;

  const meta = `window.HIGHER_BOARDS=${JSON.stringify(boards.map((b) => ({ t: b.topic, title: b.title, e: b.emoji })))};`;
  html = html.replace(/(<script id="boards-data">)[\s\S]*?(<\/script>)/, `$1${meta}$2`);

  if (html !== original) fs.writeFileSync(htmlPath, html, 'utf8');
}

if (problems.length) {
  console.error(`[higher] 표가 어긋났다 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`[higher] 판 ${boards.length}개 — ${boards.map((b) => `${b.title}(${b.n})`).join(' · ')}`);
