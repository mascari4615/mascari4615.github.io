#!/usr/bin/env node
/**
 * 이번 판의 앱 바이너리가 지난 판과 다른가를 **내용으로** 답한다 (TASK-KL-064 후속).
 *
 * 왜 이게 있나. 릴리스 워크플로는 `apps/karmolab-tauri/**` 가 바뀌면 무조건 돈다.
 * 그 넓은 그물은 일부러 친 것이다(좁혔다가 프론트엔 있는데 앱엔 없는 command 스큐가
 * 세 번 났다). 그런데 그물이 넓으니 **주석 한 줄, 문서 한 줄에도 25~30분짜리 빌드**가 돈다.
 *
 * 좁히면 스큐가 돌아오고, 놔두면 헛빌드가 남는다. 둘 다 안 고르는 길이 이 파일이다:
 * 바이너리에 실제로 들어가는 입력만 모아 해시를 낸다. 지난 릴리스의 해시와 같으면
 * **바이너리도 같다** → 빌드를 건너뛰어도 스큐가 원리적으로 생기지 않는다.
 *
 * 판 번호(version)는 릴리스마다 자동으로 오르므로 해시에서 뺀다. 안 빼면 똑같은 코드가
 * 매번 다른 해시가 되어 이 게이트가 영원히 안 걸린다.
 *
 * 사용:
 *   node scripts/contract-hash.mjs            → 해시 한 줄
 *   node scripts/contract-hash.mjs --list     → 무엇을 봤는지 (파일별 해시)
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // apps/karmolab-tauri

/** 바이너리에 들어가는 것만. 문서, README, 이 스크립트가 아닌 잡스크립트는 안 본다. */
const INCLUDE = [
  'Cargo.toml', // 워크스페이스 = [profile.release] (lto, codegen-units) 가 여기 있다
  'Cargo.lock',
  'package.json', // tauri CLI 판, 빌드 스크립트
  'package-lock.json',
  'scripts/build-sidecar.mjs',
  'src-tauri/src',
  'src-tauri/build.rs',
  'src-tauri/Cargo.toml',
  'src-tauri/acl.toml',
  'src-tauri/capabilities',
  'src-tauri/permissions',
  'src-tauri/icons',
  'src-tauri/tauri.conf.json',
  'src-tauri/tauri.release.conf.json',
  'src-tauri-shared',
  'src-tauri-ml',
];

/** 안 보는 것. 만들어지는 것(파생물)과 무거운 잡동사니. */
const SKIP_DIR = new Set(['target', 'node_modules', 'gen', '_generated', 'binaries']);

function walk(abs, out) {
  const st = statSync(abs);
  if (st.isFile()) {
    out.push(abs);
    return;
  }
  for (const name of readdirSync(abs).sort()) {
    if (SKIP_DIR.has(name)) continue;
    walk(join(abs, name), out);
  }
}

/**
 * 판 번호를 지운다. 릴리스가 스스로 올리는 값이라, 이게 남아 있으면 코드는 그대로인데
 * 해시만 다른 상태가 매판 생긴다 = 게이트가 죽은 것과 같다.
 *
 * Cargo.lock 은 **우리 패키지의 판 번호만** 지운다. 남의 라이브러리 판이 바뀌면 그건
 * 진짜로 다른 바이너리다.
 */
function normalize(rel, raw) {
  let text = raw.replace(/\r\n/g, '\n');
  if (rel === 'Cargo.lock') {
    return text.replace(
      /(name = "(?:karmolab[\w-]*|companion[\w-]*)"\nversion = )"[^"]*"/g,
      '$1"<판>"',
    );
  }
  if (rel.endsWith('package.json') || rel.endsWith('.conf.json')) {
    return text.replace(/("version"\s*:\s*)"[^"]*"/, '$1"<판>"');
  }
  if (rel.endsWith('Cargo.toml')) {
    return text.replace(/^(version\s*=\s*)"[^"]*"/m, '$1"<판>"');
  }
  return text;
}

const files = [];
for (const entry of INCLUDE) {
  const abs = join(APP_ROOT, entry);
  if (!existsSync(abs)) continue; // 없는 자리는 조용히 건너뛴다 (구조가 바뀌어도 안 죽는다)
  walk(abs, files);
}
files.sort();

const total = createHash('sha256');
const rows = [];
for (const abs of files) {
  const rel = relative(APP_ROOT, abs).split(sep).join('/');
  const one = createHash('sha256').update(normalize(rel, readFileSync(abs, 'utf8'))).digest('hex');
  total.update(`${rel}\n${one}\n`);
  rows.push(`${one.slice(0, 12)}  ${rel}`);
}

if (process.argv.includes('--list')) {
  for (const row of rows) console.log(row);
  console.log(`--- ${files.length}개 파일`);
}
console.log(total.digest('hex'));
