/**
 * 새 도구 뼈대를 한 번에 세운다 (TASK-KL-338).
 *
 *   npm run new:tool -- <id> [--title 이름] [--desc 설명] [--work image|video|pdf|file|dev|text] [--dry]
 *
 * 어디에 무엇을 넣을지는 `lib/new-tool-plan.mjs` 가 정하고(순수), 여기는 **그대로 적기만**
 * 한다. 그래서 계획이 맞는지는 파일을 안 건드리고 검사한다(`npm run test:new-tool`).
 *
 * ★ 있는 것을 덮지 않는다. 한 자리라도 이미 있으면 **아무 것도 안 쓰고 멈춘다**. 반쯤 덮인
 * 도구는 빠진 도구보다 고치기 나쁘다(무엇이 내 것이고 무엇이 생성기 것인지 알 수 없다).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { badId, leftovers, planTool, WORKBENCHES } from './lib/new-tool-plan.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);

function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
}

const id = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1]?.startsWith('--') !== true);
const dry = argv.includes('--dry');

if (id === undefined || badId(id) !== null) {
  console.error('사용: npm run new:tool -- <id> [--title 이름] [--desc 설명] [--work 작업대] [--dry]');
  console.error(`  id  : ${badId(id) ?? ''}`);
  console.error(`  작업대: ${Object.keys(WORKBENCHES).join(', ')} (안 주면 작업대에는 안 얹는다)`);
  process.exit(2);
}

let steps;
try {
  steps = planTool({
    id,
    title: flag('title', id),
    desc: flag('desc', undefined),
    tab: flag('tab', undefined),
    layout: flag('layout', 'form'),
    work: flag('work', undefined)
  });
} catch (e) {
  console.error(`[new-tool] ${e.message}`);
  process.exit(2);
}

/* ── 먼저 전부 살펴본다. 한 자리라도 걸리면 아무 것도 안 쓴다 ─────────────── */

const blocked = [];
for (const s of steps) {
  const abs = path.join(APP, s.path);
  if (s.kind === 'create' && fs.existsSync(abs)) blocked.push(`${s.path}. 이미 있다`);
  if (s.kind !== 'create' && !fs.existsSync(abs)) blocked.push(`${s.path}. 없다 (경로가 바뀌었나)`);
  if (s.kind === 'insert-before' && fs.existsSync(abs) && !fs.readFileSync(abs, 'utf8').includes(s.find)) {
    blocked.push(`${s.path}. 넣을 자리(${s.find})를 못 찾았다`);
  }
  if (s.kind === 'json-merge' && fs.existsSync(abs)) {
    const j = JSON.parse(fs.readFileSync(abs, 'utf8'));
    for (const k of Object.keys(s.value)) {
      /* 중첩 표(tool-aliases)는 한 겹 안에 살 수 있다. 전체 글에서 찾는다. */
      if (fs.readFileSync(abs, 'utf8').includes(`"${k}"`)) blocked.push(`${s.path}. ${k} 가 이미 있다`);
      void j;
    }
  }
}
if (blocked.length > 0) {
  console.error(`[new-tool] 멈춘다. ${id} 는 이미 일부가 서 있다:`);
  for (const b of blocked) console.error(`  - ${b}`);
  console.error('  반쯤 덮인 도구는 빠진 도구보다 나쁘다. 손으로 정리한 뒤 다시 불러라.');
  process.exit(1);
}

/* ── 적는다 ────────────────────────────────────────────────────────────────── */

function mergeJson(abs, value) {
  const raw = fs.readFileSync(abs, 'utf8');
  const j = JSON.parse(raw);
  /* 중첩 한 겹(`{ "묶음": { "id": "..." } }`)이면 **그 묶음 안**에 넣는다. 바깥에 넣으면
     읽는 쪽이 못 찾고, 그건 오류 없이 검색어가 없는 도구가 된다. */
  const key = Object.keys(value)[0];
  const nested = Object.keys(j).find((k) => j[k] !== null && typeof j[k] === 'object' && !Array.isArray(j[k]));
  const flat = Object.values(j).every((v) => typeof v === 'string');
  if (!flat && nested !== undefined) Object.assign(j[nested], value);
  else Object.assign(j, value);
  fs.writeFileSync(abs, JSON.stringify(j, null, 2) + '\n');
  return key;
}

const done = [];
for (const s of steps) {
  const abs = path.join(APP, s.path);
  if (dry) {
    done.push(`${s.kind.padEnd(17)} ${s.path} . ${s.why}`);
    continue;
  }
  if (s.kind === 'create') {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, s.content);
  } else if (s.kind === 'insert-before') {
    /* 배열 리터럴의 **마지막 항목 뒤**에 붙인다. 앞 항목의 닫는 괄호에 쉼표를 붙이는 것이
       이 자리의 전부인데, 그걸 빠뜨리면 파일이 통째로 안 읽혀 **앱이 안 뜬다**. */
    const raw = fs.readFileSync(abs, 'utf8');
    const quoted = s.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\}\\s*\\n(' + quoted + ')');
    if (!re.test(raw)) {
      console.error(`[new-tool] ${s.path}. 배열 끝 모양이 달라졌다. 손으로 넣어라.`);
      process.exit(1);
    }
    fs.writeFileSync(abs, raw.replace(re, `},\n\n${s.text}\n$1`));
  } else if (s.kind === 'json-merge') {
    mergeJson(abs, s.value);
  } else if (s.kind === 'insert-after-last') {
    const raw = fs.readFileSync(abs, 'utf8');
    const at = raw.lastIndexOf(s.find);
    const lineEnd = raw.indexOf('\n', at);
    fs.writeFileSync(abs, raw.slice(0, lineEnd) + ',\n' + s.text + raw.slice(lineEnd));
  }
  done.push(`${s.path} . ${s.why}`);
}

console.log(`[new-tool] ${dry ? '(해 보기만) ' : ''}${id} 자리 ${steps.length}곳:`);
for (const d of done) console.log(`  ✓ ${d}`);
if (dry) process.exit(0);

console.log('\n이어서 사람이 할 것 (생성기가 대신 못 정하는 것):');
for (const l of leftovers(id)) console.log(`  - ${l}`);
console.log('\n확인: npx tsc --noEmit, npm run build:i18n, npm run gates:changed');
