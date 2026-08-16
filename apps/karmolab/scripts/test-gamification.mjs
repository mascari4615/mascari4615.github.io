/**
 * 연속일·경험치 셈이 맞나 (TASK-KL-321).
 *
 * 이 셈은 그동안 React 섬 안에만 있었고 **한 번도 시험된 적이 없다.** 옮기면서 제일 먼저
 * 한 일이 이 파일이다 — 옮긴 코드가 옛날과 같은 답을 내는지 여기서 본다.
 *
 * 특히 지키는 것 셋:
 *   ① 하루에 한 번만 는다 (같은 날 두 번 눌러도 2일이 안 된다)
 *   ② 하루 건너뛰면 1 로 돌아가되 **최장 기록은 안 깎인다**
 *   ③ 달·해가 바뀌는 자리(1/31 → 2/1, 12/31 → 1/1)도 「어제」다
 *
 * 사용: node scripts/test-gamification.mjs   (npm run test:gamification)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const failures = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const eq = (got, want, label) => check(got === want, `${label}: 「${got}」 (기대 「${want}」)`);

async function load() {
  const stamp = Date.now();
  const entry = path.join(os.tmpdir(), `gamification-${stamp}.ts`);
  fs.writeFileSync(entry, `export * from ${JSON.stringify(path.join(root, 'src/lib/gamification.ts'))};\n`);
  const out = path.join(os.tmpdir(), `gamification-${stamp}.mjs`);
  await esbuild.build({ entryPoints: [entry], bundle: true, format: 'esm', outfile: out, logLevel: 'silent' });
  const mod = await import(pathToFileURL(out).href);
  fs.rmSync(entry, { force: true });
  fs.rmSync(out, { force: true });
  return mod;
}

const G = await load();

/* ── 빈 상태에서 첫 기록 ── */
{
  const r = G.recordActivity(G.emptyUserData(), 'daily_review', '2026-08-16');
  eq(r.changed, true, '첫 기록은 변한다');
  eq(r.newState.current, 1, '첫날 연속일');
  eq(r.newState.longest, 1, '첫날 최장');
  check(r.unlocked.includes('streak_first'), '첫 기록에 streak_first 가 열려야 한다');
  eq(r.exp, G.EXP_REWARDS.STREAK_COMPLETE + G.EXP_REWARDS.STREAK_BONUS_PER_DAY, '첫날 경험치');
}

/* ── ① 같은 날 두 번 ── */
{
  const first = G.recordActivity(G.emptyUserData(), 'daily_review', '2026-08-16');
  const again = G.recordActivity(first.data, 'daily_review', '2026-08-16');
  eq(again.changed, false, '같은 날 두 번째는 안 변한다');
  eq(again.exp, 0, '같은 날 두 번째는 경험치 0');
  eq(again.data.streaks.daily_review.current, 1, '같은 날 두 번째에도 1일');
}

/* ── 이어지는 날 ── */
{
  let d = G.emptyUserData();
  for (const day of ['2026-08-14', '2026-08-15', '2026-08-16']) {
    d = G.recordActivity(d, 'daily_review', day).data;
  }
  eq(d.streaks.daily_review.current, 3, '사흘 연속');
  eq(d.streaks.daily_review.longest, 3, '사흘 최장');
}

/* ── ② 건너뛰면 1 로, 최장은 유지 ── */
{
  let d = G.emptyUserData();
  for (const day of ['2026-08-10', '2026-08-11', '2026-08-12']) {
    d = G.recordActivity(d, 'daily_review', day).data;
  }
  d = G.recordActivity(d, 'daily_review', '2026-08-16').data; // 사흘 비었다
  eq(d.streaks.daily_review.current, 1, '끊기면 1 로');
  eq(d.streaks.daily_review.longest, 3, '끊겨도 최장은 3 유지');
}

/* ── ③ 달·해 넘어가기 ── */
{
  let d = G.recordActivity(G.emptyUserData(), 'exercise', '2026-01-31').data;
  d = G.recordActivity(d, 'exercise', '2026-02-01').data;
  eq(d.streaks.exercise.current, 2, '1/31 → 2/1 은 이어진다');

  let e = G.recordActivity(G.emptyUserData(), 'exercise', '2025-12-31').data;
  e = G.recordActivity(e, 'exercise', '2026-01-01').data;
  eq(e.streaks.exercise.current, 2, '12/31 → 1/1 은 이어진다');
}

/* ── 트랙은 서로 안 섞인다 ── */
{
  let d = G.recordActivity(G.emptyUserData(), 'daily_review', '2026-08-16').data;
  d = G.recordActivity(d, 'exercise', '2026-08-16').data;
  eq(d.streaks.daily_review.current, 1, '트랙 A');
  eq(d.streaks.exercise.current, 1, '트랙 B');
  eq(Object.keys(d.streaks).length, 2, '트랙 두 개');
}

/* ── 마일스톤은 딱 그날만 ── */
{
  let d = G.emptyUserData();
  let unlockedAt7 = [];
  let unlockedAt8 = [];
  for (let i = 1; i <= 8; i++) {
    const day = `2026-08-${String(i).padStart(2, '0')}`;
    const r = G.recordActivity(d, 'daily_review', day);
    d = r.data;
    if (i === 7) unlockedAt7 = r.unlocked;
    if (i === 8) unlockedAt8 = r.unlocked;
  }
  check(unlockedAt7.includes('streak_7'), '7일째에 streak_7');
  eq(unlockedAt8.length, 0, '8일째엔 새로 열리는 것 없음');
  eq(d.achievements.filter((a) => a === 'streak_7').length, 1, 'streak_7 은 한 번만 들어간다');
}

/* ── 레벨 ── */
{
  eq(G.calcLevel(0), 0, '경험치 0 = 레벨 0');
  eq(G.calcLevel(50), 1, '50 = 레벨 1');
  eq(G.calcLevel(199), 1, '199 = 아직 레벨 1');
  eq(G.calcLevel(200), 2, '200 = 레벨 2');
  eq(G.calcLevel(-10), 0, '음수도 안 죽는다');
  eq(G.getLevelRange(2).min, 200, '레벨 2 시작');
  eq(G.getLevelRange(2).max, 450, '레벨 3 시작');
  eq(G.getLevelProgress(200), 0, '레벨 막 올랐을 때 0');
  eq(G.getLevelProgress(325), 0.5, '레벨 2 절반');
}

/* ── 보너스는 10일에서 멈춘다 ── */
{
  const cap = G.EXP_REWARDS.STREAK_COMPLETE + G.EXP_REWARDS.STREAK_BONUS_PER_DAY * 10;
  let d = G.emptyUserData();
  let last = null;
  for (let i = 1; i <= 20; i++) {
    const day = `2026-08-${String(i).padStart(2, '0')}`;
    last = G.recordActivity(d, 'daily_review', day);
    d = last.data;
  }
  eq(d.streaks.daily_review.current, 20, '스무 날 연속');
  eq(last.exp, cap, '20일째 경험치도 10일치 상한');
}

/* ── 깨진 저장값을 만나도 한 모양으로 ── */
{
  const m = G.mergeUserData({ streaks: { a: { current: 'x', longest: 1 }, b: { current: 2, longest: 3 } } });
  eq(Object.keys(m.streaks).length, 1, '숫자가 아닌 연속일은 버린다');
  eq(m.streaks.b.lastActivityDate, '', '없는 날짜는 빈 문자열');
  eq(G.mergeUserData(null).totalExp, 0, 'null 도 안 죽는다');
  eq(G.mergeUserData({ achievements: 'nope' }).achievements.length, 0, '배열이 아니면 빈 배열');
}

/* ── 로컬 날짜 문자열 ── */
{
  eq(G.localDateString(new Date(2026, 0, 5)), '2026-01-05', '한 자리 달·날은 0 을 채운다');
  eq(G.localDateString(new Date(2026, 11, 31, 23, 59)), '2026-12-31', '밤 늦은 시각도 그날');
}

process.stdout.write('\n');
if (failures.length) {
  console.error(`\n[test-gamification] ${failures.length}건 실패:`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('[test-gamification] 다 통과');
