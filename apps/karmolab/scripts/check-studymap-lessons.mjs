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
const nodeTitles = new Map(map.tracks.flatMap((t) => t.stages.flatMap((s) => s.nodes.map((n) => [n.id, n.title]))));
const BLOCK_TYPES = new Set(['p', 'h', 'code', 'note', 'try', 'demo']);
/** demo 는 실제로 실행되는 판이라 어떤 판인지(kind)가 반드시 있어야 한다. */
const DEMO_KINDS = new Set(['html', 'js', 'shader']);

const fail = [];
const index = {};
const searchIndex = {};

for (const locale of fs.existsSync(lessonsDir) ? fs.readdirSync(lessonsDir) : []) {
  const dir = path.join(lessonsDir, locale);
  if (!fs.statSync(dir).isDirectory()) continue;
  const ids = [];
  const searchDocuments = [];
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
    /**
     * 칸 하나가 **여러 장(章)** 일 수 있다. 장이 있으면 장을 검사하고, 없으면 옛 모양(blocks 하나)을 검사한다.
     * 어느 쪽이든 아래 검사는 같으므로 「검사할 묶음들」로 펴서 한 번만 적는다.
     */
    const parts = Array.isArray(lesson.parts) && lesson.parts.length > 0 ? lesson.parts : null;
    if (parts) {
      const seen = new Set();
      for (const [pi, part] of parts.entries()) {
        if (!part || typeof part.id !== 'string' || part.id.trim() === '') fail.push(`${where}: parts[${pi}] id 가 없다`);
        if (seen.has(part?.id)) fail.push(`${where}: parts[${pi}] id 「${part.id}」 가 겹친다`);
        seen.add(part?.id);
        if (typeof part?.title !== 'string' || part.title.trim() === '') fail.push(`${where}: parts[${pi}] 제목이 없다`);
        /* 장마다 확인 문제가 있어야 「공부」가 된다 — 읽고 넘어가는 장을 못 만들게 막는다. */
        if (!Array.isArray(part?.quiz) || part.quiz.length < 2) fail.push(`${where}: parts[${pi}] 확인 문제가 2개 미만`);
      }
    } else if (!Array.isArray(lesson.blocks) || lesson.blocks.length === 0) {
      fail.push(`${where}: blocks 가 비었다`);
    }
    const chunks = parts ? parts.map((p, i) => [`parts[${i}].`, p]) : [['', lesson]];
    for (const chunk of (parts || [lesson])) {
      const prose = (chunk.blocks || []).filter((block) => block.type !== 'demo' && block.type !== 'code')
        .map((block) => `${block.label || ''} ${block.text || ''}`).join(' ').replace(/[*_`#>|\[\]()]/g, ' ').replace(/\s+/g, ' ').trim();
      const questions = (chunk.quiz || []).map((item) => item.q || '').join(' ');
      searchDocuments.push({
        id: `${id}:${chunk.id || ''}`,
        nodeId: id,
        partId: chunk.id || '',
        title: chunk.title || nodeTitles.get(id) || id,
        nodeTitle: nodeTitles.get(id) || id,
        description: prose.slice(0, 360),
        aliases: questions.slice(0, 240),
      });
    }
    for (const [tagPrefix, chunk] of chunks) {
    const at0 = tagPrefix;
    if (parts && (!Array.isArray(chunk.blocks) || chunk.blocks.length === 0)) fail.push(`${where}: ${at0}blocks 가 비었다`);
    for (const [at, block] of (chunk.blocks || []).entries()) {
      if (!BLOCK_TYPES.has(block.type)) fail.push(`${where}: ${at0}blocks[${at}] 모르는 종류 「${block.type}」`);
      if (typeof block.text !== 'string' || block.text.trim() === '') fail.push(`${where}: ${at0}blocks[${at}] 글이 비었다`);
      if (block.type === 'demo' && Array.isArray(block.controls)) {
        for (const c of block.controls) {
          if (!c || !c.id || !c.label || !['range', 'toggle', 'select'].includes(c.type)) {
            fail.push(`${where}: ${at0}blocks[${at}] 손잡이는 id·label·type(range/toggle/select) 이 필요하다`);
          }
          /* 손잡이를 만들었는데 코드가 안 쓰면 아무 일도 안 일어난다 — 조용한 실패를 막는다. */
          if (c && c.id && !String(block.text).includes(`{{${c.id}}}`)) {
            fail.push(`${where}: ${at0}blocks[${at}] 손잡이 「${c.id}」 를 예제 코드가 안 쓴다 ({{${c.id}}} 자리 없음)`);
          }
        }
      }
      if (block.type === 'demo' && !DEMO_KINDS.has(block.kind)) {
        fail.push(`${where}: ${at0}blocks[${at}] demo 는 kind 가 html·js·shader 중 하나여야 한다 (지금 「${block.kind}」)`);
      }
    }
    for (const [at, item] of (chunk.quiz || []).entries()) {
      if (!Array.isArray(item.choices) || item.choices.length < 2) fail.push(`${where}: ${at0}quiz[${at}] 선택지가 2개 미만`);
      if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= (item.choices || []).length) {
        fail.push(`${where}: ${at0}quiz[${at}] 정답 번호가 선택지 범위 밖 (${item.answer})`);
      }
      if (typeof item.q !== 'string' || item.q.trim() === '') fail.push(`${where}: ${at0}quiz[${at}] 질문이 비었다`);
    }
    }
    ids.push(id);
  }
  index[locale] = ids.sort();
  searchIndex[locale] = searchDocuments;
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
for (const [locale, documents] of Object.entries(searchIndex)) {
  fs.writeFileSync(path.join(lessonsDir, `search-index.${locale}.json`),
    JSON.stringify({ $comment: '자동 생성 — check-studymap-lessons.mjs. 통합 검색용 강의·장 색인.', documents }, null, 2) + '\n');
}

const total = Object.values(index).reduce((sum, ids) => sum + ids.length, 0);
console.log(`[studymap-lessons] 강의 ${total}편 정상 · 지도 칸 ${nodeIds.size}개 · 목록 갱신 (${Object.entries(index).map(([l, ids]) => `${l} ${ids.length}`).join(' · ')})`);
