/**
 * 오늘의 문제 — 표가 성한지 + 스크립트 없이도 읽히는지 (TASK-KL-089)
 *
 * 이 놀이의 단 하나의 규칙: **문제를 늘릴 때 코드는 안 고친다.** `data/puzzles.json` 에 한 줄
 * 넣으면 그날 문제가 된다. 그래서 표가 어긋나면 놀이가 통째로 망가진다 — 여기서 먼저 막는다.
 *
 * 보는 것:
 *  - 정답이 원문으로 새지 않는가 (지문만 있어야 한다 — 소스를 열면 답이 보이면 놀이가 아니다)
 *  - 가리키는 도구가 실제로 있는가 (없는 도구로 보내면 그 날 문제는 못 푼다)
 *  - 문제·힌트가 비어 있지 않고, 문제끼리 겹치지 않는가
 *  - 스크립트를 안 돌려도 문제 목록이 페이지에 박혀 있는가 (크롤러가 읽을 글)
 *
 * 마지막 항목은 여기서 **박아 준다** — 표를 고치면 이 스크립트가 페이지의 목록도 새로 쓴다.
 *
 * 사용: node scripts/verify.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const strip = (s) => s.replace(/^---[\s\S]*?---\n/, '');
const data = JSON.parse(strip(fs.readFileSync(path.join(root, 'data/puzzles.json'), 'utf8')));
const puzzles = data.puzzles || [];

const toolsPath = path.join(root, '../karmolab/data/tools-seo.json');
const tools = new Set(Object.keys(JSON.parse(fs.readFileSync(toolsPath, 'utf8')).tools));

const problems = [];
const seen = new Set();
for (const p of puzzles) {
  const at = `${p.id || '(id 없음)'}`;
  if (!p.q || !p.q.trim()) problems.push(`${at}: 문제 글이 비었다`);
  if (!p.hint || !p.hint.trim()) problems.push(`${at}: 힌트가 비었다`);
  if (!p.tool || !tools.has(p.tool)) problems.push(`${at}: 「${p.tool}」 라는 도구가 없다 — 그 날은 풀 길이 없어진다`);
  if (!Array.isArray(p.a) || !p.a.length) problems.push(`${at}: 정답 지문이 없다`);
  for (const a of p.a || []) {
    if (!/^[0-9a-f]{16}$/.test(a)) problems.push(`${at}: 정답이 지문이 아니다 (「${a}」) — 원문을 넣으면 소스에서 답이 보인다`);
  }
  if (seen.has(p.q)) problems.push(`${at}: 같은 문제가 두 번 있다`);
  seen.add(p.q);
}
if (!puzzles.length) problems.push('문제가 하나도 없다');

/* 스크립트 없이도 읽히게 목록을 페이지에 박는다. */
const htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const list = puzzles
  .map((p) => `      <li>${esc(p.q)} — <a href="/karmolab/t/${p.tool}/">도구 열기</a></li>`)
  .join('\n');
const before = html;
html = html.replace(/(<ol id="all">)[\s\S]*?(<\/ol>)/, `$1\n${list}\n    $2`);
if (html === before && !/<ol id="all">/.test(html)) problems.push('페이지에서 문제 목록 자리를 못 찾았다');
if (html !== before) fs.writeFileSync(htmlPath, html, 'utf8');

if (problems.length) {
  console.error(`[quest] 표가 어긋났다 ${problems.length}건`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`[quest] 문제 ${puzzles.length}개 — 정답은 지문만, 도구는 전부 실재, 겹침 0 · 스크립트 없이 읽을 목록도 박았다`);
