/**
 * 스터디 맵 강의 검사 + 목록 만들기 (TASK-KL-233).
 *
 * 강의는 표(JSON)로 늘어난다. 그래서 표가 틀리면 화면에서 조용히 깨진다 —
 * 없는 칸 id, 범위 밖 정답 번호, 모르는 블록 종류. 사람이 아니라 여기서 잡는다.
 *
 * 겸사겸사 `data/lessons/index.json` 을 만든다. 위젯이 「이 칸에 강의가 있나」를
 * 134번 물어볼 수는 없으니, 목록 한 장을 미리 만들어 둔다.
 *
 * 사용: node scripts/check-studymap-lessons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, 'data');
const lessonsDir = path.join(dataDir, 'lessons');

const map = JSON.parse(fs.readFileSync(path.join(dataDir, 'studymap.json'), 'utf8'));
const nodeIds = new Set(map.tracks.flatMap((t) => t.stages.flatMap((s) => s.nodes.map((n) => n.id))));
const BLOCK_TYPES = new Set(['p', 'h', 'code', 'note', 'try', 'demo']);
/** demo 는 실제로 실행되는 판이라 어떤 판인지(kind)가 반드시 있어야 한다. */
const DEMO_KINDS = new Set(['html', 'js', 'shader']);

const fail = [];
const index = {};

for (const locale of fs.existsSync(lessonsDir) ? fs.readdirSync(lessonsDir) : []) {
  const dir = path.join(lessonsDir, locale);
  if (!fs.statSync(dir).isDirectory()) continue;
  const ids = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const id = file.replace(/\.json$/, '');
    const where = `${locale}/${file}`;
    let lesson;
    try {
      lesson = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    } catch (err) {
      fail.push(`${where}: JSON 이 깨졌다 — ${(err && err.message) || err}`);
      continue;
    }
    if (!nodeIds.has(id)) fail.push(`${where}: 지도에 없는 칸 id (studymap.json 과 짝이 안 맞는다)`);
    if (lesson.id !== id) fail.push(`${where}: 파일 이름과 안의 id 가 다르다 (${lesson.id})`);
    if (!Array.isArray(lesson.blocks) || lesson.blocks.length === 0) fail.push(`${where}: blocks 가 비었다`);
    for (const [at, block] of (lesson.blocks || []).entries()) {
      if (!BLOCK_TYPES.has(block.type)) fail.push(`${where}: blocks[${at}] 모르는 종류 「${block.type}」`);
      if (typeof block.text !== 'string' || block.text.trim() === '') fail.push(`${where}: blocks[${at}] 글이 비었다`);
      if (block.type === 'demo' && Array.isArray(block.controls)) {
        for (const c of block.controls) {
          if (!c || !c.id || !c.label || !['range', 'toggle', 'select'].includes(c.type)) {
            fail.push(`${where}: blocks[${at}] 손잡이는 id·label·type(range/toggle/select) 이 필요하다`);
          }
          /* 손잡이를 만들었는데 코드가 안 쓰면 아무 일도 안 일어난다 — 조용한 실패를 막는다. */
          if (c && c.id && !String(block.text).includes(`{{${c.id}}}`)) {
            fail.push(`${where}: blocks[${at}] 손잡이 「${c.id}」 를 예제 코드가 안 쓴다 ({{${c.id}}} 자리 없음)`);
          }
        }
      }
      if (block.type === 'demo' && !DEMO_KINDS.has(block.kind)) {
        fail.push(`${where}: blocks[${at}] demo 는 kind 가 html·js·shader 중 하나여야 한다 (지금 「${block.kind}」)`);
      }
    }
    for (const [at, item] of (lesson.quiz || []).entries()) {
      if (!Array.isArray(item.choices) || item.choices.length < 2) fail.push(`${where}: quiz[${at}] 선택지가 2개 미만`);
      if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= (item.choices || []).length) {
        fail.push(`${where}: quiz[${at}] 정답 번호가 선택지 범위 밖 (${item.answer})`);
      }
      if (typeof item.q !== 'string' || item.q.trim() === '') fail.push(`${where}: quiz[${at}] 질문이 비었다`);
    }
    ids.push(id);
  }
  index[locale] = ids.sort();
}

if (fail.length > 0) {
  for (const line of fail) console.log(`  ${line}`);
  console.log(`[studymap-lessons] 깨진 곳 ${fail.length}개`);
  process.exit(1);
}

fs.writeFileSync(
  path.join(lessonsDir, 'index.json'),
  JSON.stringify({ $comment: '자동 생성 — check-studymap-lessons.mjs. 위젯이 「강의 있는 칸」을 표시하는 데 쓴다.', lessons: index }, null, 2) + '\n',
);

const total = Object.values(index).reduce((sum, ids) => sum + ids.length, 0);
console.log(`[studymap-lessons] 강의 ${total}편 정상 · 지도 칸 ${nodeIds.size}개 · 목록 갱신 (${Object.entries(index).map(([l, ids]) => `${l} ${ids.length}`).join(' · ')})`);
