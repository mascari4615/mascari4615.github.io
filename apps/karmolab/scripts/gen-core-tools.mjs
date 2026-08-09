/**
 * 화면이 「부를 수 있는 도구」 목록을 찍는다 — `data/core-tools.json` (해자① 묶어 쓰기)
 *
 * 묶어 쓰기 화면은 사용자가 적은 `tool`·`op` 이 진짜 있는지 알아야 한다. 그 목록을 화면에
 * 손으로 적으면 **도구를 옮길 때마다 조용히 낡는다** — 알맹이는 27개인데 화면은 24개만 아는
 * 상태가 되고, 멀쩡한 도구를 「모른다」고 답한다.
 *
 * 그래서 알맹이에서 뽑는다. `spec.ops` 의 열쇠가 곧 연산 목록이다.
 *
 * 사용: node scripts/gen-core-tools.mjs   (build 사슬에서 자동)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const coreDir = path.join(root, 'src/core');
const outFile = path.join(root, 'data/core-tools.json');

const out = {};
for (const file of fs.readdirSync(coreDir).filter((f) => f.endsWith('.ts'))) {
  const body = fs.readFileSync(path.join(coreDir, file), 'utf8');
  if (/export const spec\b/.test(body) === false) continue;
  const id = path.basename(file, '.ts');
  /* `spec.ops` 안의 최상위 열쇠만. 빌드 전이라 실행해서 읽을 수 없어 글로 읽는다. */
  const ops = [...body.matchAll(/^\s{4}(\w+):\s*\{$/gm)].map((m) => m[1]);
  if (ops.length === 0) continue;
  out[id] = { ops };
}

if (Object.keys(out).length === 0) {
  console.error('[gen-core-tools] 알맹이를 하나도 못 찾았다 — 경로가 틀렸을 수 있다');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n');

/*
 * 화면 쪽은 목록만으로는 부족하다 — **부를 수 있어야** 한다.
 *
 * 처음엔 `import(`../../core/${id}`)` 로 그때그때 데려오려 했는데, esbuild 가 그 자리를
 * `src/core/*` **전부**로 넓혀서 README.md 까지 묶으려다 빌드가 죽었다. 게다가 우리 출력은
 * IIFE 라 코드 쪼개기가 없다 — 「그때 데려오기」가 애초에 성립하지 않는다.
 *
 * 그래서 **정적 표를 찍는다.** 손으로 적는 목록이 아니라 여기서 만들어지므로 낡지 않고,
 * 이 표를 쓰는 위젯은 lazy 라 무게는 **묶어 쓰기를 연 사람에게만** 간다.
 */
const ids = Object.keys(out).sort();
const ts = [
  '/* 자동 생성 — `node scripts/gen-core-tools.mjs`. 손으로 고치지 마라. */',
  "import type { ToolRunner } from './types';",
  '',
  ...ids.map((id) => `import { run as ${id}Run, spec as ${id}Spec } from './${id}';`),
  '',
  'export interface CoreEntry {',
  '  run: ToolRunner;',
  '  ops: string[];',
  '}',
  '',
  'export const CORES: Record<string, CoreEntry> = {',
  ...ids.map((id) => `  ${id}: { run: ${id}Run, ops: Object.keys(${id}Spec.ops) },`),
  '};',
  ''
].join('\n');
fs.writeFileSync(path.join(root, 'src/core/registry.generated.ts'), ts);

console.log(
  `[gen-core-tools] 도구 ${ids.length}개 · 연산 ${Object.values(out).reduce((a, t) => a + t.ops.length, 0)}개 ` +
    '→ data/core-tools.json · src/core/registry.generated.ts'
);
