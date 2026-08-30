/**
 * 마우스 전용 조작을 잡는다 (접근성 래칫).
 *
 * 왜: 끌기, 좌표 누르기만 넣으면 그 기능이 **통째로 막힌 사람**이 생긴다. 실제로 우리가 낸
 * 구멍이다. PDF 쪽 순서 바꾸기(끌어 놓기만), 전/후 손잡이, 소리 파형. 셋 다 사람이 훑을
 * 때에야 드러났고, 그때마다 그날 최대 구멍이었다. 기계가 봐야 한다.
 *
 * 무엇을 잡나: **끌기, 좌표 조작을 다는 파일에 자판 길이 하나도 없는 것.**
 *   끌기 쪽 = dragstart/draggable, mousedown/pointerdown/touchstart, clientX 로 자리 계산
 *   자판 쪽 = keydown/keyup, tabindex, role="slider"|"button", arrow 키 처리
 * 파일 단위로 본다. 이 화면에 자판 길이 아예 없다가 우리가 실제로 다친 모양이라서다.
 * 어느 요소가 짝인지까지 기계로 잇는 것은 못 한다(그건 사람이 본다).
 *
 * 래칫이다: 지금 있는 것은 기준선으로 통과, **새로 늘면 빨강**.
 * 기준선은 이 감사기 자신이 쓴다(`--write-baseline`).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(appRoot, 'src/widgets');
const BASELINE = join(appRoot, 'scripts/mouse-only-baseline.tsv');
const write = process.argv.includes('--write-baseline');

/** 끌기, 좌표 조작. 손가락 하나로만 되는 것들 */
const DRAG = [
  /addEventListener\(\s*['"]dragstart['"]/g,
  /\.ondragstart\s*=/g,
  /draggable\s*=\s*['"]?true/g,
  /addEventListener\(\s*['"](?:mousedown|pointerdown|touchstart)['"]/g,
  /\.on(?:mousedown|pointerdown|touchstart)\s*=/g,
];
/** 자판 길. 하나라도 있으면 생각은 했다로 본다(래칫이라 그 정도가 맞다) */
const KEYS = [
  /addEventListener\(\s*['"]key(?:down|up|press)['"]/g,
  /\.onkey(?:down|up|press)\s*=/g,
  /tabindex\s*=/gi,
  /\.tabIndex\s*=/g,
  /role\s*=\s*['"](?:slider|button|listbox|option|tab)['"]/g,
  /setAttribute\(\s*['"]role['"]\s*,\s*['"](?:slider|button|listbox|option|tab)['"]/g,
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}
const count = (code, res) => res.reduce((n, re) => n + (code.match(re) ?? []).length, 0);

if (!existsSync(SCAN_ROOT)) {
  console.error(`[mouse-only] CANNOT-RUN: 훑을 폴더가 없다. ${SCAN_ROOT}`);
  console.error('[mouse-only]   이건 위반 없음이 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}
const files = walk(SCAN_ROOT);
if (files.length < 100) {
  console.error(`[mouse-only] CANNOT-RUN: 파일이 ${files.length}개뿐이다. 경로가 옮겨졌는지 확인할 것.`);
  process.exit(2);
}

const found = [];
let dragFiles = 0;
for (const abs of files) {
  const rel = relative(appRoot, abs).split(String.fromCharCode(92)).join('/');
  const code = stripComments(readFileSync(abs, 'utf8'));
  const drag = count(code, DRAG);
  if (drag === 0) continue;
  dragFiles++;
  const keys = count(code, KEYS);
  if (keys === 0) found.push({ rel, drag });
}
// 끌기를 다는 파일이 하나도 안 잡히면 = 규칙이 낡았다는 뜻이지 깨끗하다가 아니다.
if (dragFiles === 0) {
  console.error('[mouse-only] CANNOT-RUN: 끌기, 좌표 조작을 다는 파일이 0개다. 정규식이 낡았다.');
  process.exit(2);
}

if (write) {
  const head = [
    '# mouse-only 기준선. 자판 길이 없는 채로 이미 있는 화면들. 여기 없는 새 자리만 막는다.',
    '# 자판 길을 내면 그 줄을 지운다. 지운 줄이 다시 나타나면 그때부터 빨강이다.',
    '# 갱신: node scripts/audit-mouse-only.mjs --write-baseline',
  ];
  const prev = new Map();
  if (existsSync(BASELINE)) {
    for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
      const s = line.trimEnd();
      if (!s || s.startsWith('#')) continue;
      const p = s.split('\t');
      if (p[1]) prev.set(p[0], p[1]);
    }
  }
  const lines = [...new Set(found.map((f) => f.rel))].sort()
    .map((k) => (prev.has(k) ? `${k}\t${prev.get(k)}` : k));
  writeFileSync(BASELINE, `${[...head, ...lines].join('\n')}\n`, 'utf8');
  console.log(`[mouse-only] 기준선을 새로 썼다: ${lines.length}줄 (끌기 다는 파일 ${dragFiles}개 중)`);
  process.exit(0);
}

/* 둘째 칸이 있으면 = **판단 끝난 예외**(자판으로 할 수 없는 것이 왜 괜찮은지). */
const baseline = new Set();
const reasons = new Map();
if (existsSync(BASELINE)) {
  for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
    const s = line.trimEnd();
    if (!s || s.startsWith('#')) continue;
    const p = s.split('\t');
    baseline.add(p[0]);
    if (p[1]) reasons.set(p[0], p[1]);
  }
}
const fresh = found.filter((f) => !baseline.has(f.rel));
const stale = [...baseline].filter((k) => !found.some((f) => f.rel === k));

console.log(
  `[mouse-only] 끌기 다는 파일 ${dragFiles}개, 자판 길 없는 것 ${found.length}개` +
  ` (기준선 ${baseline.size - reasons.size}, 판단 끝난 예외 ${reasons.size}), 새 자리 ${fresh.length}건`,
);
if (stale.length > 0) {
  console.log(`[mouse-only] 자판 길이 생긴 것 ${stale.length}줄. 기준선에서 지워라 (--write-baseline)`);
  for (const k of stale.slice(0, 10)) console.log(`    ✓ ${k}`);
}
if (fresh.length === 0) {
  console.log('[mouse-only] OK. 마우스 전용으로 새로 난 자리 없음');
  process.exit(0);
}
console.error('[mouse-only] ❌ 끌기, 좌표 조작만 있고 자판 길이 없다:');
for (const f of fresh) {
  console.error(`    ${f.rel} (끌기 ${f.drag}곳)`);
  console.error('        → 같은 일을 하는 자판 길을 같은 판에서 낸다: 화살표/Home/End 처리(keydown)');
  console.error('          + tabindex 로 초점을 받고 + role 로 무엇인지 알린다(role="slider" 등).');
}
process.exit(1);
