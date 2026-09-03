/**
 * 폴더 안 *.mjs 를 node --test 로 실행
 *
 * 왜 있나: `node --test dir/*.mjs` 의 별표는 셸 몫인데 게이트 러너는 셸 없이 실행
 * node 24 는 별표를 스스로 풀지만 CI 의 node 20 은 안 풀어 "Could not find .../*.mjs" 빨강
 * (test:3d, test:pose, 2026-09-03). 여기서 파일을 직접 세어 넘김. 파일 0개면 못 잼(exit 2)
 *
 *   node scripts/run-node-tests.mjs <폴더> [<폴더>...]
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('[run-node-tests] 폴더를 적어라');
  process.exit(2);
}
const files = [];
for (const d of dirs) {
  if (!statSync(d, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`[run-node-tests] 폴더가 없다: ${d}`);
    process.exit(2);
  }
  for (const f of readdirSync(d)) if (f.endsWith('.mjs')) files.push(path.join(d, f));
}
if (files.length === 0) {
  console.error(`[run-node-tests] 검사 파일이 0개: ${dirs.join(', ')}`);
  process.exit(2);
}
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
