/**
 * 배포가 실제로 사람에게 닿고 있나 (TASK-KL-159).
 *
 * 왜 있나: 2026-08-08 에 번들 하나가 **한 시간 넘게** 실사이트에 못 나갔다. 원인은
 * 「3분 기다렸다 시작」 코얼레스 창이 세션 여섯 때문에 한 번도 안 닫힌 것이었는데,
 * 그걸 알아내려고 `gh run list` 를 손으로 세고 초를 계산해야 했다.
 * **재는 법이 없으면 못 고친다** — 그래서 세는 일을 여기 박아 둔다.
 *
 * 취소는 두 종류다. 이 둘을 같은 글자로 세면 아무것도 안 보인다:
 *  - **대기 밀림** — 아직 시작도 안 한 것이 더 새 push 에 밀린 것. 이건 **정상**이다
 *    (깃허브가 대기 중 오래된 것을 지운다 = 마지막 하나만 배포).
 *  - **돌다 죽음** — 몇 분째 짓고 있던 것이 끊긴 것. 이건 **손해**다. 그만큼 늦어진다.
 *
 * 가르는 법: 수명이 `RUNNING_CANCEL_SEC` 를 넘겼으면 짓다가 죽은 것으로 본다.
 * (성공한 배포가 8~10분 걸린다. 대기 밀림은 대개 몇십 초 안에 끝난다.)
 * 어림이지만, 어림이라도 재는 편이 안 재는 것보다 낫다 — 지금은 아예 안 잰다.
 *
 * 못 돌면 「못 돌았다」(2)로 끝낸다 — 통과도 실패도 아니다. gh 가 없거나 인터넷이 막힌
 * 자리에서 이 검사가 빨갛게 뜨면, 늘 빨간 경보가 되어 아무도 안 본다.
 */
import { execFileSync } from 'node:child_process';

const HOURS = Number(process.argv.find((a) => a.startsWith('--hours='))?.split('=')[1] ?? 24);
/** 이보다 오래 살았던 취소 = 짓다가 죽은 것. */
const RUNNING_CANCEL_SEC = 120;
/** 마지막 성공이 이보다 오래됐으면 배포가 서 있는 것으로 본다. */
const STALE_SUCCESS_SEC = 3 * 60 * 60;

function runsJson() {
  const out = execFileSync(
    'gh',
    ['run', 'list', '--workflow=pages-deploy.yml', '--limit', '100', '--json', 'conclusion,status,createdAt,updatedAt,headSha'],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return JSON.parse(out);
}

let runs;
try {
  runs = runsJson();
} catch (error) {
  console.log(`[audit-deploy-health] CANNOT-RUN — 배포 기록을 못 읽었다 (gh 로그인·인터넷 확인): ${error.message.split('\n')[0]}`);
  process.exit(2);
}

const since = Date.now() - HOURS * 3600 * 1000;
const window = runs.filter((r) => Date.parse(r.createdAt) >= since);
if (window.length === 0) {
  console.log(`[audit-deploy-health] CANNOT-RUN — 최근 ${HOURS}시간에 배포가 한 번도 없다 (잴 것이 없다)`);
  process.exit(2);
}

const life = (r) => Math.round((Date.parse(r.updatedAt) - Date.parse(r.createdAt)) / 1000);
const done = window.filter((r) => r.status === 'completed');
const success = done.filter((r) => r.conclusion === 'success');
const failure = done.filter((r) => r.conclusion === 'failure');
const cancelled = done.filter((r) => r.conclusion === 'cancelled');
const supersededed = cancelled.filter((r) => life(r) < RUNNING_CANCEL_SEC);
const killedMidBuild = cancelled.filter((r) => life(r) >= RUNNING_CANCEL_SEC);

const lastSuccess = success[0] ? Date.parse(success[0].updatedAt) : null;
const sinceSuccessSec = lastSuccess === null ? null : Math.round((Date.now() - lastSuccess) / 1000);

const median = (list) => {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

console.log(`[audit-deploy-health] 최근 ${HOURS}시간 · 배포 ${window.length}건`);
console.log(`  성공 ${success.length} · 실패 ${failure.length} · 취소 ${cancelled.length}`);
console.log(`    취소 갈래 — 대기 밀림(정상) ${supersededed.length} · 짓다가 죽음(손해) ${killedMidBuild.length}`);
if (success.length) console.log(`  성공한 배포에 걸린 시간(중앙값) ${median(success.map(life))}초`);
console.log(
  sinceSuccessSec === null
    ? '  마지막 성공: 이 창 안에 없음'
    : `  마지막 성공: ${Math.round(sinceSuccessSec / 60)}분 전`,
);

/* 판정 — 「몇 건 취소됐나」로는 판정하지 않는다. 대기 밀림은 많아도 정상이다.
   아픈 것은 ① 짓다가 죽는 것 ② 오래도록 성공이 없는 것, 이 둘뿐이다. */
const problems = [];
if (killedMidBuild.length > 0) {
  problems.push(
    `짓다가 죽은 배포 ${killedMidBuild.length}건 (수명 ${killedMidBuild.map(life).join('·')}초) — ` +
      '그만큼 실사이트 도달이 늦어졌다. 배포를 끊는 설정이 어딘가에 또 있는지 봐라.',
  );
}
if (sinceSuccessSec !== null && sinceSuccessSec > STALE_SUCCESS_SEC) {
  problems.push(`마지막 성공이 ${Math.round(sinceSuccessSec / 3600)}시간 전 — 올린 것이 사람에게 안 닿고 있다.`);
}
if (success.length === 0) {
  problems.push('이 창 안에 성공한 배포가 하나도 없다.');
}

if (problems.length) {
  console.error('[audit-deploy-health] 배포가 아프다:');
  for (const line of problems) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('[audit-deploy-health] 배포 건강 — 짓다가 죽은 것 0 · 최근 성공 있음');
