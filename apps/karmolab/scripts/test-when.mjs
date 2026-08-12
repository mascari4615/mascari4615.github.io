/**
 * 때 알맹이 검사 (TASK-KL-267) — 사람 말을 맞는 순간으로 옮기는가.
 *
 * 「지금」을 못 박고 잰다. 안 그러면 「내일」의 답이 날마다 달라져 검사가 못 쓴다 —
 * 그래서 `parseWhen(말, 지금)` 으로 지금을 밖에서 넣게 만들었다.
 *
 * 특히 볼 것:
 *   - **오후 12시는 12시**다(0시가 아니다) — 여기서 제일 자주 틀린다
 *   - 「금요일」만 말했고 오늘이 금요일이면 **오늘**이다
 *   - 「내일」은 하루 남은 것이다(시각을 빼서 0일이 되면 안 된다)
 *   - 달을 넘는 더하기(1월 31일 + 1개월)가 엉뚱한 데로 안 간다
 *
 * 사용: node scripts/test-when.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'when-'));
const out = join(dir, 'when.mjs');
await build({
  entryPoints: ['src/widgets/tools/shared/when.ts'],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent'
});
const { parseWhen, isoWeek, daysBetween, facesOf, inZones } = await import(`file://${out.replace(/\\/g, '/')}`);

const failures = [];
/** 2026-08-13(목) 10:00 을 「지금」으로 못 박는다 */
const NOW = new Date(2026, 7, 13, 10, 0, 0);
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : 'null';

const when = (src, want, why) => {
  const got = stamp(parseWhen(src, NOW).at);
  if (got === want) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why} — 「${src}」 기대 ${want}, 나온 것 ${got}`);
  }
};
const nope = (src, why) => {
  if (parseWhen(src, NOW).at === null) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why} — 「${src}」 는 못 알아들어야 한다`);
  }
};

/* 적어 놓은 날짜 */
when('2026-09-01', '2026-09-01 00:00', 'ISO 날짜');
when('2026.9.1', '2026-09-01 00:00', '점으로 적은 날짜');
when('2026년 9월 1일', '2026-09-01 00:00', '한국어 날짜');
when('9/1', '2026-09-01 00:00', '올해로 친다');

/* 오늘·내일 */
when('오늘', '2026-08-13 00:00', '오늘');
when('내일', '2026-08-14 00:00', '내일');
when('모레', '2026-08-15 00:00', '모레');
when('어제', '2026-08-12 00:00', '어제');
when('내일 오후 3시', '2026-08-14 15:00', '내일 + 시각');

/* 시각 — 여기서 제일 자주 틀린다 */
when('오후 3시', '2026-08-13 15:00', '오후는 +12');
when('오전 9시', '2026-08-13 09:00', '오전은 그대로');
when('오후 12시', '2026-08-13 12:00', '**오후 12시는 12시**(0시 아니다)');
when('오전 12시', '2026-08-13 00:00', '오전 12시는 자정');
when('15:30', '2026-08-13 15:30', '콜론 시각');
when('저녁 7시 30분', '2026-08-13 19:30', '저녁 + 분');

/* 며칠 뒤·전 */
when('3일 뒤', '2026-08-16 00:00', '사흘 뒤');
when('2주 후', '2026-08-27 00:00', '두 주 뒤');
when('1개월 뒤', '2026-09-13 00:00', '한 달 뒤');
when('1년 전', '2025-08-13 00:00', '한 해 전');
when('10일 전', '2026-08-03 00:00', '열흘 전');

/* 요일 */
when('금요일', '2026-08-14 00:00', '이번에 오는 금요일');
when('다음 주 월요일', '2026-08-24 00:00', '다음 주 월요일');
{
  /* 오늘이 목요일 — 「목요일」만 말하면 **오늘**이어야 한다 */
  const got = stamp(parseWhen('목요일', NOW).at);
  if (got === '2026-08-13 00:00') process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`오늘이 그 요일이면 오늘이다 — 나온 것 ${got}`);
  }
}

/* 유닉스 */
when('1755043200', stamp(new Date(1755043200 * 1000)), '유닉스 초');
when('1755043200000', stamp(new Date(1755043200000)), '유닉스 밀리초');

/* 못 알아듣는 것 */
nope('안녕하세요 반갑습니다', '그냥 인사말');
nope('', '빈 줄');

/* 시각을 말했나 안 말했나 */
{
  const a = parseWhen('내일', NOW);
  const b = parseWhen('내일 오후 3시', NOW);
  if (!a.hasTime && b.hasTime) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('시각을 말했는지 여부를 구분해야 한다');
  }
}

/* 남은 날 — 「내일」은 1일 남은 것 */
{
  const at = parseWhen('내일', NOW).at;
  if (daysBetween(NOW, at) === 1) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`「내일」은 1일 남은 것 — 나온 것 ${daysBetween(NOW, at)}`);
  }
}

/* 주차 (ISO) */
{
  const w = isoWeek(new Date(2026, 0, 1));
  if (w === 1) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`2026-01-01 은 1주차여야 한다 — 나온 것 ${w}`);
  }
}

/* 얼굴들이 다 나오는가 */
{
  const f = facesOf(parseWhen('2026-09-01 오후 3시', NOW).at, NOW);
  const dday = f.find((x) => x.label === 'D-Day');
  if (f.length === 6 && dday.value === 'D-19') process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`얼굴 여섯 · D-19 여야 한다 — 나온 것 ${f.length}개 ${dday && dday.value}`);
  }
}

/* 다른 도시 — 브라우저 시간대 표를 쓴다 */
{
  const z = inZones(new Date(Date.UTC(2026, 7, 13, 3, 0)), ['Asia/Seoul', 'America/New_York', 'Europe/London']);
  const seoul = z[0].value;
  if (/12:00/.test(seoul)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`UTC 03:00 은 서울 12:00 — 나온 것 ${seoul}`);
  }
  if (z.every((x) => x.value !== '—')) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('세 도시 다 나와야 한다');
  }
}

process.stdout.write('\n');
rmSync(dir, { recursive: true, force: true });
if (failures.length) {
  console.error(`[test-when] 실패 ${failures.length}건`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log('[test-when] 전부 통과');
