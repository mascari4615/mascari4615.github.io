#!/usr/bin/env node
// main invariant 게이트 — 단일 진실.
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

/* ★ **어디까지 왔는지 모르면 고칠 값어치를 못 잰다** (2026-08-16). 여기는 첫 빨강에서 멈춘다 —
   그건 옳다(뒤 단계가 앞 단계 산출물을 쓴다). 그런데 로그에는 「멈췄다」만 있고 **몇 번째에서**
   **멈췄는지**가 없었다. 2번째에서 멈춘 것과 8번째에서 멈춘 것은 남은 값이 전혀 다르다 —
   앞이면 한 판을 통째로 다시 돌려야 하고, 뒤면 거의 다 본 것이다. 숫자를 적어 그 판단을 준다. */
const totalSteps = 12;
let currentStep = 0;

/* ★ **어디서 오래 걸리는지 아무도 몰랐다** (2026-08-19). 「verify 기네」는 매번 나오는데
   단계별 시간을 안 재니 손대야 할 자리를 짐작으로 골랐다 — 한 번 틀렸다(npm 껍데기가
   범인인 줄 알았으나 재 보니 9%였고, 진짜는 검사 하나가 27%였다).
   그래서 단계마다 시간을 적고 끝에 표로 낸다. 재는 값이 있어야 다음 손댈 곳이 정해진다. */
const stepTimes = [];
function schedule() {
  if (stepTimes.length === 0) return;
  const total = stepTimes.reduce((n, x) => n + x.sec, 0);
  console.log(`
[verify] ==== 단계별 시간 (합계 ${total}초) ====`);
  for (const x of [...stepTimes].sort((a, b) => b.sec - a.sec)) {
    console.log(`  ${String(x.sec).padStart(4)}s  ${Math.round((x.sec / Math.max(1, total)) * 100).toString().padStart(3)}%  ${x.label}`);
  }
}

function run(label, cwd, command) {
  currentStep += 1;
  console.log(`\n[verify] (${currentStep}/${totalSteps}) ${label}: ${command} (cwd: ${cwd})`);
  const start = Date.now();
  const r = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  stepTimes.push({ label, sec: Math.round((Date.now() - start) / 1000) });
  /* ★ **2 = 「못 돌렸다」(CANNOT-RUN)** — 이 저장소의 규약이다(`run-gates.mjs`·`run-live-checks.mjs`
     도 그렇게 읽는다). 잴 것이 아직 없거나(봇이 안 떠 있다·장이 안 찍혔다) 이 기계에 없는 것은
     **실패가 아니다.** 여기만 「0이 아니면 실패」로 두었더니, 검사가 정직하게 「못 돌렸다」고
     말한 순간 main 이 빨개졌다(2026-08-14, `smoke-companion`). 못 돈 것은 못 돌았다고 적고 지나간다. */
  if (r.status === 2) {
    console.log(`[verify] · ${label} — 못 돌림 (빨강 아님)`);
    return;
  }
  if (r.status !== 0) {
    console.error(`[verify] X ${label} 실패 (exit ${r.status ?? '?'})`);
    console.error(`[verify] 여기서 멈춘다 — **뒤의 ${totalSteps - currentStep}단계는 안 돌았다**(${currentStep}/${totalSteps}). 이 하나를 고치면 다음 것이 나온다.`);
    console.error('[verify] 한 판에 다 보고 싶으면: cd apps/karmolab && npm run verify:prepush (게이트 열넷을 모아서 낸다)');
    schedule();
    process.exit(r.status ?? 1);
  }
}

function requireDeps(sub) {
  if (!existsSync(`${sub}/node_modules`)) {
    console.error(`[verify] X ${sub}/node_modules 없음 — 'cd ${sub} && npm ci' 필요`);
    process.exit(1);
  }
}

console.log('[verify] main invariant 게이트 시작');

/* 게이트인 척하는 폴더를 막는다 (2026-08-13 시스템 리뷰).

   `.husky/pre-push` 는 「main 에 타입 오류 직접 push」 사고를 막으려고 만든 것인데,
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

// 0.5. 공급망 — **설치만 해도 도는 남의 코드**와 알려진 취약점 (2026-08-16).
//    karmolab 안에만 세웠다가 재 보니 yawnbot 쪽 면이 훨씬 넓었다(292개 중 4개 vs 46개 중 1개).
//    좁은 곳만 지키는 문지기는 지키는 척이다. 저장소 자리로 올려 두 작업 공간을 함께 본다.
run('공급망 (설치 스크립트·취약점)', '.', 'node scripts/audit-deps-supplychain.mjs');

/* ★ **식별자는 영문** — 늘면 여기서 막는다 (2026-08-20).
   룰이 문서에만 있으면 안 지켜진다. 실제로 세션 하나가 「주변 코드를 따르라」는 일반 지침을
   따르다 한글로 이름을 지었다. 존량이 만 곳대라 0 을 요구하면 오늘 모든 push 가 막히므로
   **래칫**으로 둔다 — 늘면 빨강, 줄면 초록. 0 이 되면 그때부터 그냥 하나라도 있으면 빨강이다.
   앞자리에 두는 이유: 몇 초면 끝나고, 빌드보다 먼저 알려 주는 편이 고치기 싸다. */
run('식별자는 영문 (래칫)', '.', 'node scripts/audit-identifier-lang.mjs');

// 1. packages/ai (`@karmo/ai`) — build *먼저* (apps/karmolab 의 의존성, dist 가
//    있어야 import 해소). 이전 ai-quality.yml shared-ai-package-build 흡수.
//    TASK-KAR-MASTER-RED (5/19~ 6+연속 RED 진단): 순서가 거꾸로면 apps/karmolab
//    build 가 ai/dist 부재로 "Could not resolve" RED. workspace
//    hoist 환경에서 packages/ai/node_modules 가 별도로 안 만들어질
//    수 있어 guard 는 dist 부재 체크로 변경(silent skip 차단).
// ★ **경로는 이름 이관을 따라간다** (2026-08-23). `karmolab-ai` → `ai` 이관에서 여기가
//   안 따라와, 없는 폴더를 부르며 verify 가 4초 만에 죽었다 — 검사 여덟이 통째로 안 돌았다.
//   내 기계에는 옛 폴더가 잔재로 남아 초록이라 안 보였다(추적 파일 0 = git 엔 없다).
if (!existsSync('packages/ai/dist')) {
  run('packages/ai build', 'packages/ai', 'npm run build');
} else {
  console.log('[verify] ! packages/ai/dist 존재 — build skip (이미 빌드됨)');
}

// 1.5. apps/discord-bots/apps/yawnbot — **karmolab build 보다 먼저** (2026-08-16).
//    순서가 뒤였을 때 무슨 일이 있었나: karmolab `build` 안에 `gates` 가 있고, 그 목록에
//    `test:chat` 이 있다. 그 시험은 yawnbot 의 `dist/` 를 읽는데, yawnbot build 는 한참
//    **뒤**에 있었다 — 그래서 `test:chat` 은 로컬에서도 CI 에서도 **한 번도 돈 적이 없다.**
//    「못 돌았다(CANNOT-RUN)」라고 정직하게 말하고 있었기 때문에 빨강도 아니었고,
//    그래서 아무도 안 봤다. 정직한 침묵도 몇 달 쌓이면 없는 검사와 같다.
//    고치는 자리는 시험이 아니라 **순서**다.
// 5. apps/discord-bots/apps/yawnbot — build (tsc 타입체크). yawnbot 이 main
//    invariant 밖이라 타입 깨는 PR 이 verify green 으로 통과 → prod 배포(deploy-
//    discord-bots) 가 build red 로 며칠 막혀도 안 보이던 사고(2026-06-07: GitHubCommit
//    중복 정의 + isTextBased send 가드, KL-091/096 머지가 노출) 재발 기계 차단.
//    루트 node_modules(workspace hoist) 있으면 실행 — verify 가 karmolab build 하므로 사실상 상존.
/* ★ **저장소 루트 node_modules 를 보면 안 된다** (2026-08-16 실측). CI 는 루트에 설치하지
   않는다 — `apps/karmolab` · `packages/*` · `apps/blog` 만 깐다. 그래서 이 조건이 CI 에서
   늘 거짓이었고, yawnbot build 가 **한 번도 안 돌았다**. 뒤이어 `test:chat` 도 영원히
   「못 돌림」이었다(순서를 고쳤는데도 안 고쳐진 이유가 이것이다 — 자리가 아니라 조건이었다).
   봐야 할 것은 **yawnbot 이 실제로 지어질 수 있나** = 그 워크스페이스의 node_modules 다. */
const yawnbotWs = 'apps/discord-bots';
const yawnbotReady = existsSync(`${yawnbotWs}/node_modules`) && existsSync('apps/discord-bots/apps/yawnbot/tsconfig.json');
if (yawnbotReady) {
  run('yawnbot build (tsc)', 'apps/discord-bots/apps/yawnbot', 'npx tsc -p tsconfig.json');
  /* 타입만 보면 **라우트가 통째로 사라진 것**은 안 잡힌다 (TASK-KL-153).
   * 실제로 그랬다: 한 세션이 `karmolab-api.ts` 를 통째로 덮어쓰면서 다른 세션이 넣은
   * 라우트 두 개가 조용히 없어졌고, 타입도 배포도 초록이었다 — 사람 화면에서만 404 였다.
   * 그 라우트를 찌르는 시험은 이미 있었는데 **아무 관문도 그걸 안 돌리고 있었다.**
   * 배포(노트북) 는 tsc 만 본다. 그래서 여기서 돈다. */
  run('yawnbot 시험 (라우트가 사라져도 잡히게)', 'apps/discord-bots/apps/yawnbot', 'npx vitest run');
} else {
  /* 조용한 skip 은 「초록」으로 읽힌다. 못 돈 것은 못 돌았다고 말한다 — 그래야 다음 사람이 본다. */
  console.log(`[verify] ⚠ yawnbot 을 못 지었다 — ${yawnbotWs}/node_modules 가 없다.`);
  console.log('[verify]   그러면 test:chat(창 둘이 실시간 대화) 도 못 돈다. 통과가 아니다.');
  console.log(`[verify]   고치기: cd ${yawnbotWs} && npm ci   (CI 는 setup-karmolab 에서 깐다)`);
}

// 2. apps/karmolab — build (typecheck 포함). karmolab-ai/dist 를 import.
//    이전 karmolab-ts.yml + ai-quality.yml karmo-ai-surface 흡수.
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
/* ★ **정문을 안 재고 품질을 말할 수 없다** (2026-08-16, 실측). 성능 예산 게이트는 화면 둘을
   본다 — 앱 첫 화면과 **도구 한 장**. 그런데 CI 에서는 도구 장이 늘 「찍힌 페이지가 없다」로
   건너뛰었다: 그 129장은 배포 단계에서만 찍히고 verify 는 안 찍기 때문이다.
   그래서 **검색으로 들어오는 정문 129장**은 여기서 한 번도 재진 적이 없다.
   46초를 더 쓰고 절반을 되찾는다(전체 15분 기준 +5%). */
run('apps/karmolab 도구 장 찍기 (성능 게이트가 볼 것)', 'apps/karmolab', 'npm run gen:tool-pages');

/* ★ **한국어 장을 다시 찍었으면 짝도 다시 찍는다** (2026-08-21, 실측).
   윗줄이 도구 장 145개를 다시 찍는데, 그 짝인 en/ja 장 292개는 안 찍었다. 그런데
   `build` 안의 `gates` 는 <b>윗줄보다 먼저</b> 돈다 — 그래서 verify 한 판은 초록으로 끝나고,
   <b>그 다음</b> `gates` 에서 `test:i18n:pair` 가 빨개진다(「안 찍힌 장 146개」). 실제로
   그렇게 밟았다. 검사가 낡은 게 아니라 <b>verify 가 낡은 상태를 남기고 끝난 것</b>이다.
   `verify:deploy` 도, `pages-deploy.yml` 도, `sync:tools` 도 전부 이 둘을 붙여서 부른다 —
   `verify` 에만 빠져 있었다. 1초 남짓이고, 안 붙이면 다음 사람이 남의 빨강을 물려받는다. */
run('apps/karmolab 도구 장 짝 찍기 (en/ja)', 'apps/karmolab', 'npm run gen:tool-pages-locale');

/* ★ **첫 화면 미리 그리기도 CI 에는 없다** (2026-08-16, 실측). `apps/blog/` 은
   `.gitignore` 에 걸린 **빌드 산출물**이라 CI 체크아웃에는 아예 없다. 그래서 `audit:prerender-home`
   이 매 판 「찍힌 첫 화면이 없다 — 못 돌림」으로 빠졌다: 첫 화면이 **미리 그려진 뒤에도 성한지**를
   보라고 만든 검사가, 정작 배포 때 말고는 한 번도 안 돈 것이다. 1초면 찍힌다 — 안 도는 검사를
   두는 값이 훨씬 비싸다. (도구 장 찍기와 같은 자리, 같은 이유.) */
run('apps/karmolab 첫 화면 미리 그리기 (그 검사가 볼 것)', 'apps/karmolab', 'npm run prerender:home');

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
//      바이너리가 없어 "resource path ... doesn't exist" 로 main invariant 가
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
//      scripts/tauri-acl-audit.mjs (`npm run acl-audit` 와 동일). main invariant
//      필수 게이트 — 무조건 실행 (KL-063: 옛 코드가 부재 경로 existsSync 가드로
//      이 게이트를 verify 에서 영구 skip 시키던 잠복 결함 수정).
if (existsSync('apps/karmolab-tauri/src-tauri/Cargo.toml')) {
  run('Tauri ACL audit', '.', 'node scripts/tauri-acl-audit.mjs');
  /* 3.5-b. **커밋이 반쪽인가** (2026-08-19). 위 검사는 *작업 폴더* 를 본다 — 파일이 다 있는
     내 자리에서는 늘 초록이다. 그런데 담을 때 파일 목록을 손으로 주므로, 구현 파일 하나를
     빠뜨리면 트렁크에만 반쪽이 올라가고 **앱이 통째로 안 굽는다**(2026-08-19 하루 세 판).
     같은 검사를 커밋에 대고도 돌린다 — `KL_PUSH_SHA` 가 있으면 그 커밋을, 없으면 폴더를. */
  run('Tauri 명령 등록 반쪽 검사', 'apps/karmolab-tauri', 'node scripts/audit-acl-impl.mjs');
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

// 4. apps/blog lint 는 컷오버로 소멸 (change.blog-cutover) — 테마 SCSS/TS 가 없다.
//    블로그 글 파이프의 게이트는 apps/karmolab 쪽 (test:markdown 등, gate-list.json).

// 5.5. packages/companion — build + 단위 (TASK-KAR-201). 동반자 코어는 어떤 앱도
//      import 하지 않으므로, 관문에 안 걸어두면 깨져도 아무 빌드가 빨개지지 않는다
//      (= 조용히 죽는다). 자기 node_modules 를 갖는 독립 패키지라 있을 때만 실행.
if (existsSync('packages/companion/node_modules')) {
  run('packages/companion build+test', 'packages/companion', 'npm test');
} else {
  console.log('[verify] ! packages/companion skip — node_modules 부재. CI 는 `companion.yml` 이 그 꾸러미를 건드린 판에서만 판정한다 (여기서 깔면 매 push 가 수십 MB 만큼 길어진다)');
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

// Files 클라우드 규격 — 의존성 0. 화면 HTML 과 따로, 안 걸면 암호 왕복이 깨져도 Pages 배포는 초록이다.
if (existsSync('apps/files/test/vault-roundtrip.test.mjs')) {
  run('apps/files 클라우드 왕복', 'apps/files', 'node --test');
}

/* 6. 오탈자 — **있으면 여기서 돈다** (2026-08-17).
   전에는 「로컬엔 안 깔려 있을 것」이라며 통째로 건너뛰고 CI 의 별 step 에만 맡겼다. 그랬더니
   달력 낱말 하나(`dows` = day-of-week 의 복수)가 오타로 잡혀 **verify 가 21판 연속 빨갛게** 서 있었다 —
   미는 사람은 몇 분 뒤 CI 를 봐야 알았고, 아무도 안 봤다. 깔려 있으면 밀기 전에 알려 준다.
   없으면 「못 돌림」이라고 **말은 하고** 지나간다(조용한 건너뜀은 안 돈 것과 구분이 안 된다). */
if (spawnSync('typos --version', { shell: true, stdio: 'ignore' }).status === 0) {
  /* ★ typos 는 **오탈자를 찾으면 2** 로 나간다. 이 저장소에서 2 는 「못 돌림」이라
     그대로 두면 진짜 오탈자가 조용히 통과한다(붙이자마자 밟아 봤다). 1 로 바꿔서 넘긴다. */
  run('오탈자', '.', 'typos . || exit 1');
} else {
  console.log('[verify] · 오탈자 — 못 돌림 (typos 가 이 기계에 없다. CI 의 별 step 이 본다)');
}

schedule();
console.log('\n[verify] OK — main invariant 통과');
