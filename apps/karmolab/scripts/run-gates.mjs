/**
 * 검사를 **끝까지 다 돌리고 한꺼번에 보고한다** (TASK-KL-210 곁가지).
 *
 * 2026-08-09 실측: 배포가 하루 종일 빨갰다. 원인은 **여섯 개**였는데, 한 판에 **하나씩만**
 * 드러났다 — `A && B && C` 는 A 에서 멈추므로 B·C 가 빨간지 아무도 모른다. 고치고, 10분 기다려
 * 배포가 또 죽고, 다음 것을 알고… 를 여섯 번 했다. 여섯 시간이 그렇게 갔다.
 *
 *   `&&` 사슬:  A 빨강 → 끝.        아는 것 1개 / 판당
 *   이 스크립트: 전부 돌림 → 목록.   아는 것 전부 / 판당
 *
 * ## 왜 그냥 `--continue-on-error` 가 아닌가
 *
 * 「만드는 단계」와 「보는 단계」는 다르다. 산출물을 못 만들면 그 뒤 검사는 **없는 것을 보는**
 * 셈이라 전부 헛돈다(빈 화면은 언제나 통과한다 — 이 저장소에서 실제로 속은 적 있다).
 * 그래서 만드는 단계는 그대로 `&&` 로 두고, **검사만** 여기서 모아 돌린다.
 *
 * ## 순서대로, 한 번에 하나씩
 *
 * 병렬로 돌리면 빨라지지만 이 저장소의 검사들은 브라우저·포트·산출물을 공유한다. 실제로
 * 「병렬화했더니 하위 셸 카운터가 사라져 전부 통과로 보이던」 사고가 있었다. 시간보다 정직이 먼저다.
 *
 * 사용: node scripts/run-gates.mjs <npm-script> [<npm-script> …]
 */
import { spawnSync } from 'node:child_process';

const gates = process.argv.slice(2);
if (!gates.length) {
  console.error('[gates] 돌릴 검사가 없다 — 이름을 하나 이상 줘라.');
  process.exit(2);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

for (const gate of gates) {
  const started = Date.now();
  console.log(`\n──── ${gate} ────`);
  const run = spawnSync(npm, ['run', '--silent', gate], { stdio: 'inherit', shell: process.platform === 'win32' });
  const sec = Math.round((Date.now() - started) / 1000);
  /* 죽은 방식도 구분해 남긴다 — 「빨강」과 「아예 못 돌았다」는 손 갈 데가 다르다. */
  const how = run.error ? `못 돌림 (${run.error.message.slice(0, 60)})` : run.status === 0 ? null : `exit ${run.status}`;
  results.push({ gate, sec, how });
}

const bad = results.filter((r) => r.how);
console.log('\n════ 검사 결과 ════');
for (const r of results) {
  console.log(`  ${r.how ? '✘' : '✓'} ${r.gate.padEnd(22)} ${String(r.sec).padStart(4)}s${r.how ? '  — ' + r.how : ''}`);
}

if (!bad.length) {
  console.log(`\n[gates] 전부 통과 — ${results.length}개`);
  process.exit(0);
}

console.error(`\n[gates] 빨강 ${bad.length}개 / ${results.length}개 — **한 판에 전부 보인다**:`);
for (const r of bad) console.error(`  - ${r.gate} (${r.how})`);
console.error('  위 로그에서 각 검사가 스스로 말한 사유를 봐라. 하나씩 고치고 또 10분 기다리지 마라.');
process.exit(1);
