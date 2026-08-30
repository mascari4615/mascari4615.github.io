/**
 * 검사를 전부 돌리고 **마지막에 모아서** 알려 준다 (TASK-KL-089)
 *
 * 왜 있나: 예전에는 `A && B && C ...` 로 이어 붙여 놨다. 그러면 앞의 하나가 실패하는 순간
 * **뒤의 열 개가 아예 안 돈다.** 실제로 그런 상태로 며칠을 보냈다. 도구 하나가 없는 파일을
 * 부르는 바람에 그 뒤 검사들의 결과를 아무도 못 봤다. 배포 뒤 확인(워크플로)은 단계마다
 * 계속 돌게 해 뒀는데 정작 손으로 돌리는 쪽이 그러지 못했다.
 *
 * 그래서 여기서는 하나가 실패해도 끝까지 돌리고, 맨 끝에 무엇이 빨간지 한 번에 보여 준다.
 *
 * 사용: npm run audit:all
 *       BASE=http://127.0.0.1:8801/apps/blog npm run audit:all
 */
import { spawnSync } from 'node:child_process';

/** [보여 줄 이름, npm 스크립트 이름]. 빠르고 값싼 것부터. */
const CHECKS = [
  ['부르는 이름, 파일이 실재하는지', 'audit:scripts'],
  ['도구마다 딸린 것이 채워졌는지', 'audit:data'],
  ['커밋된 파생물이 지금 소스와 같은지', 'audit:generated'],
  ['화면이 뜨는지 (전 도구)', 'test:live'],
  ['도구 아닌 화면들 (광장, 상태, 커뮤니티, 내 정보)', 'test:platform'],
  ['도구 목록이 성한지', 'test:hub'],
  ['스크립트 없이도 읽히는지', 'test:nojs'],
  ['검색엔진이 읽는 머리', 'audit:seo'],
  ['설치 정보', 'test:pwa'],
  ['값을 넣으면 답이 나오는지', 'test:answers'],
  ['값을 넣으면 반응하는지', 'test:typing'],
  ['판본 대조가 바뀐 자리를 잡는지', 'test:pdfdiff'],
  ['유령 대결이 한 바퀴 도는지', 'test:ghosttype'],
  ['입력칸에 이름이 이어져 있는지', 'audit:labels'],
  ['밝은, 어두운 테마 대비', 'test:contrast'],
  ['안 쓰는데 첫 화면을 막는 스타일', 'audit:blocking-css'],
  ['후원 자리가 규칙대로 뜨는지', 'audit:sponsor'],
  ['공유 카드가 지금 문구와 맞는지', 'audit:cards:fresh'],
  ['비워 둔 자리가 실제와 맞는지', 'audit:heights']
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];

for (const [label, script] of CHECKS) {
  const started = Date.now();
  const r = spawnSync(npm, ['run', '--silent', script], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  results.push({ label, script, ok: r.status === 0, sec: Math.round((Date.now() - started) / 1000) });
}

/* ★ 톱니 조이기 (TASK-KL-312). 한 바퀴 돈 김에 **좋아진 만큼 기준선을 조인다.**
 *   기준선 갱신(`-- --update`)은 사람 몫이었고, 잊으면 톱니가 옛 빚을 그대로 들고 있어
 *   다시 늘어나도 그만큼은 안 걸린다. 나빠지는 방향이면 되돌리므로 여기서 도는 것이 안전하다.
 *   (게이트가 아니다. 조이기가 실패해도 검사 결과를 바꾸지 않는다.) */
spawnSync(npm, ['run', '--silent', 'ratchet:tighten'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });

const failed = results.filter((r) => !r.ok);
console.log('');
console.log('─'.repeat(60));
for (const r of results) console.log(` ${r.ok ? '✓' : '✗'} ${r.label.padEnd(28)} ${String(r.sec).padStart(3)}초  (${r.script})`);
console.log('─'.repeat(60));

if (failed.length) {
  console.error(`[audit-all] ${results.length}개 중 ${failed.length}개가 빨갛다. ${failed.map((f) => f.label).join(', ')}`);
  process.exit(1);
}
console.log(`[audit-all] ${results.length}개 검사 모두 통과 (총 ${results.reduce((s, r) => s + r.sec, 0)}초)`);
