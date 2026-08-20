#!/usr/bin/env node
/**
 * **명령 등록이 반쪽만 올라갔나** — acl.toml ⟷ 실제 구현 대조 (2026-08-19).
 *
 * 왜 이게 필요한가 (하루에 세 번 당했다):
 *   `acl.toml` 에 이름을 한 줄 적으면 `build.rs` 가 그 이름으로 `generate_handler![…]` 를
 *   구워 낸다. 그래서 **이름만 있고 구현·연결이 없으면 앱이 통째로 컴파일 안 된다.**
 *   내 폴더에서는 늘 초록이다 — 파일이 거기 있으니까. 그런데 이 저장소는 세션 여럿이 한
 *   폴더를 같이 쓰고, 담을 때 **파일 목록을 손으로 준다**. 새 파일 하나를 빠뜨리면
 *   트렁크에만 반쪽이 올라가고, 그 사실은 25분짜리 릴리스가 죽고 나서야 보인다
 *   (2026-08-19: `ai_quota_*` 두 판 · `part_fetch`/`localdev_guess_repo_root` 한 판).
 *
 * 그래서 **커밋을 그대로 읽는다**(`KL_PUSH_SHA`) — 폴더가 아니라. 이게 핵심이다.
 * 검사는 순수 텍스트라 1초 안에 끝난다(카고 빌드 없음).
 *
 * 무엇을 보나 — 명령 하나가 살려면 셋 다 필요하다:
 *   ① `#[tauri::command]` 가 붙은 그 이름의 함수가 어딘가에 **있다**
 *   ② 그 파일이 `mod` 사슬로 **닿는다** (lib.rs → … → 그 파일)
 *   ③ 그 이름이 `lib.rs` 에서 **보인다** (`use …::{이름}`) — handler 는 맨이름을 부른다
 *   ④ 그 `mod` 가 `#[cfg(…)]` 뒤에 숨지 않았다 — 숨으면 **릴리스 빌드에서만** 사라진다
 *      (실제로 `mod desktop_login;` 이 `#[cfg(debug_assertions)]` 아래로 들어가 릴리스가 죽었다)
 *
 * 사용:
 *   node scripts/audit-acl-impl.mjs                      # 지금 작업 폴더
 *   KL_PUSH_SHA=<sha> node scripts/audit-acl-impl.mjs    # 그 커밋을 그대로
 * exit: 0 = 초록 · 1 = 반쪽이다(막아야 한다) · 2 = 못 돌림(빨강 아님)
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = dirname(dirname(fileURLToPath(import.meta.url))); // apps/karmolab-tauri
const REPO_ROOT = dirname(dirname(APP_ROOT));
const PREFIX = 'apps/karmolab-tauri/src-tauri';
const SHA = (process.env.KL_PUSH_SHA || '').trim();

/* 훅에서 물려받은 git 환경변수는 다른 저장소를 가리킬 수 있다 — 지우고 시작한다. */
const env = { ...process.env };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];

const cannotRun = (why) => {
  console.log(`[acl-impl] CANNOT-RUN — ${why}`);
  console.log('  못 돈 것은 빨강이 아니다 — 그냥 지나간다.');
  process.exit(2);
};

/* `git show` 는 없는 파일에 대해 stderr 로 떠든다 — 이 검사에서 「없다」는 정상 답이라 삼킨다. */
const git = (args) =>
  execFileSync('git', args, { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** 커밋(또는 폴더)에서 파일 하나 읽기. 없으면 null. */
function read(rel) {
  if (SHA) {
    try {
      return git(['show', `${SHA}:${PREFIX}/${rel}`]);
    } catch {
      return null;
    }
  }
  const abs = join(APP_ROOT, 'src-tauri', rel);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

/** 커밋(또는 폴더)의 `src/**.rs` 목록 (src-tauri 기준 상대경로). */
function listSources() {
  if (SHA) {
    return git(['ls-tree', '-r', '--name-only', SHA, `${PREFIX}/src/`])
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.endsWith('.rs'))
      .map((l) => l.slice(PREFIX.length + 1));
  }
  const out = [];
  const base = join(APP_ROOT, 'src-tauri', 'src');
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (name.endsWith('.rs')) out.push('src/' + relative(base, abs).split(sep).join('/'));
    }
  };
  if (existsSync(base)) walk(base);
  return out;
}

const acl = read('acl.toml');
if (!acl) cannotRun('acl.toml 을 못 읽었다');
const libRs = read('src/lib.rs');
if (!libRs) cannotRun('src/lib.rs 를 못 읽었다');

/** acl.toml 의 모든 `commands = [...]` 안 이름. 여러 줄에 걸쳐 적혀 있다. */
const commands = [];
for (const m of acl.matchAll(/commands\s*=\s*\[([\s\S]*?)\]/g)) {
  for (const q of m[1].matchAll(/"([a-zA-Z0-9_]+)"/g)) commands.push(q[1]);
}
if (!commands.length) cannotRun('acl.toml 에서 명령 이름을 못 찾았다 (형식이 바뀌었나)');

/** 파일 안의 `mod 이름;` 선언 → { 이름: cfg뒤에숨었나(그 줄) } */
function modsOf(text) {
  const out = new Map();
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^\s*(?:pub\s+)?mod\s+([a-zA-Z0-9_]+)\s*;/.exec(lines[i]);
    if (!m) continue;
    // 바로 위 줄이 `#[cfg(...)]` 면 그 mod 는 조건부다 — 릴리스에서 사라질 수 있다.
    const prev = (lines[i - 1] || '').trim();
    out.set(m[1], /^#\[cfg\(/.test(prev) ? prev : null);
  }
  return out;
}

/** `#[tauri::command]` 가 붙은 함수 이름 → 그 함수가 있는 파일 */
const definedIn = new Map();
for (const rel of listSources()) {
  const text = read(rel);
  if (!text) continue;
  const re = /#\[tauri::command[^\]]*\]\s*(?:\/\/[^\n]*\n\s*)*(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)/g;
  for (const m of text.matchAll(re)) definedIn.set(m[1], rel);
}

/** 파일이 `mod` 사슬로 닿는가. 안 닿으면 왜 안 닿는지 말한다. */
function reachable(rel) {
  // src/a/b/c.rs → ['a','b','c'] · src/a/mod.rs → ['a']
  let parts = rel.replace(/^src\//, '').replace(/\.rs$/, '').split('/');
  if (parts[parts.length - 1] === 'mod') parts = parts.slice(0, -1);
  if (!parts.length || (parts.length === 1 && parts[0] === 'lib')) return { ok: true };
  let holderText = libRs;
  let holderName = 'lib.rs';
  let prefix = 'src';
  for (const part of parts) {
    const mods = modsOf(holderText);
    if (!mods.has(part)) return { ok: false, why: `\`mod ${part};\` 가 ${holderName} 에 없다` };
    const cfg = mods.get(part);
    if (cfg) {
      return { ok: false, why: `\`mod ${part};\` 가 ${cfg} 뒤에 숨어 있다 — 릴리스 빌드에서만 사라진다` };
    }
    prefix = `${prefix}/${part}`;
    const next = read(`${prefix}/mod.rs`) ?? read(`${prefix}.rs`);
    if (!next) break; // 마지막 조각
    holderText = next;
    holderName = part;
  }
  return { ok: true };
}

const problems = [];
for (const name of commands) {
  const file = definedIn.get(name);
  if (!file) {
    problems.push(`${name} — \`#[tauri::command] fn ${name}\` 이 어디에도 없다 (구현 파일을 같이 담았나?)`);
    continue;
  }
  const r = reachable(file);
  if (!r.ok) {
    problems.push(`${name} — ${file} 에 있지만 닿지 않는다: ${r.why}`);
    continue;
  }
  // handler 는 맨이름을 부른다 → lib.rs 에서 그 이름이 보여야 한다(use 또는 자체 정의).
  if (!new RegExp(`\\b${name}\\b`).test(libRs)) {
    problems.push(`${name} — ${file} 에 있지만 lib.rs 가 안 들여온다 (\`use …::{${name}}\` 한 줄)`);
  }
}

const where = SHA ? `커밋 ${SHA.slice(0, 8)}` : '작업 폴더';
if (problems.length) {
  console.log(`[acl-impl] ❌ ${where} — 명령 ${problems.length}개가 반쪽이다 (앱이 통째로 안 굽는다):`);
  for (const p of problems) console.log(`  - ${p}`);
  console.log('  acl.toml 에 이름이 있으면 handler 가 그 이름을 부른다 — 구현·mod·use 셋이 다 있어야 한다.');
  process.exit(1);
}
console.log(`[acl-impl] OK — ${where}: 명령 ${commands.length}개 전부 구현·연결 확인`);
