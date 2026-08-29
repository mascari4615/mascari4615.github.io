/**
 * 세는 법이 다시 흩어지는 것을 잡는다 (SSOT 래칫. 글 쪽).
 *
 * 왜 (2026-08-13 실측): 글 도구 열넷이 저마다 셌다. `글.length`(UTF-16 조각) , 
 * `[...글].length`(가족 이모지가 다섯으로 쪼개진다), `split(/\s+/)`. **셋 다 틀린다.**
 * 👨‍👩‍👧 안녕 café를 사람은 9자로 세는데 각각 16, 13, ... 이 나왔고, 화면은 9자,
 * MCP 는 13자를 말하고 있었다. 글자수는 트위터, 이력서 제한 때문에 보는 것이라 사람 눈과
 * 다르면 쓸모가 없다.
 *
 * 그래서 세는 법은 **`core/charcount` 하나**, 도구가 닿는 문은 **`tools/shared/text`** 하나다.
 *
 * 무엇을 잡나 (`shared/text` 와 `core/` 자신은 뺀다):
 *   ① 위젯이 `core/charcount` 를 **직접** 무는 것. 공용 문을 안 거치면 다음 사람이 또 자기 식으로 센다
 *   ② `[...x].length` 로 자소를 세는 것. 이모지에서 틀린다
 *   ③ `split(/\s+/)` 로 낱말을 가르는 것
 *   ④ `Intl.Segmenter` 를 도구가 직접 부르는 것. 폴백까지 각자 적게 된다
 *
 * `audit:shared-bypass` 가 그림, 소리, PDF 를 보는 것과 같은 일을 **글**에 하는 것이다.
 * 저쪽 규칙(호출 패턴)으로는 못 잡는다. 글 쪽은 코어 재수출이라 모양이 다르다.
 *
 * 래칫이다: 지금 있는 것은 기준선으로 통과, **새로 늘면 빨강**.
 * 기준선은 이 감사기 자신이 쓴다(`--write-baseline`).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_ROOT = join(appRoot, 'src/widgets');
const BASELINE = join(appRoot, 'scripts/text-count-baseline.tsv');
const TAB = '\t';
const write = process.argv.includes('--write-baseline');

const RULES = [
  {
    id: 'CORE-DIRECT',
    re: /from\s+['"][^'"]*core\/charcount['"]/g,
    fix: 'tools/shared/text 의 countText(). 도구가 닿는 문은 거기 하나다',
  },
  { id: 'GRAPHEME-HAND', re: /\[\.\.\.[^\]\n]{1,40}\]\.length/g, fix: 'tools/shared/text. 가족 이모지가 다섯으로 쪼개진다' },
  { id: 'WORDS-HAND', re: /\.split\(\/\\s\+\//g, fix: 'tools/shared/text 의 countText().words' },
  { id: 'SEGMENTER-DIRECT', re: /Intl\.Segmenter/g, fix: 'tools/shared/text. 폴백까지 거기 한 번만 적는다' },
];

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p, out);
      continue;
    }
    if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

if (!existsSync(SCAN_ROOT)) {
  console.error(`[text-count] CANNOT-RUN: 훑을 폴더가 없다. ${SCAN_ROOT}`);
  console.error('[text-count]   이건 위반 없음이 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}
const files = walk(SCAN_ROOT);
if (files.length < 100) {
  console.error(`[text-count] CANNOT-RUN: 파일이 ${files.length}개뿐이다. 경로가 옮겨졌는지 확인할 것.`);
  process.exit(2);
}
// 공용 문 자체가 없어졌으면 깨끗이 아니라 **기준이 사라진** 것이다.
if (!existsSync(join(appRoot, 'src/widgets/tools/shared/text.ts'))) {
  console.error('[text-count] CANNOT-RUN: `tools/shared/text.ts` 가 없다. 옮겼으면 이 감사기도 같이 고쳐라.');
  process.exit(2);
}

const found = [];
for (const abs of files) {
  const rel = relative(appRoot, abs).split(String.fromCharCode(92)).join('/');
  if (rel.endsWith('tools/shared/text.ts')) continue; // 공용 문 자신은 대상이 아니다
  const code = stripComments(readFileSync(abs, 'utf8'));
  for (const rule of RULES) {
    const n = (code.match(rule.re) ?? []).length;
    if (n > 0) found.push({ key: `${rule.id}${TAB}${rel}`, id: rule.id, rel, n, fix: rule.fix });
  }
}

if (write) {
  const head = [
    '# text-count 기준선. 세는 법이 공용 문을 안 거치는 자리. 여기 없는 새 것만 막는다.',
    '# 공용으로 옮기면 그 줄을 지운다. 지운 줄이 다시 나타나면 그때부터 빨강이다.',
    '# 둘째 칸(경로) 다음 셋째 칸 = 판단 끝난 예외.',
    '# 갱신: node scripts/audit-text-count.mjs --write-baseline',
  ];
  const prev = new Map();
  if (existsSync(BASELINE)) {
    for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
      const s = line.trimEnd();
      if (!s || s.startsWith('#')) continue;
      const p = s.split(TAB);
      if (p[2]) prev.set(`${p[0]}${TAB}${p[1]}`, p[2]);
    }
  }
  const lines = [...new Set(found.map((f) => f.key))].sort()
    .map((k) => (prev.has(k) ? `${k}${TAB}${prev.get(k)}` : k));
  writeFileSync(BASELINE, `${[...head, ...lines].join('\n')}\n`, 'utf8');
  console.log(`[text-count] 기준선을 새로 썼다: ${lines.length}줄 (파일 ${files.length}개 훑음)`);
  process.exit(0);
}

const baseline = new Set();
const reasons = new Map();
if (existsSync(BASELINE)) {
  for (const line of readFileSync(BASELINE, 'utf8').split('\n')) {
    const s = line.trimEnd();
    if (!s || s.startsWith('#')) continue;
    const p = s.split(TAB);
    const key = `${p[0]}${TAB}${p[1]}`;
    baseline.add(key);
    if (p[2]) reasons.set(key, p[2]);
  }
}
const fresh = found.filter((f) => !baseline.has(f.key));
const stale = [...baseline].filter((k) => !found.some((f) => f.key === k));

console.log(
  `[text-count] 파일 ${files.length}개 검사, 공용을 안 거치는 자리 ${found.length}건` +
    ` (기준선 ${baseline.size - reasons.size}, 판단 끝난 예외 ${reasons.size}), 새 것 ${fresh.length}건`,
);
if (stale.length > 0) {
  console.log(`[text-count] 공용으로 옮겨진 것 ${stale.length}줄. 기준선에서 지워라 (--write-baseline)`);
  for (const k of stale.slice(0, 10)) console.log(`    ✓ ${k.split(TAB).join('  ')}`);
}
if (fresh.length === 0) {
  console.log('[text-count] OK. 세는 법이 새로 흩어진 곳 없음');
  process.exit(0);
}
console.error('[text-count] ❌ 세는 법이 공용 문을 안 거친다:');
for (const f of fresh) {
  console.error(`    ${f.id}  ${f.rel} (${f.n}곳)`);
  console.error(`        → ${f.fix}`);
}
process.exit(1);
