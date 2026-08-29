#!/usr/bin/env node
/**
 * gen-recall-pool. 되묻기가 오늘 세트를 고를 때 볼 얇은 표
 *
 * 왜 얇게. 강의 전체가 17MB. 고르는 데 필요한 건 어느 칸 몇째 장에 무엇이 몇 개 있나뿐이라,
 * 그것만 굽고 본문은 고른 뒤 그 강의만 받음
 *
 * 굽는 것
 *   tracks   갈래 id 에서 제목
 *   lessons  칸 id 에서 { t 갈래, n 칸 제목, p 장 제목들, q 장마다 쓸 객관식 자리, s 장마다 서술 가능 여부 }
 *
 * 서술 질문은 장 제목 그대로, 모범 답은 그 장 첫 문단.
 * 지어내기 금지. 장 제목이 이미 주장문
 *
 * 쓰기
 *   node scripts/gen-recall-pool.mjs           굽기
 *   node scripts/gen-recall-pool.mjs --check   굽지 않고 표가 성한지만
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP = path.join(ROOT, 'data/studymap.json');
const LESSONS = path.join(ROOT, 'data/lessons/ko');
const OUT = path.join(ROOT, 'data/recall-pool.json');
const checkOnly = process.argv.includes('--check');

const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/* 칸 제목을 보여 줘도 안 풀리는 문항. 강의를 위에서부터 읽는 중이어야 성립하는 말들.
   되묻기는 한 문항만 떼어 내므로 이런 것은 아예 안 낸다 */
const CONTEXT_BOUND = /(이 트랙|이 장|이 절|이 강의|여기서|위에서|앞에서|아래에서|앞의|위의|다음 중 앞)/;

/* 서술 질문 = 장 제목 그대로. 그런데 제목 72% 는 목차 줄 (실측 1,754 중 1,255).
   무엇을 답할지 안 서므로 문장으로 끝나는 것만 굽는다 */
const SENTENCE_END = /(다|라|자|까|나|가|\?)$/;
let dropped = 0;
let labels = 0;

const map = read(MAP);
const tracks = map.tracks || map;

/** 칸 id 에서 갈래 id 와 칸 제목 — 제목 없으면 문항이 홀로 못 섬
    (실측: "1.1 에서 파일을 합치고 도메인을 나눈 이유는?" 이 HTTP 버전 칸을 전제) */
const trackOf = new Map();
const titleOf = new Map();
for (const tr of tracks)
  for (const st of tr.stages)
    for (const n of st.nodes) {
      trackOf.set(n.id, tr.id);
      titleOf.set(n.id, n.title);
    }

const pool = { v: 1, tracks: {}, lessons: {} };
for (const tr of tracks) pool.tracks[tr.id] = tr.title;

let says = 0;
let picks = 0;
const orphan = [];

for (const f of fs.readdirSync(LESSONS)) {
  /* 이름으로 거르기 금지. search-index 가 검색 갈래의 진짜 칸이라 한 번 빠뜨렸음.
     지도에 있는지로만 가름 */
  if (!f.endsWith('.json')) continue;
  const id = f.replace(/\.json$/, '');
  const t = trackOf.get(id);
  if (!t) {
    orphan.push(id);
    continue;
  }
  const j = read(path.join(LESSONS, f));
  const q = [];
  const s = [];
  const names = [];
  for (const p of j.parts || []) {
    /* 개수가 아니라 살아남은 자리를 적는다. 뺀 것이 있으면 자리가 밀리기 때문 */
    const keep = (p.quiz || []).map((x, k) => (CONTEXT_BOUND.test(x.q || '') ? -1 : k)).filter((k) => k >= 0);
    dropped += (p.quiz || []).length - keep.length;
    q.push(keep);
    picks += keep.length;
    /* 서술은 제목과 첫 문단이 둘 다 있어야 냄. 하나라도 없으면 물어볼 것도 대조할 것도 없음 */
    const first = (p.blocks || []).find((b) => b.type === 'p');
    const said = Boolean(p.title && first && first.text);
    const ok = said && !CONTEXT_BOUND.test(p.title) && SENTENCE_END.test(p.title.trim());
    if (said && !ok) {
      if (CONTEXT_BOUND.test(p.title)) dropped += 1;
      else labels += 1;
    }
    s.push(ok ? 1 : 0);
    names.push(p.title || '');
    if (ok) says += 1;
  }
  pool.lessons[id] = { t, n: titleOf.get(id) || id, q, s: s.join(''), p: names };
}

if (checkOnly) {
  if (!fs.existsSync(OUT)) {
    console.log('[recall-pool] 못 돌림. 구운 표가 없다 (node scripts/gen-recall-pool.mjs 먼저)');
    process.exit(2);
  }
  const cur = read(OUT);
  const bad = [];
  const a = Object.keys(pool.lessons).sort().join(',');
  const b = Object.keys(cur.lessons || {}).sort().join(',');
  if (a !== b) bad.push('칸 목록이 다르다');
  for (const [id, v] of Object.entries(pool.lessons)) {
    const c = (cur.lessons || {})[id];
    if (!c) continue;
    if (c.s !== v.s || JSON.stringify(c.q || []) !== JSON.stringify(v.q)) bad.push(`${id} 문항 자리가 다르다`);
  }
  if (orphan.length) bad.push(`지도에 없는 강의 ${orphan.length} (${orphan.slice(0, 3).join(', ')})`);
  if (bad.length) {
    console.log('[recall-pool] 빨강. ' + bad.slice(0, 4).join(' / '));
    process.exit(1);
  }
  console.log(`[recall-pool] OK. 칸 ${Object.keys(pool.lessons).length} · 객관식 ${picks} · 서술 ${says}`);
  process.exit(0);
}

if (orphan.length) {
  console.log(`[recall-pool] 빨강. 지도에 없는 강의 ${orphan.length} (${orphan.slice(0, 3).join(', ')})`);
  process.exit(1);
}

fs.writeFileSync(OUT, `${JSON.stringify(pool)}\n`);
const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(
  `[recall-pool] 구웠다. 칸 ${Object.keys(pool.lessons).length} · 갈래 ${Object.keys(pool.tracks).length} · 객관식 ${picks} · 서술 ${says} · 문맥에 묶여 뺀 것 ${dropped} · 목차 줄이라 뺀 것 ${labels} · ${kb}KB`,
);
