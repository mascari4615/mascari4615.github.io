#!/usr/bin/env node
// master invariant 게이트 — 단일 진실.
// 호출처: `npm run verify` / `.husky/pre-push` / `.github/workflows/verify.yml`.
// 정본: memo/UMBRELLA.md § 자동화 가능 룰은 코드로 — 텍스트 룰은 잊힌다.

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(label, cwd, command) {
  console.log(`\n[verify] ${label}: ${command} (cwd: ${cwd})`);
  const r = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`[verify] X ${label} 실패 (exit ${r.status ?? '?'})`);
    process.exit(r.status ?? 1);
  }
}

function requireDeps(sub) {
  if (!existsSync(`${sub}/node_modules`)) {
    console.error(`[verify] X ${sub}/node_modules 없음 — 'cd ${sub} && npm ci' 필요`);
    process.exit(1);
  }
}

console.log('[verify] master invariant 게이트 시작');

// 1. apps/karmolab — build (typecheck 포함). 이전 karmolab-ts.yml + ai-quality.yml karmolab-ai-surface 흡수.
requireDeps('apps/karmolab');
run('apps/karmolab build', 'apps/karmolab', 'npm run build');

// 2. packages/karmolab-ai — build. 이전 ai-quality.yml shared-ai-package-build 흡수.
if (existsSync('packages/karmolab-ai/node_modules')) {
  run('packages/karmolab-ai build', 'packages/karmolab-ai', 'npm run build');
} else {
  console.log('[verify] ! packages/karmolab-ai/node_modules 없음 — build skip (정합: cd packages/karmolab-ai && npm ci)');
}

// 3. apps/karmolab-tauri — cargo check. 이전 karmolab-tauri.yml 흡수.
//    PR #15 의 DOMAIN_DIRS private E0603 같은 사고 방지.
if (existsSync('apps/karmolab-tauri/src-tauri/Cargo.toml')) {
  run('apps/karmolab-tauri cargo check', 'apps/karmolab-tauri/src-tauri', 'cargo check --all-targets');
}

// 3.5. Tauri ACL audit — acl.toml 단일정본 ⟷ #[command] ⟷ caps 정합 (KL-040, KL-063).
//      KL-035 사고 원인(삭제 fn 잔재 permissions) 재발 방지. 정본 스크립트 =
//      scripts/tauri-acl-audit.mjs (`npm run acl-audit` 와 동일). master invariant
//      필수 게이트 — 무조건 실행 (KL-063: 옛 코드가 부재 경로 existsSync 가드로
//      이 게이트를 verify 에서 영구 skip 시키던 잠복 결함 수정).
if (existsSync('apps/karmolab-tauri/src-tauri/Cargo.toml')) {
  run('Tauri ACL audit', '.', 'node scripts/tauri-acl-audit.mjs');
}

// 3.6. Server Monitor 설정 정합 audit — devProfiles {app,script} ⟷ <app>/package.json
//      scripts 실재 cross-check (TASK-KL-066). `dev:dual`→`dev` rename 으로 카드가
//      조용히 죽은 사고 재발 방지. 필수 게이트 — 무조건 실행.
run('Server Monitor config audit', '.', 'node scripts/servermonitor-config-audit.mjs');

// 3.7. App origin 정합 + liveness audit (TASK-KL-064). prod 앱이 로드하는
//      URL(release conf frontendDist)을 정본으로, 흩어진 참조(base conf /
//      lib.rs 상수 / allow_in_webview / capabilities) 일치 + 그 URL 이
//      301/non-200 아닌지 cross-check. 도메인 이전 시 일부만 바뀌어 prod
//      빈화면 났던 사고(KL-064) 재발을 기계 차단. 필수 게이트.
if (existsSync('apps/karmolab-tauri/src-tauri/Cargo.toml')) {
  run('App origin audit', '.', 'node scripts/app-origin-audit.mjs');
}

// 4. apps/blog lint — chirpy v7.5.0 의 root config (eslint.config.js + .stylelintrc.json)
//    흡수 후 복원 (TASK-KL-031). node_modules 없으면 skip — pre-push 가 매번 npm ci 강요하면
//    개발 흐름 깨짐. CI 는 verify.yml 의 'Install blog deps' step 이 보장.
if (existsSync('apps/blog/node_modules')) {
  run('apps/blog lint:js', 'apps/blog', 'npm run lint:js');
  run('apps/blog lint:scss', 'apps/blog', 'npm run lint:scss');
} else {
  console.log('[verify] ! apps/blog/node_modules 없음 — lint skip (정합: cd apps/blog && npm ci)');
}

// 6. typos — CI 의 verify.yml 별 step (crate-ci/typos action) 이 책임. local 은 binary 미설치 가정 → skip.

console.log('\n[verify] OK — master invariant 통과');
