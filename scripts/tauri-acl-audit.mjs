#!/usr/bin/env node
// Tauri ACL 정합 audit — KL-040 (KL-063 재정식화: 4-source → 단일정본 cross-check).
// 사고 패턴: KL-035 life_screen_capture rename 사고 (release 3회 헛수고).
// 호출처: `node scripts/tauri-acl-audit.mjs` / `npm run verify` (verify.mjs).
//
// KL-063 이후 정본 구조:
//   acl.toml  = command ↔ permission-group 의 *유일 정본* (선언적 매니페스트).
//   build.rs  = acl.toml → generate_handler! include + permissions/_generated/*.toml 파생.
//   → handler / permission toml 은 *파생물* — 손으로 drift 불가 (codegen 결정적).
//
// 이 audit 는 *정본을 직접* 독립 검증한다 (파생물이 아니라 acl.toml + #[command] + caps).
// 파생물을 검증하면 codegen 버그를 못 잡으므로 의도적으로 정본을 본다.
// 또한 build.rs 산출물(_generated/, $OUT_DIR)에 비의존 → cargo build 선행 불요
// (CI 에서 cargo check 전에 돌아도 안전).
//
// 3 source:
//   backend  — #[tauri::command] fn names in src-tauri/src/**/*.rs (존재성 정본)
//   manifest — acl.toml 의 [[group]] commands / identifier (ACL 그룹 정본)
//   caps     — permission identifiers in src-tauri/capabilities/default.json
//
// cross-checks (모두 0 이어야 통과):
//   backend ∖ manifest   → 구현 있으나 어느 그룹에도 미배정 (ACL 호출 불가 — KL-035 사고)
//   manifest ∖ backend   → acl.toml 이 가리키는 command 의 #[command] 구현 없음
//                          (generate_handler! 파생 → 컴파일 실패 / stale ACL)
//   group_ids ∖ caps     → 그룹 정의됐으나 capabilities 미등록 (사문화 permission)
//
// 추가 회귀 가드: lib.rs 가 acl_handler.rs 를 include! 하는지 + 손수 작성
//   generate_handler![ 가 재도입되지 않았는지 (단일정본 구조 자체의 무결성).
//
// Note: caps → group_ids 역방향은 core:* / updater:* 등 외부 플러그인 ID 가
//   많아 false-positive 폭발 → audit 제외 (KL-040 과 동일 판단).

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../apps/karmolab-tauri/src-tauri');

// --- 1. backend commands (#[tauri::command]) ---
function parseBackendCommands() {
  const cmds = new Set();
  const srcDir = join(ROOT, 'src');
  function walkDir(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walkDir(full); continue; }
      if (!entry.name.endsWith('.rs')) continue;
      const src = readFileSync(full, 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim() === '#[tauri::command]') {
          for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
            const m = lines[j].match(/(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (m) { cmds.add(m[1]); break; }
          }
        }
      }
    }
  }
  walkDir(srcDir);
  return cmds;
}

// --- 2. acl.toml manifest (single source of truth) ---
// 가벼운 결정적 파서: [[group]] 블록의 identifier + commands 배열만 추출.
// (build-dependency `toml` 크레이트와 의미 동치 — 이 audit 은 Node-only 안전망.)
function parseManifest() {
  const manifestCmds = new Set();
  const groupIds = new Set();
  const path = join(ROOT, 'acl.toml');
  if (!existsSync(path)) {
    console.error(`[acl-audit] FAIL — acl.toml 부재: ${path}`);
    process.exit(1);
  }
  const src = readFileSync(path, 'utf8');
  // 주석(#) 제거 후 [[group]] 단위 분할.
  const noComments = src.replace(/^\s*#.*$/gm, '');
  const blocks = noComments.split(/\[\[group\]\]/).slice(1);
  for (const block of blocks) {
    const idM = block.match(/identifier\s*=\s*"([^"]+)"/);
    if (idM) groupIds.add(idM[1]);
    const cmdM = block.match(/commands\s*=\s*\[([\s\S]*?)\]/);
    if (cmdM) {
      for (const item of cmdM[1].matchAll(/"([^"]+)"/g)) manifestCmds.add(item[1]);
    }
  }
  return { manifestCmds, groupIds };
}

// --- 3. capability permission identifiers ---
function parseCapsPermIds() {
  const ids = new Set();
  const capDir = join(ROOT, 'capabilities');
  if (!existsSync(capDir)) return ids;
  for (const entry of readdirSync(capDir, { withFileTypes: true })) {
    if (!entry.name.endsWith('.json')) continue;
    const full = join(capDir, entry.name);
    try {
      const json = JSON.parse(readFileSync(full, 'utf8'));
      for (const perm of (json.permissions ?? [])) {
        if (typeof perm === 'string') ids.add(perm);
      }
    } catch { /* skip malformed */ }
  }
  return ids;
}

// --- 4. 단일정본 구조 무결성 (lib.rs 가 파생 handler 를 include 하는지) ---
function structuralGuards() {
  const problems = [];
  const libPath = join(ROOT, 'src', 'lib.rs');
  if (!existsSync(libPath)) return ['src/lib.rs 부재'];
  const lib = readFileSync(libPath, 'utf8');
  if (!lib.includes('include!(concat!(env!("OUT_DIR"), "/acl_handler.rs"))')) {
    problems.push('lib.rs 가 acl_handler.rs include 안 함 — 단일정본 핸들러 파생 미연결');
  }
  // 주석 제거 후 판정 (주석 속 generate_handler! 언급 오탐 방지).
  const libNoComments = lib
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  if (/generate_handler!\s*\[/.test(libNoComments)) {
    problems.push('lib.rs 에 손수 generate_handler![ 재도입됨 — acl.toml 단일정본 위반 (KL-063)');
  }
  return problems;
}

// --- diff helper ---
function diff(a, b) {
  return [...a].filter(x => !b.has(x)).sort();
}

// --- main ---
const backend = parseBackendCommands();
const { manifestCmds, groupIds } = parseManifest();
const capsIds = parseCapsPermIds();

const checks = [
  { label: 'backend ∖ manifest  (구현 있으나 acl.toml 그룹 미배정 — KL-035 사고 패턴)',
    items: diff(backend, manifestCmds) },
  { label: 'manifest ∖ backend  (acl.toml 이 가리키는 #[command] 구현 없음 — 컴파일/stale)',
    items: diff(manifestCmds, backend) },
  { label: 'group_ids ∖ caps    (그룹 정의됐으나 capabilities 미등록 — 사문화 permission)',
    items: diff(new Set([...groupIds].filter(id => !id.startsWith('deny-'))), capsIds) },
];

let failed = false;
for (const { label, items } of checks) {
  if (items.length === 0) {
    console.log(`[acl-audit] OK  ${label}`);
  } else {
    console.error(`[acl-audit] X  ${label}`);
    for (const item of items) console.error(`             - ${item}`);
    failed = true;
  }
}

const structural = structuralGuards();
if (structural.length === 0) {
  console.log('[acl-audit] OK  단일정본 구조 무결성 (lib.rs include! + 손수 handler 부재)');
} else {
  console.error('[acl-audit] X  단일정본 구조 무결성');
  for (const p of structural) console.error(`             - ${p}`);
  failed = true;
}

if (failed) {
  console.error('\n[acl-audit] FAIL — ACL mismatch detected. Fix before push.');
  process.exit(1);
} else {
  console.log('\n[acl-audit] OK — ACL 정합 확인 (acl.toml 단일정본 ⟷ #[command] ⟷ caps)');
}
