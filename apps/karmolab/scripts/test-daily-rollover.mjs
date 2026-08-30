/**
 * 오늘의 판이 **매일 실제로 갈리는가** (TASK-KL-194, memo `projects/놀이.md` §5).
 *
 * 왜 따로 있나: 기존 `test:daily`(smoke-daily)는 답이 화면에 새지 않는가를 본다.
 * **날짜가 넘어갈 때 문제가 바뀌는지**는 아무도 안 보고 있었다. 그런데 그건 조용한 고장이다 . 
 * 안 갈려도 화면은 멀쩡하고, 사람만 어제 거네 한다. 배포도 초록이다.
 *
 * 여기서 보는 것:
 *   - KST 자정 **1분 전과 1분 후**가 서로 다른 날짜다 (UTC 로 재면 같은 날이라 안 갈린다)
 *   - 그 두 날짜의 **씨앗이 다르다** (날짜가 갈려도 씨앗이 같으면 문제는 그대로다)
 *   - 같은 날 + 같은 게임이면 **누가 열어도 같은 수** (그게 전원 같은 문제의 뜻)
 *   - 게임이 다르면 같은 날이어도 다르다
 *   - 남은 시간이 자정을 넘는 순간 **0 이 아니라 하루로 돌아간다**
 *
 * 시계는 검사가 정한다. `dateKST` 는 인자로 받은 순간만 보므로 기계의 시간대와 무관하다.
 * 그래도 다른 함수가 지역 시계를 타면 CI(UTC)에서만 빨개지므로 못 박아 둔다.
 *
 * 사용: node scripts/test-daily-rollover.mjs
 */
process.env.TZ = 'Asia/Seoul';

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'daily-'));
const out = join(dir, 'daily.mjs');
await build({
  entryPoints: ['src/core/daily.ts'],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent',
});
const { dateKST, seedFor, msUntilNextKST, startOfDayKST } = await import(
  `file://${out.replace(/\\/g, '/')}`
);

const fails = [];
const ok = (cond, say) => { if (!cond) fails.push(say); };

/* KST 자정 = 전날 15:00 UTC. 그 앞뒤 1분을 잡는다. */
const midnight = startOfDayKST('2026-08-14');            // 2026-08-13T15:00:00Z
const justBefore = new Date(midnight.getTime() - 60_000);
const justAfter = new Date(midnight.getTime() + 60_000);

const d1 = dateKST(justBefore);
const d2 = dateKST(justAfter);

ok(d1 === '2026-08-13', `자정 1분 전이 전날이어야 한다. 지금 ${d1}`);
ok(d2 === '2026-08-14', `자정 1분 후가 새 날이어야 한다. 지금 ${d2}`);
ok(d1 !== d2, '자정을 넘었는데 날짜가 안 갈렸다');

/* ★ 날짜만 갈리고 씨앗이 같으면 **문제는 그대로다**. 그게 이 검사의 핵심이다. */
for (const game of ['dailycho', 'dailytype', 'daily']) {
  const s1 = seedFor(game, d1);
  const s2 = seedFor(game, d2);
  ok(s1 !== s2, `${game}: 날이 갈렸는데 씨앗이 같다 (${s1})`);
}

/* 같은 날 + 같은 게임 = 누가 열어도 같은 수 */
ok(
  seedFor('dailycho', '2026-08-14') === seedFor('dailycho', '2026-08-14'),
  '같은 날 같은 게임인데 씨앗이 흔들린다. 전원 같은 문제가 깨진다',
);

/* 게임이 다르면 같은 날이어도 달라야 한다 */
ok(
  seedFor('dailycho', '2026-08-14') !== seedFor('dailytype', '2026-08-14'),
  '게임이 달라도 씨앗이 같다. 두 놀이가 같은 문제를 낸다',
);

/* 30일을 훑어 연달아 같은 씨앗이 없는지 본다 (하루 차이가 안 퍼지면 문제가 비슷해진다) */
{
  const seeds = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(midnight.getTime() + i * 86_400_000);
    seeds.push(seedFor('dailycho', dateKST(day)));
  }
  const duplicate = seeds.length - new Set(seeds).size;
  ok(duplicate === 0, `30일 중 씨앗이 겹치는 날 ${duplicate}건`);
}

/* 남은 시간: 자정 직후엔 거의 하루가 남아야 한다 (0 으로 붙어 있으면 카운트다운이 죽는다) */
{
  const remaining = msUntilNextKST(justAfter);
  ok(remaining > 23 * 3600_000, `자정 직후 남은 시간이 하루에 가깝지 않다. ${Math.round(remaining / 60000)}분`);
  const remainingBefore = msUntilNextKST(justBefore);
  ok(remainingBefore < 5 * 60_000, `자정 1분 전인데 남은 시간이 ${Math.round(remainingBefore / 60000)}분`);
}

rmSync(dir, { recursive: true, force: true });

if (fails.length > 0) {
  console.error('[daily-rollover] 실패:');
  for (const f of fails) console.error(`  ✘ ${f}`);
  process.exit(1);
}
console.log('[daily-rollover] 하루가 갈리면 문제도 갈린다. 자정 경계, 씨앗, 30일 훑기 전부 통과');
