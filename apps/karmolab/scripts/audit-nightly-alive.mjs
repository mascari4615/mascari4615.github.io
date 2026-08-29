#!/usr/bin/env node
/**
 * **밤에 굽는 놈이 실제로 도는가** (2026-08-14)
 *
 * `audit:generated` 는 낡은 파생물을 보고 막지 않는다. 새벽 `refresh-generated` 가 굽는다고
 * 말한다. 그런데 오늘 보니 그 워크플로는 **딱 한 판 돌았고 그 판이 빨강**이었다 . 
 * 커밋도 안 되는 빌드 산출물을 읽고 있어서 첫 판부터 `ENOENT` 로 죽었다(2f87494 에서 고침).
 *
 * 즉 감사기가 **한 번도 안 돈 놈에게 약속을 맡기고** 있었다. 그 약속을 여기서 받아 적는다:
 * 밤에 굽는다고 말할 거면, 그 밤이 **최근에 실제로 초록이었어야** 한다.
 *
 * 판정:
 *   0  마지막 판이 초록이고 사흘 안쪽. 약속이 살아 있다
 *   1  마지막 판이 빨강이거나 너무 오래됨. 파생물이 조용히 늙고 있다
 *   2  못 물어봤다 (gh 없음, 인증 없음, 네트워크). 아니오가 아니다
 *
 * 사용: node scripts/audit-nightly-alive.mjs
 */
import { execFileSync } from 'node:child_process';

const WF = 'refresh-generated.yml';
const graceDays = 3;

let raw;
try {
  raw = execFileSync(
    'gh',
    ['run', 'list', '--workflow', WF, '--limit', '1', '--json', 'status,conclusion,createdAt'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
} catch (e) {
  console.log(`[nightly-alive] 못 물어봤다. gh 로 ${WF} 를 못 읽었다 (${String(e.message).split('\n')[0]})`);
  process.exit(2);
}

let runs;
try {
  runs = JSON.parse(raw);
} catch {
  console.log('[nightly-alive] 못 물어봤다. gh 가 내놓은 것이 JSON 이 아니다');
  process.exit(2);
}

if (!Array.isArray(runs) || runs.length === 0) {
  console.error(`[nightly-alive] ${WF} 이 **한 판도 안 돌았다**. 밤에 굽는다는 약속이 빈말이다`);
  process.exit(1);
}

const [last] = runs;
const elapsedDays = (Date.now() - Date.parse(last.createdAt)) / 86400000;
const day = elapsedDays.toFixed(1);

if (last.status !== 'completed') {
  console.log(`[nightly-alive] 마지막 판이 아직 돌고 있다 (${day}일 전 시작). 판정은 다음에`);
  process.exit(2);
}
if (last.conclusion !== 'success') {
  console.error(`[nightly-alive] 마지막 판이 **${last.conclusion}** 이다 (${day}일 전).`);
  console.error(`  파생물은 새벽이 굽는다고 믿고 낡은 채 서비스된다. 그 새벽이 안 돈다.`);
  console.error(`  로그: gh run list --workflow ${WF} --limit 3`);
  process.exit(1);
}
if (elapsedDays > graceDays) {
  console.error(`[nightly-alive] 마지막 초록이 **${day}일 전**이다 (참는 한도 ${graceDays}일).`);
  console.error(`  매일 돈다고 적혀 있는데 안 돌고 있다. 일정(cron)이 꺼졌는지 봐라.`);
  process.exit(1);
}
console.log(`[nightly-alive] OK. ${WF} 마지막 판 초록 (${day}일 전)`);
