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

/** 판이 잠잠해질 때까지 (같은 커밋이 20초 이어질 때까지, 최대 3분) */
async function settle() {
  const until = Date.now() + 180000;
  let mark = null;
  let since = 0;
  while (Date.now() < until) {
    const now = await servedCommit();
    if (now && now === mark && Date.now() - since >= 20000) return;
    if (now && now !== mark) { mark = now; since = Date.now(); }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

function run() {
  const [cmd, ...rest] = argv;
  const bin = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd;
  return spawnSync(bin, rest, { stdio: 'inherit', shell: process.platform === 'win32' }).status ?? 1;
}

const before = await servedCommit();
let code = run();
if (code !== 0) {
  const after = await servedCommit();
  if (before && after && before !== after) {
    console.log(`[retry-if-redeployed] 재는 동안 판이 바뀌었다 (${before.slice(0, 8)} → ${after.slice(0, 8)}) — 잠잠해진 뒤 한 번만 다시 잰다`);
    await settle();
    code = run();
  } else {
    console.log('[retry-if-redeployed] 판은 그대로였다 — 진짜 빨강이다');
  }
}
process.exitCode = code;
