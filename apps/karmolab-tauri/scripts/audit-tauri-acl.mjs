#!/usr/bin/env node
/**
 * audit-tauri-acl.mjs — TASK-KL-040
 *
 * Tauri ACL 정합성 5-way cross-check:
 *   backend   = Rust #[tauri::command] fn names (src/**\/*.rs)
 *   handler   = tauri::generate_handler![...] in lib.rs
 *   perms     = commands.allow in permissions/**\/*.toml
 *
 * 검사 쌍:
 *   backend ∖ handler   → 정의됐지만 미등록 (dead fn)
 *   handler ∖ backend   → 등록됐지만 fn 없음 (cargo가 잡음)
 *   perms   ∖ backend   → 삭제된 fn의 잔재 permissions (KL-035 사고 원인)
 *   backend ∖ perms     → permissions 없는 command
 *   handler ∖ perms     → 등록됐지만 permissions 없음
 *
 * Exit 0 = clean. Exit 1 = mismatch.
 * 통합: verify.mjs § Tauri ACL audit 단계.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const srcDir  = resolve(__dir, '../src-tauri/src');
const permsDir = resolve(__dir, '../src-tauri/permissions');

// ─── helpers ─────────────────────────────────────────────────────────────────

function walkFiles(dir, ext) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full, ext));
    else if (entry.endsWith(ext)) out.push(full);
  }
  return out;
}

// ─── 1. backend: #[tauri::command] fn names ──────────────────────────────────

const backendFns = new Set();
for (const f of walkFiles(srcDir, '.rs')) {
  const text = readFileSync(f, 'utf8');
  // #[tauri::command] followed by ≤5 lines, then (pub)? (async)? fn <name>
  // Lazy {0,5}? prevents greedy jump over the target fn to a nearby non-command fn.
  // pub is optional: lib.rs module-level commands omit it.
  const re = /#\[tauri::command\][^\n]*\n(?:[^\n]*\n){0,5}?(?:pub )?(?:async )?fn (\w+)/g;
  for (const m of text.matchAll(re)) backendFns.add(m[1]);
}

// ─── 2. handler: generate_handler![...] names ────────────────────────────────

const libPath = join(srcDir, 'lib.rs');
const libText = readFileSync(libPath, 'utf8');
const handlerFns = new Set();
const handlerBlock = libText.match(/tauri::generate_handler!\s*\[([^\]]+)\]/s);
if (handlerBlock) {
  for (const m of handlerBlock[1].matchAll(/\b([a-z_][a-zA-Z0-9_]*)\b/g)) {
    handlerFns.add(m[1]);
  }
}

// ─── 3. perms: commands.allow entries from *.toml ────────────────────────────

const permFns = new Set();
for (const f of walkFiles(permsDir, '.toml')) {
  const text = readFileSync(f, 'utf8');
  // matchAll (not match) — one .toml can have multiple [[permission]] blocks
  for (const block of text.matchAll(/commands\.allow\s*=\s*\[([^\]]+)\]/sg)) {
    for (const m of block[1].matchAll(/"([a-z_][a-zA-Z0-9_]*)"/g)) permFns.add(m[1]);
  }
}

// ─── 4. cross-check ──────────────────────────────────────────────────────────

let failures = 0;

function diff(label, a, b) {
  const missing = [...a].filter(x => !b.has(x)).sort();
  if (missing.length === 0) return;
  console.error(`\n[acl-audit] FAIL — ${label} (${missing.length}개):`);
  for (const m of missing) console.error(`  - ${m}`);
  failures += missing.length;
}

diff('backend ∖ handler  (정의됐지만 generate_handler! 미등록)', backendFns, handlerFns);
diff('handler ∖ backend  (등록됐지만 fn 없음 — cargo가 잡아야 함)', handlerFns, backendFns);
diff('perms   ∖ backend  (삭제된 fn의 잔재 permissions — KL-035 사고 원인)', permFns, backendFns);
diff('backend ∖ perms    (command에 permissions 없음)', backendFns, permFns);
diff('handler ∖ perms    (등록됐지만 permissions 없음)', handlerFns, permFns);

if (failures === 0) {
  console.log(
    `[acl-audit] OK — backend:${backendFns.size} handler:${handlerFns.size} perms:${permFns.size} 모두 정합`,
  );
  process.exit(0);
} else {
  console.error(
    `\n[acl-audit] FAIL — ${failures}개 불일치. 신규 command: permissions/*.toml 동기화 필요.`,
  );
  process.exit(1);
}
