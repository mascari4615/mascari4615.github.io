/**
 * JSON 펴기 알맹이 검사 (TASK-KL-286).
 *
 * 사람이 JSON 을 여는 이유의 태반은 「여기 뭐가 들어 있나」다. 그러니 재는 것도 그것이다:
 * 갈래를 맞게 가르는가 · 길(`a.b[0].c`)이 **그대로 코드에 붙일 수 있는가** ·
 * 큰 것을 만나도 멈추고 그 사실을 말하는가.
 *
 * 사용: node scripts/test-json-tree.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'jt-'));
const out = join(dir, 'jt.mjs');
await build({ entryPoints: ['src/widgets/tools/shared/json-tree.ts'], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
const { flatten, tally, deepest } = await import(pathToFileURL(out).href);

const failures = [];
const eq = (got, want, why) => {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  if (a === b) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why} — 기대 ${b}, 나온 것 ${a}`);
  }
};

/* 갈래 가르기 */
{
  const { rows } = flatten({ a: 1, b: 'x', c: true, d: null });
  eq(rows.length, 5, '뿌리 + 넷');
  eq(rows[0].kind, 'object', '뿌리는 물체');
  eq(rows.map((r) => r.kind).slice(1), ['number', 'string', 'boolean', 'null'], '갈래를 맞게 가른다');
  eq(rows[0].preview, '{ 4 }', '가지는 자식 수를 보여 준다');
}

/* 길 — 그대로 코드에 붙일 수 있어야 한다 */
{
  const { rows } = flatten({ user: { tags: ['a', 'b'] } });
  const paths = rows.map((r) => r.path);
  eq(paths, ['', 'user', 'user.tags', 'user.tags[0]', 'user.tags[1]'], '물체는 점, 목록은 대괄호');
}

/* 목록 */
{
  const { rows } = flatten([1, [2, 3]]);
  eq(rows[0].preview, '[ 2 ]', '목록은 대괄호로 센다');
  eq(rows.map((r) => r.depth), [0, 1, 1, 2, 2], '깊이가 맞다');
  eq(deepest(rows), 2, '가장 깊은 곳');
}

/* 긴 글은 자르되 **잘랐다고 표시**한다 */
{
  const { rows } = flatten({ s: 'x'.repeat(200) });
  const p = rows[1].preview;
  eq(p.length < 80, true, '긴 글은 자른다');
  eq(p.endsWith('…"'), true, `잘랐다고 표시한다 (지금 「${p.slice(-6)}」)`);
}

/* 큰 것 — 멈추고 그 사실을 말한다 */
{
  const big = Array.from({ length: 5000 }, (_, i) => i);
  const { rows, cut } = flatten(big, 100);
  eq(rows.length <= 100, true, '상한을 넘지 않는다');
  eq(cut, true, '멈췄으면 멈췄다고 말한다');
}
{
  const { cut } = flatten({ a: 1 }, 100);
  eq(cut, false, '작은 것에는 멈춤 표시가 안 붙는다');
}

/* 무엇이 몇 개인지 */
{
  const { rows } = flatten({ a: 1, b: 2, c: 'x' });
  const n = tally(rows);
  eq([n.number, n.string, n.object], [2, 1, 1], '갈래별로 센다');
}

process.stdout.write('\n');
rmSync(dir, { recursive: true, force: true });
if (failures.length) {
  console.error(`[test-json-tree] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-json-tree] JSON 을 맞게 편다');
