#!/usr/bin/env node
/**
 * Tauri ACL audit — KarmoLab (TASK-KL-040)
 *
 * 4-source cross-check:
 *   A. backend   — #[tauri::command] fn names in src-tauri/src/**
 *   B. handler   — generate_handler![...] in lib.rs
 *   C. perms     — permissions/**/*.toml commands.allow
 *   D. caps      — capabilities/default.json permissions (custom only, skip core:/updater:)
 *
 * Checks:
 *   A − B  dead backend fn (defined but not registered)
 *   B − A  phantom in handler (would cause compile error)
 *   B − C  handler fn not covered by any permission (ACL gap ← KL-035 사고 원인)
 *   C − B  stale permission command (not in handler)
 *   allow-IDs − D  permission identifier not in capabilities
 *
 * Usage: node scripts/audit-acl.mjs [--path <src-tauri-dir>]
 * Exit:  0 = clean, 1 = mismatch found
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Allow override for testing from a different CWD
const args = process.argv.slice(2);
const pathIdx = args.indexOf('--path');
const TAURI = pathIdx >= 0 ? args[pathIdx + 1] : join(__dir, '..', 'src-tauri');

// ─── helpers ──────────────────────────────────────────────────────────────────────────

function read(p) {
  try { return readFileSync(p, 'utf8'); }
  catch { return ''; }
}

function walkFiles(dir, ext, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) walkFiles(f, ext, out);
    else if (e.name.endsWith(ext)) out.push(f);
  }
  return out;
}

// ─── A: #[tauri::command] fn names in backend ───────────────────────────────────────────

function collectBackend(srcDir) {
  const cmds = new Set();
  for (const f of walkFiles(srcDir, '.rs')) {
    const lines = read(f).split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('#[tauri::command]')) continue;
      // look ahead up to 8 lines for `fn name`
      for (let j = i + 1; j < Math.min(i + 9, lines.length); j++) {
        const ln = lines[j].trim();
        const m = ln.match(/^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/);
        if (m) { cmds.add(m[1]); break; }
        // stop if we hit another attribute or a non-fn declaration
        if (ln.startsWith('#[') || /^(?:pub\s+)?(?:struct|impl|mod|use|type)\b/.test(ln)) break;
      }
    }
  }
  return cmds;
}

// ─── B: generate_handler![...] ───────────────────────────────────────────────────────────────

function collectHandler(libRs) {
  const m = libRs.match(/generate_handler!\s*\[\s*([\s\S]*?)\s*\]/);
  if (!m) return new Set();
  const cmds = new Set();
  for (const raw of m[1].split(',')) {
    const name = raw.replace(/\/\/.*$/, '').trim();
    if (name) cmds.add(name);
  }
  return cmds;
}

// ─── C: permissions *.toml commands.allow ────────────────────────────────────────────────

function collectPerms(permDir) {
  const cmds = new Set();
  const ids  = new Set();
  for (const f of walkFiles(permDir, '.toml')) {
    const text = read(f);
    for (const m of text.matchAll(/^identifier\s*=\s*"([^"]+)"/gm)) ids.add(m[1]);
    for (const block of text.matchAll(/commands\.allow\s*=\s*\[([\s\S]*?)\]/g)) {
      for (const raw of block[1].split(',')) {
        const name = raw.trim().replace(/^"/,'').replace(/"$/,'').trim();
        if (name) cmds.add(name);
      }
    }
  }
  return { cmds, ids };
}

// ─── D: capabilities/default.json (custom permissions only) ─────────────────────────

function collectCaps(capFile) {
  try {
    const { permissions = [] } = JSON.parse(read(capFile));
    return new Set(permissions.filter(p => !p.includes(':')));
  } catch { return new Set(); }
}

// ─── diff report ────────────────────────────────────────────────────────────────────────

function diff(label, a, b) {
  const missing = [...a].filter(x => !b.has(x)).sort();
  if (missing.length) {
    console.error(`\n❌  ${label} (${missing.length}):`);
    for (const x of missing) console.error(`    - ${x}`);
  }
  return missing.length;
}

// ─── main ──────────────────────────────────────────────────────────────────────────────

const A = collectBackend(join(TAURI, 'src'));
const B = collectHandler(read(join(TAURI, 'src', 'lib.rs')));
const { cmds: C, ids: permIds } = collectPerms(join(TAURI, 'permissions'));
const D = collectCaps(join(TAURI, 'capabilities', 'default.json'));

// deny-* identifiers are never added to capabilities — exclude from caps check
const allowIds = new Set([...permIds].filter(id => !id.startsWith('deny-')));

console.log('=== Tauri ACL audit ===');
console.log(`A  backend #[tauri::command] : ${A.size}`);
console.log(`B  generate_handler!         : ${B.size}`);
console.log(`C  permissions commands.allow: ${C.size}`);
console.log(`D  capabilities (custom)     : ${D.size}`);
console.log(`   permission identifiers    : ${permIds.size} (${allowIds.size} allow)`);

let errs = 0;
errs += diff('A − B  dead backend fn (defined but not in handler)', A, B);
errs += diff('B − A  phantom in handler (should cause compile error)', B, A);
errs += diff('B − C  handler fn not in any permission (ACL gap ← KL-035 사고 원인)', B, C);
errs += diff('C − B  stale permission command (old remnant)', C, B);
errs += diff('allow-IDs − D  identifier not in capabilities/default.json', allowIds, D);

if (errs === 0) {
  console.log('\n✅  All checks passed — ACL consistent.');
  process.exit(0);
} else {
  console.error(`\n❌  ${errs} check(s) failed — fix before pushing.`);
  process.exit(1);
}
