/**
 * 명부(`widgets-lazy-meta.ts`)와 구현이 **같은 판에 있는지** 본다.
 *
 * 왜 (2026-08-14 실측): 명부에 도구를 적고 구현 파일을 같은 커밋에 안 올리면, 목록에는
 * 보이는데 누르면 스크립트를 못 받아 **아무 일도 안 일어난다**. 그날 master 를 세운 사고가
 * 이것이다. 화면은 멀쩡해 보이고 타입검사도 통과한다 — 명부는 그냥 글자라서다.
 *
 * 무엇을 보나 (셋):
 *   ① 명부가 가리키는 스크립트가 **실제로 있나** (`lazyScriptPaths` 한 줄 한 줄)
 *   ② 명부에 있는 id 를 **누가 등록하나** (`Toolbox.register({ id: 'x' })` 또는
 *      `...getLazyWidgetPublicMeta('x')`)
 *   ③ 등록은 하는데 **명부에 없는** id (목록·찾기창·주소 어느 쪽으로도 못 닿는 유령)
 *
 * 경로 규약은 `toolbox.js` 의 `resolveScriptPath` 와 **같은 것**을 쓴다 — 거기서 갈리면
 * 검사가 통과해도 실제로는 못 받는다.
 *
 * 래칫이다: 지금 못 잇는 것은 기준선으로 통과, **새로 늘면 빨강**.
 * 기준선은 이 감사기 자신이 쓴다(`--write-baseline`).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const META = join(appRoot, 'src/widgets-lazy-meta.ts');
const BASELINE = join(appRoot, 'scripts/registry-impl-baseline.tsv');
const TAB = '\t';
const write = process.argv.includes('--write-baseline');

/** `toolbox.js resolveScriptPath` 와 같은 규약 — 여기서 갈리면 검사가 거짓말을 한다. */
function sourceOf(p) {
  if (p.startsWith('vendor/')) return join(appRoot, 'js/vendor', `${p.slice(7)}.js`);
  if (p.startsWith('root/')) return join(appRoot, 'src', `${p.slice(5)}.ts`);
  if (p.startsWith('world/')) return join(appRoot, 'src/world', `${p.slice(6)}.ts`);
  return join(appRoot, 'src/widgets', `${p}.ts`);
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

if (!existsSync(META)) {
  console.error(`[registry-impl] CANNOT-RUN: 명부가 없다 — ${META}`);
  console.error('[registry-impl]   이건 「어긋난 데 없음」이 아니라 **아무것도 안 봤다**는 뜻이다.');
  process.exit(2);
}

const meta = readFileSync(META, 'utf8');
const entries = [];
for (const block of meta.split(/\n {2}\{/).slice(1)) {
  const id = (block.match(/id: ['"]([a-z0-9-]+)['"]/) || [])[1];
  if (!id) continue;
  const raw = (block.match(/lazyScriptPaths: \[([^\]]*)\]/) || [])[1];
  const paths = raw
    ? raw.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    : [];
  entries.push({ id, paths });
}
// 「0개 = 통과」를 막는 바닥. 명부가 비면 깨끗한 게 아니라 **못 읽은** 것이다.
if (entries.length < 50) {
  console.error(`[registry-impl] CANNOT-RUN: 명부에서 ${entries.length}개만 읽혔다 — 형식이 바뀌었는지 확인할 것.`);
  process.exit(2);
}

const registered = new Set();
for (const f of walk(join(appRoot, 'src/widgets'))) {
  const code = readFileSync(f, 'utf8');
  // id 는 `register({` **바로 다음 속성**일 때만 잡는다 — 안 그러면 `tabs: [{ id: … }]` 의
  // 탭 이름을 위젯 id 로 잘못 집는다(그러면 「명부에 없는 id」가 무더기로 뜬다).
  for (const m of code.matchAll(/Toolbox\.register\(\{\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*id: ['"]([a-z0-9-]+)['"]/g)) registered.add(m[1]);
  for (const m of code.matchAll(/getLazyWidgetPublicMeta[!?]*\.?\(\s*['"]([a-z0-9-]+)['"]/g)) registered.add(m[1]);
}
if (registered.size < 50) {
  console.error(`[registry-impl] CANNOT-RUN: 등록하는 id 가 ${registered.size}개만 잡혔다 — 정규식이 낡았다.`);
  process.exit(2);
}

const found = [];
for (const e of entries) {
  for (const p of e.paths) {
    if (!existsSync(sourceOf(p))) {
      found.push({
        key: `MISSING-SCRIPT${TAB}${e.id}${TAB}${p}`,
        why: '명부가 가리키는 스크립트가 없다 — 목록엔 보이는데 눌러도 아무 일도 안 난다',
      });
    }
  }
  if (!registered.has(e.id)) {
    found.push({
      key: `NO-REGISTER${TAB}${e.id}${TAB}-`,
      why: '명부에 있는데 아무 파일도 이 id 로 등록하지 않는다',
    });
  }
}
const metaIds = new Set(entries.map((e) => e.id));
for (const id of [...registered].sort()) {
  if (!metaIds.has(id)) {
    found.push({
      key: `NOT-IN-META${TAB}${id}${TAB}-`,
      why: '등록은 하는데 명부에 없다 — 목록·찾기창·주소 어느 쪽으로도 못 닿는다',
    });
  }
}

if (write) {
  const head = [
    '# registry-impl 기준선 — 명부와 구현이 아직 안 맞는 자리. 여기 없는 새 것만 막는다.',
    '# 이으면 그 줄을 지운다. 지운 줄이 다시 나타나면 그때부터 빨강이다.',
    '# 갱신: node scripts/audit-registry-impl.mjs --write-baseline',
  ];
  const lines = [...new Set(found.map((f) => f.key))].sort();
  writeFileSync(BASELINE, `${[...head, ...lines].join('\n')}\n`, 'utf8');
  console.log(`[registry-impl] 기준선을 새로 썼다: ${lines.length}줄 (명부 ${entries.length}항목 · 등록 ${registered.size}개)`);
  process.exit(0);
}

const baseline = new Set(
  existsSync(BASELINE)
    ? readFileSync(BASELINE, 'utf8').split('\n').map((s) => s.trimEnd()).filter((s) => s && !s.startsWith('#'))
    : [],
);
const fresh = found.filter((f) => !baseline.has(f.key));
const stale = [...baseline].filter((k) => !found.some((f) => f.key === k));

console.log(
  `[registry-impl] 명부 ${entries.length}항목 · 등록하는 id ${registered.size}개` +
    ` · 안 맞는 자리 ${found.length}건(기준선 ${baseline.size}) · 새 것 ${fresh.length}건`,
);
if (stale.length > 0) {
  console.log(`[registry-impl] 이어진 것 ${stale.length}줄 — 기준선에서 지워라 (--write-baseline)`);
  for (const k of stale.slice(0, 10)) console.log(`    ✓ ${k.split(TAB).join('  ')}`);
}
if (fresh.length === 0) {
  console.log('[registry-impl] OK — 명부와 구현이 어긋난 새 자리 없음');
  process.exit(0);
}
console.error('[registry-impl] ❌ 명부와 구현이 어긋난다:');
for (const f of fresh) {
  console.error(`    ${f.key.split(TAB).join('  ')}`);
  console.error(`        → ${f.why}`);
}
process.exit(1);
