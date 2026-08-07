#!/usr/bin/env node
// master invariant 게이트 — 단일 진실.
// 호출처: `npm run verify` / `.husky/pre-push` / `.github/workflows/verify.yml`.
// 정본: memo/UMBRELLA.md § 자동화 가능 룰은 코드로 — 텍스트 룰은 잊힌다.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// 1. packages/karmolab-ai — build *먼저* (apps/karmolab 의 의존성, dist 가
//    있어야 import 해소). 이전 ai-quality.yml shared-ai-package-build 흡수.
//    TASK-KAR-MASTER-RED (5/19~ 6+연속 RED 진단): 순서가 거꾸로면 apps/karmolab
//    build 가 karmolab-ai/dist 부재로 "Could not resolve" RED. workspace
//    hoist 환경에서 packages/karmolab-ai/node_modules 가 별도로 안 만들어질
//    수 있어 guard 는 dist 부재 체크로 변경(silent skip 차단).
if (!existsSync('packages/karmolab-ai/dist')) {
  run('packages/karmolab-ai build', 'packages/karmolab-ai', 'npm run build');
} else {
  console.log('[verify] ! packages/karmolab-ai/dist 존재 — build skip (이미 빌드됨)');
}

// 2. apps/karmolab — build (typecheck 포함). karmolab-ai/dist 를 import.
//    이전 karmolab-ts.yml + ai-quality.yml karmolab-ai-surface 흡수.
requireDeps('apps/karmolab');
run('apps/karmolab build', 'apps/karmolab', 'npm run build');

// 2.1. 도구 페이지가 앱 셸과 갈라졌는지 (KL-097).
//    도구 상세 127장은 index.html 에서 **만들어진 것**이다. 단일 출처는 이미 있는데,
//    셸을 고치고 다시 안 찍어도 아무도 안 잡았다 — 실제로 인트로 규칙과 브랜드 글자 규칙을
//    고친 날 125장이 옛 셸인 채로 남아 있었다. 페이지가 멀쩡히 열려서 눈으로는 안 보인다.
//    임시 자리에 다시 만들어 대조한다(작업 트리를 안 건드리고, 남의 미커밋 변경도 안 잡는다).
run('도구 페이지 최신 여부', 'apps/karmolab', 'node scripts/audit-tool-pages-fresh.mjs');

// 2.5. 인라인 이벤트 핸들러 TS 문법 게이트 (KL-120 회귀 차단).
//    HTML 템플릿 문자열 안의 `onclick="..."` 은 tsc/esbuild 가 *문자열*로만 보고
//    통과시킨다 → `onclick="(window as any)._cb.send()"` 같은 게 그대로 브라우저에
//    실려 클릭 시 SyntaxError = 버튼 무반응. 2026-06 `:any` 일괄 제거 패스가 정규식으로
//    HTML 문자열까지 치환해 챗봇 전송·이미지생성 생성 등 15개 버튼을 죽였고,
//    typecheck·build 어느 게이트도 이를 못 잡았다. 빌드 산출물을 직접 훑어 차단한다.
{
  const TS_ONLY = /\bon[a-z]+="[^"]*\b(?:as any|as unknown|as HTML[A-Za-z]*|as string|as number)\b/;
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'vendor') walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (TS_ONLY.test(line)) hits.push(`${p}:${i + 1}`);
      });
    }
  };
  if (existsSync('apps/karmolab/js')) walk('apps/karmolab/js');
  if (hits.length) {
    console.error(`[verify] X 인라인 핸들러에 TS 전용 문법 ${hits.length}건 — 브라우저에서 SyntaxError 로 버튼이 죽는다:`);
    hits.forEach((h) => console.error(`  ${h}`));
    console.error('[verify]   HTML 문자열 안에서는 캐스트를 빼라 (예: onclick="window._cb.send()").');
    process.exit(1);
  }
  console.log('[verify] OK 인라인 핸들러 TS 문법 0건');
}

// 2.9. Tauri externalBin host-triple placeholder 보장 (TASK-KAR-073 / KL-052 회귀 fix).
//      tauri.conf.json `externalBin: ["binaries/karmolab-life-ml"]` 은 sidecar 를
//      host target-triple suffix 로 resolve 한다. tauri-build(build.rs) 가
//      *cargo check 단계에서도* 그 경로 존재를 검증 → Linux CI 엔 Linux triple
//      바이너리가 없어 "resource path ... doesn't exist" 로 master invariant 가
//      2일간 red (KL-052-B2-1 1fd31c61 이 externalBin 추가 시 Windows .exe 만 커밋).
//      워크스페이스 설계 의도 = "verify 는 무거운 ML sidecar 를 빌드 X (src-tauri
//      member 만 check)". 그 의도 유지하면서 externalBin 존재 검증만 통과시키려면
//      host triple placeholder 만 보장하면 충분 — cargo check 는 번들 X 라 빈
//      파일이면 됨 (실 바이너리는 tauri build/bundle 시 sidecar 빌드가 생성).
function ensureTauriSidecarPlaceholder() {
  const tauriRoot = 'apps/karmolab-tauri/src-tauri';
  const v = spawnSync('rustc', ['-vV'], { encoding: 'utf8' });
  if (v.status !== 0) {
    // Rust toolchain 부재 = env 차이 (bot prod 노트북, Rust 미설치 등). CI 가
    // 진짜 정본 게이트 (CI 환경엔 항상 rustc) → 로컬/봇 env 에선 skip 으로
    // graceful, push 자체는 허용. autopilot/봇 워커가 hook 우회(--no-verify)
    // 안 써도 push 가능해짐 (KAR-018-PUSH-CLOSURE, 2026-05-21 prod 진단).
    return { skipped: true, reason: 'Rust toolchain 없음 (rustc -vV 실패)' };
  }
  const triple = (v.stdout.match(/^host:\s*(.+)$/m) || [])[1]?.trim();
  if (!triple) {
    return { skipped: true, reason: 'rustc host triple 파싱 실패' };
  }
  const ext = triple.includes('windows') ? '.exe' : '';
  const binDir = `${tauriRoot}/binaries`;
  const binPath = `${binDir}/karmolab-life-ml-${triple}${ext}`;
  if (!existsSync(binPath)) {
    mkdirSync(binDir, { recursive: true });
    writeFileSync(binPath, ''); // existence-only — cargo check 는 번들 X
    console.log(`[verify] ! tauri externalBin placeholder 생성: ${binPath} (host=${triple}, KAR-073)`);
  }
  return { skipped: false };
}

// 3. apps/karmolab-tauri — cargo check. 이전 karmolab-tauri.yml 흡수.
//    PR #15 의 DOMAIN_DIRS private E0603 같은 사고 방지.
//    rustc 부재 env (봇 prod 노트북 등) = graceful skip + CI 가 정본 게이트.
if (existsSync('apps/karmolab-tauri/src-tauri/Cargo.toml')) {
  const placeholder = ensureTauriSidecarPlaceholder();
  if (placeholder.skipped) {
    console.log(`[verify] ! apps/karmolab-tauri cargo check skip — ${placeholder.reason}. CI 가 정본 게이트.`);
  } else {
    run('apps/karmolab-tauri cargo check', 'apps/karmolab-tauri/src-tauri', 'cargo check --all-targets');
  }
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

// 5. apps/discord-bots/apps/yawnbot — build (tsc 타입체크). yawnbot 이 master
//    invariant 밖이라 타입 깨는 PR 이 verify green 으로 통과 → prod 배포(deploy-
//    discord-bots) 가 build red 로 며칠 막혀도 안 보이던 사고(2026-06-07: GitHubCommit
//    중복 정의 + isTextBased send 가드, KL-091/096 머지가 노출) 재발 기계 차단.
//    루트 node_modules(workspace hoist) 있으면 실행 — verify 가 karmolab build 하므로 사실상 상존.
if (existsSync('node_modules') && existsSync('apps/discord-bots/apps/yawnbot/tsconfig.json')) {
  run('yawnbot build (tsc)', 'apps/discord-bots/apps/yawnbot', 'npx tsc -p tsconfig.json');
} else {
  console.log('[verify] ! yawnbot build skip — node_modules/tsconfig 부재 (CI deploy-discord-bots 가 정본 게이트)');
}

// 5.5. packages/companion — build + 단위 (TASK-KAR-201). 동반자 코어는 어떤 앱도
//      import 하지 않으므로, 관문에 안 걸어두면 깨져도 아무 빌드가 빨개지지 않는다
//      (= 조용히 죽는다). 자기 node_modules 를 갖는 독립 패키지라 있을 때만 실행.
if (existsSync('packages/companion/node_modules')) {
  run('packages/companion build+test', 'packages/companion', 'npm test');
} else {
  console.log('[verify] ! packages/companion skip — node_modules 부재 (cd packages/companion && npm ci)');
}

// 5.7. apps/daily — 「오늘의 하나 맞히기」 규칙 시험 (TASK-KAR-202). 의존성 0 이라
//      npm ci 도 필요 없다. 어떤 앱도 이걸 import 하지 않으므로 여기 안 걸면 규칙이
//      깨져도 아무 빌드가 안 빨개진다 — 매일 도는 물건이라 조용한 고장이 제일 나쁘다.
if (existsSync('apps/daily/engine.test.mjs')) {
  run('apps/daily 규칙 시험', 'apps/daily', 'node --test');
}

// 6. typos — CI 의 verify.yml 별 step (crate-ci/typos action) 이 책임. local 은 binary 미설치 가정 → skip.

console.log('\n[verify] OK — master invariant 통과');
