/**
 * 배포가 실제로 사람에게 닿고 있나 (TASK-KL-159 → KL-160 에서 판정 방식 교체).
 *
 * 왜 있나: 2026-08-08 에 번들 하나가 한 시간 넘게 실사이트에 못 나갔다. 원인을 알아내려고
 * `gh run list` 를 손으로 세고 초를 계산해야 했다. **재는 법이 없으면 못 고친다.**
 *
 * ── 첫 판(KL-159)이 틀렸던 자리 ────────────────────────────────────────────────
 * 창(최근 N시간) 안의 실패·취소를 그냥 세서 「하나라도 있으면 아프다」고 했다. 그런데 그 창에는
 * **이미 고쳐진 병의 시체**가 같이 들어 있다. 실제로 고친 직후에도 계속 빨갛게 떴다 —
 * 늘 빨간 경보는 꺼진 경보와 같다.
 *
 * 그래서 판정 기준을 바꾼다: **마지막으로 성공한 배포보다 뒤에 또 일어난 것만** 살아 있는 병으로
 * 센다. 고친 뒤로 한 번이라도 끝까지 갔다면, 그 앞의 실패는 지나간 일이다.
 *
 * ── 세는 방식 ──────────────────────────────────────────────────────────────────
 * 취소는 두 갈래다. 같은 글자로 세면 아무것도 안 보인다:
 *  - **대기 밀림** — 아직 시작도 안 한 것이 더 새 push 에 밀린 것. **정상**이다
 *    (깃허브가 대기 중 오래된 것을 지운다 = 마지막 하나만 배포).
 *  - **짓다가 죽음** — 몇 분째 짓던 것이 끊긴 것. **손해**다. 그만큼 늦어진다.
 * 가르는 법 = 수명 `RUNNING_CANCEL_SEC`. 성공한 배포가 8~10분, 대기 밀림은 대개 몇십 초다.
 *
 * 실패는 **사유별로 묶는다.** 「실패 13」은 아무 정보가 아니지만 「타입 검사 1 · 브라우저 없음 12」는
 * 무엇을 고칠지 말해 준다.
 *
 * 못 돌면 「못 돌았다」(2)로 끝낸다 — gh 가 없거나 인터넷이 막힌 자리에서 빨갛게 뜨면
 * 그 역시 늘 빨간 경보가 된다.
 */
import { execFileSync } from 'node:child_process';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};

const HOURS = Number(arg('hours', 24));
/** 이보다 오래 살았던 취소 = 짓다가 죽은 것. */
const RUNNING_CANCEL_SEC = 120;
/** 마지막 성공이 이보다 오래됐으면 배포가 서 있는 것으로 본다. */
const STALE_SUCCESS_SEC = 3 * 60 * 60;
/**
 * 사유를 캐 볼 실패 수 상한. 로그 한 건 읽는 데 몇 초씩 걸린다.
 * **살아 있는 실패를 먼저 캔다** — 지나간 실패(마지막 성공 이전)는 이미 고쳐진 것이라
 * 사유를 캘 이유가 없다. 그것까지 캐느라 재는 일 자체가 느려졌다 (TASK-KL-161).
 */
const REASON_LOOKUPS = Number(arg('reasons', 6));

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function cantRun(why) {
  console.log(`[audit-deploy-health] CANNOT-RUN — ${why}`);
  process.exit(2);
}

let runs;
try {
  runs = JSON.parse(
    gh([
      'run',
      'list',
      '--workflow=pages-deploy.yml',
      '--limit',
      '100',
      '--json',
      'databaseId,conclusion,status,createdAt,updatedAt,headSha',
    ]),
  );
} catch (error) {
  cantRun(`배포 기록을 못 읽었다 (gh 로그인·인터넷 확인): ${error.message.split('\n')[0]}`);
}

const since = Date.now() - HOURS * 3600 * 1000;
const window = runs.filter((r) => Date.parse(r.createdAt) >= since);
if (window.length === 0) cantRun(`최근 ${HOURS}시간에 배포가 한 번도 없다 (잴 것이 없다)`);

const life = (r) => Math.round((Date.parse(r.updatedAt) - Date.parse(r.createdAt)) / 1000);
const done = window.filter((r) => r.status === 'completed');
const success = done.filter((r) => r.conclusion === 'success');
const failure = done.filter((r) => r.conclusion === 'failure');
const cancelled = done.filter((r) => r.conclusion === 'cancelled');
const superseded = cancelled.filter((r) => life(r) < RUNNING_CANCEL_SEC);
const killedMidBuild = cancelled.filter((r) => life(r) >= RUNNING_CANCEL_SEC);

/* 마지막으로 **끝까지 간** 배포. 이 시각이 「고쳐졌다」의 경계선이다. */
const lastSuccessAt = success.length ? Math.max(...success.map((r) => Date.parse(r.updatedAt))) : null;
const afterLastSuccess = (r) => lastSuccessAt !== null && Date.parse(r.createdAt) > lastSuccessAt;

/** 실패 로그에서 사유 한 줄을 캔다. 못 캐면 「알 수 없음」 — 지어내지 않는다. */
function reasonOf(run) {
  let log = '';
  try {
    log = gh(['run', 'view', String(run.databaseId), '--log-failed']);
  } catch {
    return '로그를 못 읽었다';
  }
  const patterns = [
    [/CANNOT-RUN — ([^\n\r]{0,60})/, (m) => `못 돌린 검사: ${m[1].trim()}`],
    [/error TS\d+/, () => '타입 검사'],
    [/위반 \d+/, () => '감사(audit) 위반'],
    [/npm error/, () => 'npm'],
    [/The job running on runner .* has exceeded the maximum execution time/, () => '시간 초과'],
    [/##\[error\]([^\n\r]{0,60})/, (m) => m[1].trim() || '알 수 없음'],
  ];
  for (const [re, make] of patterns) {
    const m = re.exec(log);
    if (m) return make(m);
  }
  return '알 수 없음';
}

const median = (list) => {
  if (list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

console.log(`[audit-deploy-health] 최근 ${HOURS}시간 · 배포 ${window.length}건`);
console.log(`  성공 ${success.length} · 실패 ${failure.length} · 취소 ${cancelled.length}`);
console.log(`    취소 갈래 — 대기 밀림(정상) ${superseded.length} · 짓다가 죽음(손해) ${killedMidBuild.length}`);
if (success.length) console.log(`  성공에 걸린 시간(중앙값) ${median(success.map(life))}초`);
console.log(
  lastSuccessAt === null
    ? '  마지막 성공: 이 창 안에 없음'
    : `  마지막 성공: ${Math.round((Date.now() - lastSuccessAt) / 60000)}분 전`,
);

/* 실패 사유 — 「실패 13」은 아무 정보가 아니다. 무엇을 고칠지 말해 주는 것은 사유별 개수다.
   살아 있는 것(마지막 성공보다 뒤)을 먼저 캔다. */
const byNewest = (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt);
/* 살아 있는 것(마지막 성공 뒤) 먼저, 그 다음에 지나간 것. 상한에 걸리면 지나간 것이 잘린다 —
   잘려도 판정은 안 흔들린다(판정은 살아 있는 것만 본다). */
const toInspect = [...failure.filter(afterLastSuccess).sort(byNewest), ...failure.filter((r) => !afterLastSuccess(r)).sort(byNewest)].slice(
  0,
  REASON_LOOKUPS,
);
const reasons = new Map();
for (const run of toInspect) {
  const reason = reasonOf(run);
  const bucket = reasons.get(reason) ?? { total: 0, live: 0 };
  bucket.total += 1;
  if (afterLastSuccess(run)) bucket.live += 1;
  reasons.set(reason, bucket);
}
if (reasons.size) {
  console.log(`  실패 사유 (최근 ${toInspect.length}건 확인):`);
  for (const [reason, bucket] of [...reasons].sort((a, b) => b[1].total - a[1].total)) {
    console.log(`    ${reason} — ${bucket.total}건${bucket.live ? ` (그중 ${bucket.live}건은 **아직 살아 있다**)` : ' (마지막 성공 이전 = 지나간 것)'}`);
  }
}

/* ── 판정 ──────────────────────────────────────────────────────────────────────
 * 「몇 건 있었나」로는 판정하지 않는다. 대기 밀림은 많아도 정상이고, 고쳐진 실패는 시체다.
 * 아픈 것은 **마지막 성공 뒤에도 또 일어난 것**뿐이다. */
const liveFailures = failure.filter(afterLastSuccess);
const liveKills = killedMidBuild.filter(afterLastSuccess);

const problems = [];
if (lastSuccessAt === null) {
  problems.push(`최근 ${HOURS}시간에 끝까지 간 배포가 하나도 없다 — 올린 것이 사람에게 안 닿고 있다.`);
} else {
  if (liveFailures.length) {
    problems.push(
      `마지막 성공 뒤에도 실패 ${liveFailures.length}건 — 아직 살아 있는 병이다. 위 사유를 봐라.`,
    );
  }
  if (liveKills.length) {
    problems.push(
      `마지막 성공 뒤에도 짓다가 죽은 배포 ${liveKills.length}건 (수명 ${liveKills.map(life).join('·')}초) — ` +
        '배포를 끊는 설정이 어딘가에 또 있다.',
    );
  }
  if (Date.now() - lastSuccessAt > STALE_SUCCESS_SEC * 1000) {
    problems.push(`마지막 성공이 ${Math.round((Date.now() - lastSuccessAt) / 3600000)}시간 전 — 배포가 서 있다.`);
  }
}

if (problems.length) {
  console.error('[audit-deploy-health] 배포가 아프다:');
  for (const line of problems) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('[audit-deploy-health] 배포 건강 — 마지막 성공 뒤로 새로 아픈 것 없음');
