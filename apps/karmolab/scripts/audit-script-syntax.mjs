/**
 * 도구 스크립트가 **읽히기는 하는가** — 밀기 전에 본다 (2026-08-17).
 *
 * 왜 생겼나: 주석 한 줄을 잘못 닫아 `gen-csp-shell.mjs` 가 통째로 안 읽히게 됐다.
 * 그 파일은 아무 검사도 불러 쓰지 않는다 — 그래서 로컬은 전부 초록이었고, **배포 검사가
 * 그것을 실제로 부르는 순간** 터졌다. verify 가 연달아 세 판 빨갛게 섰다.
 *
 * 여기 있는 `.mjs` 대부분이 그런 자리다: 어떤 것은 배포 뒤에만, 어떤 것은 한 달에 한 번만
 * 불린다. 「언젠가 부를 때 알게 되는」 것을 **미는 자리에서 지금 읽어** 끝낸다.
 *
 * 보는 것은 문법뿐이다(돌리지 않는다) — 파일을 실행하면 부수효과가 생기므로 읽기만 한다.
 * 읽는 도구는 이미 이 저장소가 쓰는 것(esbuild)이라 새로 들이는 짐이 없다.
 *
 * 나가는 값: 0 = 다 읽힌다 / 1 = 안 읽히는 파일이 있다 / 2 = 볼 파일이 없다(못 쟀다)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const redirect = new Set(['node_modules', 'dist', 'tmp', '.git']);

/** 이 앱이 `node` 로 직접 부르는 자리들 — 껍데기 안(`src/`)은 typecheck 가 본다. */
const targets = [path.join(root, 'scripts'), root];

const files = [];
function scan(dir, depth) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (redirect.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth > 0) scan(full, depth - 1); }
    else if (e.name.endsWith('.mjs')) files.push(full);
  }
}
scan(targets[0], 3);
for (const e of fs.readdirSync(root, { withFileTypes: true })) {
  if (e.isFile() && e.name.endsWith('.mjs')) files.push(path.join(root, e.name));
}

if (files.length < 50) {
  console.error(`[script-syntax] CANNOT-RUN: 볼 파일이 ${files.length}개뿐이다 — 자리가 옮겨졌는지 볼 것.`);
  console.error('[script-syntax]   이건 「다 읽힌다」가 아니라 **거의 안 봤다**는 뜻이다.');
  process.exit(2);
}

const broken = [];
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  try {
    /* 문법만 본다 — 옮기지도, 이름을 지우지도 않는다(그래야 「안 쓰는 것」이 사라지지 않는다). */
    esbuild.transformSync(content, { loader: 'js', format: 'esm', sourcefile: f });
  } catch (e) {
    const firstLine = (e.errors?.[0] ? `${e.errors[0].text} (${e.errors[0].location?.line}줄)` : String(e.message)).split('\n')[0];
    broken.push(`${path.relative(root, f).split(path.sep).join('/')} — ${firstLine}`);
  }
}

if (broken.length) {
  console.error(`[script-syntax] 안 읽히는 파일 ${broken.length}개 — 부르는 순간 그 자리가 통째로 죽는다:`);
  for (const b of broken) console.error('  - ' + b);
  process.exit(1);
}
console.log(`[script-syntax] 스크립트 ${files.length}개 — 전부 읽힌다.`);
