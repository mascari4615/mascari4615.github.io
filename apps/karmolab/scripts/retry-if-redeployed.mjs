#!/usr/bin/env node
/**
 * **땅이 움직였으면 한 번 더 잰다** (2026-08-13)
 *
 * 왜 있나: 라이브 검사는 실주소를 10분 남짓 열어 보는데, 그 사이 다른 세션의 배포가 파일을
 * 갈아 끼운다. 그러면 「시작을 눌렀는데 판이 안 열린다」·「말 묶음을 못 받았다」 같은 빨강이
 * 뜬다 — 손으로 같은 자리를 눌러 보면 멀쩡하다(실측 2026-08-12: 월드컵·팔레트·놀이 셋).
 * 제품이 깨진 게 아니라 **재는 동안 대상이 바뀐 것**이다.
 *
 * 그래서 이 껍데기는 검사 전후의 **서빙 커밋**을 견준다:
 *   - 실패했는데 그 사이 판이 바뀌었다  → 배포 탓이므로 잠잠해진 뒤 **한 번만** 다시 잰다.
 *   - 실패했고 판도 그대로였다          → 진짜 빨강이므로 그대로 실패시킨다.
 * 무조건 재시도(= 빨강을 삼키는 것)와 다르다. 근거가 있을 때만 다시 잰다.
 *
 * 사용: node scripts/retry-if-redeployed.mjs npm run test:x
 */
import { spawnSync } from 'node:child_process';

const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const STAMP = `${BASE}/apps/karmolab/build.json`;
const argv = process.argv.slice(2);
if (!argv.length) {
  console.error('[retry-if-redeployed] 돌릴 명령이 없다.');
  process.exit(2);
}

async function servedCommit() {
  try {
    const res = await fetch(`${STAMP}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.commit || null;
  } catch {
    return null;
  }
}

/** 판이 잠잠해질 때까지 (같은 커밋이 20초 이어질 때까지, 최대 3분)
 *  두 값은 **시험에서만** 줄인다(RIR_*) — 실전 기본값은 그대로다. */
const quietMaxMs = Number(process.env.RIR_SETTLE_MAX_MS || 180000);
const quietThreshold = Number(process.env.RIR_SETTLE_STABLE_MS || 20000);
async function settle() {
  const until = Date.now() + quietMaxMs;
  let mark = null;
  let since = 0;
  while (Date.now() < until) {
    const now = await servedCommit();
    if (now && now === mark && Date.now() - since >= quietThreshold) return;
    if (now && now !== mark) { mark = now; since = Date.now(); }
    await new Promise((r) => setTimeout(r, Math.min(5000, quietThreshold)));
  }
}

function run() {
  const [cmd, ...rest] = argv;
  const bin = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd;
  /* 껍데기(shell)는 **.cmd 를 부를 때만** 쓴다. 늘 쓰면 인자를 그냥 이어 붙이는 탓에
     **띄어쓰기가 든 경로**(예: `C:\Program Files
odejs
ode.exe`)가 두 토막으로 갈려
     명령이 아예 안 뜨고, 그게 조용한 「빨강」으로 둔갑한다(2026-08-17 시험이 잡음). */
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
  return spawnSync(bin, rest, { stdio: 'inherit', shell: needsShell }).status ?? 1;
}

const before = await servedCommit();
let code = run();
/* 2 = 「못 돌렸다」(CANNOT-RUN). 다시 재도 같은 답이고, 「진짜 빨강이다」로 적으면 거짓이다. */
if (code !== 0 && code !== 2) {
  const after = await servedCommit();
  if (before && after && before !== after) {
    console.log(`[retry-if-redeployed] 재는 동안 판이 바뀌었다 (${before.slice(0, 8)} → ${after.slice(0, 8)}) — 잠잠해진 뒤 한 번만 다시 잰다`);
    await settle();
    code = run();
    code = await staleRunCannotRun(code, (process.env.GITHUB_SHA || '').slice(0, 8));
  } else {
    /* ★ **「안 바뀌었다」와 「내가 재려던 판이다」는 다른 말이다** (2026-08-14 실측).
       재는 동안 판이 안 바뀌어도, 그 판이 **이 검사가 태어난 커밋보다 옛것**이면 검사는
       옛 화면을 보고 빨개진 것이다(그날 두 검사가 그렇게 빨갰고, 몇 분 뒤 같은 명령이
       실주소에서 그대로 초록이었다). 그러면 「진짜 빨강」이라고 적으면 안 된다 — 한 번 더 잰다. */
    const thisRun = (process.env.GITHUB_SHA || '').slice(0, 8);
    if (thisRun && before && !before.startsWith(thisRun)) {
      console.log(
        `[retry-if-redeployed] 판은 그대로지만 **내가 재려던 판이 아니다** ` +
          `(서빙 ${before.slice(0, 8)} · 이 검사 ${thisRun}) — 잠잠해진 뒤 한 번만 다시 잰다`
      );
      await settle();
      code = run();
      code = await staleRunCannotRun(code, thisRun);
    } else {
      console.log('[retry-if-redeployed] 판은 그대로였다 — 진짜 빨강이다');
    }
  }
}
process.exitCode = code;

/**
 * ★ **내 코드가 안 올라간 화면을 보고 빨개진 것은 「빨강」이 아니라 「못 돌림」이다** (2026-08-17 실측).
 * 그날 실주소 검사가 「달리 부르는 이름이 없다 — tts·printkit·nettool·protobuf」로 빨갰는데,
 * 그 네 개는 **이미 저장소에 적혀 있었다**(커밋 071ce025). 화면이 그 커밋 이전 판이었을 뿐이다.
 * 3분 기다렸다 다시 재는 것으로는 못 고친다 — 배포가 몇 판 뒤처져 있으면 영영 안 따라잡는다.
 * 그래서 다시 잰 뒤에도 **서빙 판이 내 판이 아니면** 답을 2(못 돌림)로 내린다.
 * 초록은 건드리지 않는다 — 옛 판이어도 「실주소가 성하다」는 그 자체로 사실이다.
 */
async function staleRunCannotRun(code, thisRound) {
  if (code === 0 || code === 2 || !thisRound) return code;
  const current = await servedCommit();
  if (current && current.startsWith(thisRound)) {
    console.log('[retry-if-redeployed] 다시 재도 빨갛다 — 진짜 빨강이다');
    return code;
  }
  console.log(
    `[retry-if-redeployed] 못 돌림 — 화면에 올라간 판(${(current || '?').slice(0, 8)})이 ` +
      `내가 재려던 판(${thisRound})이 아니다. 내 코드가 없는 화면을 보고 빨개진 것이라 판정하지 않는다.`
  );
  return 2;
}
