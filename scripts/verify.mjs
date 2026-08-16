#!/usr/bin/env node
// master invariant 게이트 — 단일 진실.
// 호출처: `npm run verify` / `.github/workflows/verify.yml`.
//   ※ 예전엔 여기에 `.husky/pre-push` 도 적혀 있었다. **거짓이었다** — husky 는 설치돼
//     있지도 않고(`prepare` 스크립트·의존성 없음), 이 저장소의 `core.hooksPath` 는
//     `memo/dotfiles/git-hooks` 를 가리킨다. `.husky/` 안의 파일은 어떤 기계에서도
//     한 번도 안 돌았다. 그 폴더는 지웠고, 되살아나면 아래 검사가 막는다.
//   ※ push 때 실제로 도는 것 = `memo/dotfiles/git-hooks/pre-push`
//     (그 훅은 `apps/karmolab` 의 `verify:prepush` 를 부른다 — 이 파일 전체가 아니다).
// 정본: memo/UMBRELLA.md § 자동화 가능 룰은 코드로 — 텍스트 룰은 잊힌다.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function run(label, cwd, command) {
  console.log(`\n[verify] ${label}: ${command} (cwd: ${cwd})`);
  const r = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  /* ★ **2 = 「못 돌렸다」(CANNOT-RUN)** — 이 저장소의 규약이다(`run-gates.mjs`·`run-live-checks.mjs`
     도 그렇게 읽는다). 잴 것이 아직 없거나(봇이 안 떠 있다·장이 안 찍혔다) 이 기계에 없는 것은
     **실패가 아니다.** 여기만 「0이 아니면 실패」로 두었더니, 검사가 정직하게 「못 돌렸다」고
     말한 순간 master 가 빨개졌다(2026-08-14, `smoke-companion`). 못 돈 것은 못 돌았다고 적고 지나간다. */
  if (r.status === 2) {
    console.log(`[verify] · ${label} — 못 돌림 (빨강 아님)`);
    return;
  }
  if (r.status !== 0) {
    console.error(`[verify] X ${label} 실패 (exit ${r.status ?? '?'})`);
    console.error('[verify] 여기서 멈춘다 — **이 뒤의 검사는 안 돌았다.** 이 하나를 고치면 다음 것이 나온다.');
    console.error('[verify] 한 판에 다 보고 싶으면: cd apps/karmolab && npm run verify:prepush (게이트 열넷을 모아서 낸다)');
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

/* 게이트인 척하는 폴더를 막는다 (2026-08-13 시스템 리뷰).

   `.husky/pre-push` 는 「master 에 타입 오류 직접 push」 사고를 막으려고 만든 것인데,
   husky 가 설치된 적이 없어 **한 번도 안 돌았다**. 그런데 파일이 거기 있으니 사람도
   문서도 「게이트가 있다」고 믿었다. 검사기가 게이트에 안 걸려 있으면 없는 것과 같다
   (memo/rules/quality.md). 없는 것보다 나쁘다 — 있다고 믿게 만드니까.

   그래서 그 폴더를 지웠고, 누가 다시 만들면 여기서 세운다. 훅을 넣고 싶으면
   진짜 도는 자리(`core.hooksPath` 가 가리키는 곳)에 넣어야 한다. */
{
  const active = spawnSync('git config core.hooksPath', { shell: true, encoding: 'utf8' })
    .stdout?.trim() ?? '';
  const dead = existsSync('.husky')
    ? readdirSync('.husky').filter((f) => f !== '_' && f !== '.gitignore')
    : [];
  if (dead.length > 0 && !active.endsWith('.husky')) {
    console.error('[verify] X `.husky/` 에 훅이 있는데 git 은 그걸 안 본다 — 안 도는 게이트다');
    console.error(`[verify]   있는 파일: ${dead.join(', ')}`);
    console.error(`[verify]   git 이 실제로 보는 곳: ${active || '(설정 없음 -> .git/hooks)'}`);
    console.error('[verify]   훅을 넣으려면 그 자리에 넣어라. `.husky/` 는 지워라.');
    process.exit(1);
  }
}

// 0. 링크로 쓰는 꾸러미가 디스크에 있나 (TASK-KL-191).
//    `npm ci` 가 node_modules 안의 **Junction 을 따라 들어가** packages/ 의 진짜 소스를
//    지운다(윈도, `file:` 의존성). 커밋에는 남아 있으니 아무도 「지워졌다」고 안 보고,
//    대신 `Cannot find module 'karmolab-ai/node'` 가 스무 줄 떠서 **설치 문제로 오진**한다.
//    그러면 npm ci 를 한 번 더 돌리고 — 남은 것까지 지운다. 그 고리를 여기서 끊는다.
run('링크 꾸러미 실재', '.', 'node scripts/audit-linked-packages.mjs');

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

// 1.5. apps/discord-bots/apps/yawnbot — **karmolab build 보다 먼저** (2026-08-16).
//    순서가 뒤였을 때 무슨 일이 있었나: karmolab `build` 안에 `gates` 가 있고, 그 목록에
//    `test:chat` 이 있다. 그 시험은 yawnbot 의 `dist/` 를 읽는데, yawnbot build 는 한참
//    **뒤**에 있었다 — 그래서 `test:chat` 은 로컬에서도 CI 에서도 **한 번도 돈 적이 없다.**
//    「못 돌았다(CANNOT-RUN)」라고 정직하게 말하고 있었기 때문에 빨강도 아니었고,
//    그래서 아무도 안 봤다. 정직한 침묵도 몇 달 쌓이면 없는 검사와 같다.
//    고치는 자리는 시험이 아니라 **순서**다.
// 5. apps/discord-bots/apps/yawnbot — build (tsc 타입체크). yawnbot 이 master
//    invariant 밖이라 타입 깨는 PR 이 verify green 으로 통과 → prod 배포(deploy-
//    discord-bots) 가 build red 로 며칠 막혀도 안 보이던 사고(2026-06-07: GitHubCommit
//    중복 정의 + isTextBased send 가드, KL-091/096 머지가 노출) 재발 기계 차단.
//    루트 node_modules(workspace hoist) 있으면 실행 — verify 가 karmolab build 하므로 사실상 상존.
if (existsSync('node_modules') && existsSync('apps/discord-bots/apps/yawnbot/tsconfig.json')) {
  run('yawnbot build (tsc)', 'apps/discord-bots/apps/yawnbot', 'npx tsc -p tsconfig.json');
  /* 타입만 보면 **라우트가 통째로 사라진 것**은 안 잡힌다 (TASK-KL-153).
   * 실제로 그랬다: 한 세션이 `karmolab-api.ts` 를 통째로 덮어쓰면서 다른 세션이 넣은
   * 라우트 두 개가 조용히 없어졌고, 타입도 배포도 초록이었다 — 사람 화면에서만 404 였다.
   * 그 라우트를 찌르는 시험은 이미 있었는데 **아무 관문도 그걸 안 돌리고 있었다.**
   * 배포(노트북) 는 tsc 만 본다. 그래서 여기서 돈다. */
  run('yawnbot 시험 (라우트가 사라져도 잡히게)', 'apps/discord-bots/apps/yawnbot', 'npx vitest run');
} else {
  console.log('[verify] ! yawnbot build skip — node_modules/tsconfig 부재 (CI deploy-discord-bots 가 정본 게이트)');
}

// 2. apps/karmolab — build (typecheck 포함). karmolab-ai/dist 를 import.
//    이전 karmolab-ts.yml + ai-quality.yml karmolab-ai-surface 흡수.
requireDeps('apps/karmolab');
run('apps/karmolab build', 'apps/karmolab', 'npm run build');

// 2.0-b. **품질 래칫은 여기서 본다** (TASK-KL-203 S19).
//
// 부팅 예산·성능·새는 루프는 「제품이 고장났다」가 아니라 「더 나빠졌다」를 재는 것들이다.
// 그런데 배포 길목(`npm run build`)에 있어서, 어느 슬롯이 화면 하나를 실험하면 **사이트 전체가
// 몇 시간씩 안 나갔다**(2026-08-09: leak·boot·bundle 이 번갈아 배포를 세웠고 그동안 실서비스는
// 하루 종일 옛 판이었다). 막는 값어치보다 막힌 것의 값어치가 훨씬 컸다.
//
// 그래서 **여기(push 전 verify)** 로 옮긴다 — 고칠 사람이 고칠 자리에서 여전히 빨갛고,
// 사이트는 나간다.
run('apps/karmolab 품질 래칫 (부팅·성능·누수)', 'apps/karmolab', 'npm run verify:quality');

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
/* ★ **안 건드린 판에서는 건너뛴다** (2026-08-13, 실측). `cargo check` 는 캐시가 차면 20분이
   넘고, 그 판이 45분에 끊기면 **캐시를 저장하지도 못한다** — 다음 판도 차갑다. 그렇게 여섯
   판이 나란히 돌며 서로 CPU 를 빼앗아 **아무 판정도 안 나왔다**(오늘 오전 내내 판정 0).
   Rust 쪽은 며칠에 한 번 바뀌는데 값은 매 push 다. 그래서 그 자리가 이번 push 에 담겼을 때만
   재고, 시계(nightwatch)로 부른 판에서는 **늘** 잰다 — 안 본 채 지나가는 날이 없게. */
const tauriTouched = (() => {
  if (process.env.VERIFY_TAURI === 'always') return true;
  /* CI 는 **얕게** 받아 오므로 여기서 `git diff` 를 하면 옛 커밋이 없어 늘 「모른다」가 된다.
     그래서 판정은 워크플로가 서버에 물어 `skip` 으로 알려 준다(로컬은 아래 git 으로 본다). */
  if (process.env.VERIFY_TAURI === 'skip') {
    console.log('[verify] ! apps/karmolab-tauri 는 이번 판이 안 건드렸다 — cargo check 건너뜀 (시계 판이 늘 잰다)');
    return false;
  }
  const range = process.env.VERIFY_DIFF_RANGE;
  if (!range) return true; // 모르면 잰다 — 「모름」을 「안 건드림」으로 읽지 않는다
  const r = spawnSync('git', ['diff', '--name-only', range, '--', 'apps/karmolab-tauri'], { encoding: 'utf8' });
  if (r.status !== 0) return true;
  const touched = r.stdout.trim().length > 0;
  if (!touched) console.log('[verify] ! apps/karmolab-tauri 는 이번 판이 안 건드렸다 — cargo check 건너뜀 (시계 판이 늘 잰다)');
  return touched;
})();

if (tauriTouched && existsSync('apps/karmolab-tauri/src-tauri/Cargo.toml')) {
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

// 5.5. packages/companion — build + 단위 (TASK-KAR-201). 동반자 코어는 어떤 앱도
//      import 하지 않으므로, 관문에 안 걸어두면 깨져도 아무 빌드가 빨개지지 않는다
//      (= 조용히 죽는다). 자기 node_modules 를 갖는 독립 패키지라 있을 때만 실행.
if (existsSync('packages/companion/node_modules')) {
  run('packages/companion build+test', 'packages/companion', 'npm test');
} else {
  console.log('[verify] ! packages/companion skip — node_modules 부재 (cd packages/companion && npm ci)');
}

// 5.6. 「동반자」 위젯이 실제로 봇에 붙는지 (TASK-KAR-201 / KarmoLab 몸).
//      이 위젯의 값은 전부 다른 프로세스와의 경계(포트·CORS·응답 모양)에 있어서,
//      화면만 그려도 빌드·단위는 초록이다. 봇이 안 떠 있으면 스스로 건너뛴다 —
//      전제가 없는 것과 고장은 다르다.
run('동반자 위젯 ↔ 봇 (봇 없으면 skip)', 'apps/karmolab', 'node scripts/smoke-companion.mjs');

// 5.7. apps/daily — 「오늘의 하나 맞히기」 규칙 시험 (TASK-KAR-202). 의존성 0 이라
//      npm ci 도 필요 없다. 어떤 앱도 이걸 import 하지 않으므로 여기 안 걸면 규칙이
//      깨져도 아무 빌드가 안 빨개진다 — 매일 도는 물건이라 조용한 고장이 제일 나쁘다.
if (existsSync('apps/daily/engine.test.mjs')) {
  run('apps/daily 규칙 시험', 'apps/daily', 'node --test');
}

// 6. typos — CI 의 verify.yml 별 step (crate-ci/typos action) 이 책임. local 은 binary 미설치 가정 → skip.

console.log('\n[verify] OK — master invariant 통과');
