/**
 * 때 알맹이 검사 (TASK-KL-267). 사람 말을 맞는 순간으로 옮기는가.
 *
 * 지금을 못 박고 잰다. 안 그러면 내일의 답이 날마다 달라져 검사가 못 쓴다 . 
 * 그래서 `parseWhen(말, 지금)` 으로 지금을 밖에서 넣게 만들었다.
 *
 * 특히 볼 것:
 *   - **오후 12시는 12시**다(0시가 아니다). 여기서 제일 자주 틀린다
 *   - 금요일만 말했고 오늘이 금요일이면 **오늘**이다
 *   - 내일은 하루 남은 것이다(시각을 빼서 0일이 되면 안 된다)
 *   - 달을 넘는 더하기(1월 31일 + 1개월)가 엉뚱한 데로 안 간다
 *
 * 사용: node scripts/test-when.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* ★ **읽는 시계를 못 박는다** (2026-08-13).
 *
 * 서울 09시는 일하는 때 같은 기대는 **재는 컴퓨터가 서울일 때만** 맞다. `hourGrid` 는
 * 보는 사람의 하루(자정~자정)를 기준으로 칸을 만드는데. 그게 제품으로서는 옳다 . 
 * 검사가 그 기준을 안 박아 두면 CI(UTC)에서는 9번째 칸이 서울 18시가 되어 빨개진다.
 * 실측: 내 자리(KST)에서는 초록, `TZ=UTC` 로 돌리면 같은 2건이 그대로 실패했다.
 * 시계는 검사가 정한다. (사람의 시계를 따라가는 동작 자체를 보고 싶으면 그 검사를 따로 둔다.) */
process.env.TZ = 'Asia/Seoul';

const dir = mkdtempSync(join(tmpdir(), 'when-'));
const out = join(dir, 'when.mjs');
await build({
  entryPoints: ['src/widgets/tools/shared/when.ts'],
  bundle: true,
  format: 'esm',
  outfile: out,
  logLevel: 'silent'
});
const { parseWhen, isoWeek, daysBetween, facesOf, inZones, hourGrid, bestHours, easeOf } = await import(`file://${out.replace(/\\/g, '/')}`);

const failures = [];
/** 2026-08-13(목) 10:00 을 지금으로 못 박는다 */
const NOW = new Date(2026, 7, 13, 10, 0, 0);
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : 'null';

const when = (src, want, why) => {
  const got = stamp(parseWhen(src, NOW).at);
  if (got === want) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why}. ${src} 기대 ${want}, 나온 것 ${got}`);
  }
};
const nope = (src, why) => {
  if (parseWhen(src, NOW).at === null) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`${why}. ${src} 는 못 알아들어야 한다`);
  }
};

/* 적어 놓은 날짜 */
when('2026-09-01', '2026-09-01 00:00', 'ISO 날짜');
when('2026.9.1', '2026-09-01 00:00', '점으로 적은 날짜');
when('2026년 9월 1일', '2026-09-01 00:00', '한국어 날짜');
when('9/1', '2026-09-01 00:00', '올해로 친다');

/* 오늘, 내일 */
when('오늘', '2026-08-13 00:00', '오늘');
when('내일', '2026-08-14 00:00', '내일');
when('모레', '2026-08-15 00:00', '모레');
when('어제', '2026-08-12 00:00', '어제');
when('내일 오후 3시', '2026-08-14 15:00', '내일 + 시각');

/* 시각. 여기서 제일 자주 틀린다 */
when('오후 3시', '2026-08-13 15:00', '오후는 +12');
when('오전 9시', '2026-08-13 09:00', '오전은 그대로');
when('오후 12시', '2026-08-13 12:00', '**오후 12시는 12시**(0시 아니다)');
when('오전 12시', '2026-08-13 00:00', '오전 12시는 자정');
when('15:30', '2026-08-13 15:30', '콜론 시각');
when('저녁 7시 30분', '2026-08-13 19:30', '저녁 + 분');

/* 며칠 뒤, 전 */
when('3일 뒤', '2026-08-16 00:00', '사흘 뒤');
when('2주 후', '2026-08-27 00:00', '두 주 뒤');
when('1개월 뒤', '2026-09-13 00:00', '한 달 뒤');
when('1년 전', '2025-08-13 00:00', '한 해 전');
when('10일 전', '2026-08-03 00:00', '열흘 전');

/* 요일 */
when('금요일', '2026-08-14 00:00', '이번에 오는 금요일');
when('다음 주 월요일', '2026-08-24 00:00', '다음 주 월요일');
{
  /* 오늘이 목요일. 목요일만 말하면 **오늘**이어야 한다 */
  const got = stamp(parseWhen('목요일', NOW).at);
  if (got === '2026-08-13 00:00') process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`오늘이 그 요일이면 오늘이다. 나온 것 ${got}`);
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

/* 남은 날. 내일은 1일 남은 것 */
{
  const at = parseWhen('내일', NOW).at;
  if (daysBetween(NOW, at) === 1) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`내일은 1일 남은 것. 나온 것 ${daysBetween(NOW, at)}`);
  }
}

/* 주차 (ISO) */
{
  const w = isoWeek(new Date(2026, 0, 1));
  if (w === 1) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`2026-01-01 은 1주차여야 한다. 나온 것 ${w}`);
  }
}

/* 얼굴들이 다 나오는가 */
{
  const f = facesOf(parseWhen('2026-09-01 오후 3시', NOW).at, NOW);
  const dday = f.find((x) => x.label === 'D-Day');
  if (f.length === 6 && dday.value === 'D-19') process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`얼굴 여섯, D-19 여야 한다. 나온 것 ${f.length}개 ${dday && dday.value}`);
  }
}

/* 다른 도시. 브라우저 시간대 표를 쓴다 */
{
  const z = inZones(new Date(Date.UTC(2026, 7, 13, 3, 0)), ['Asia/Seoul', 'America/New_York', 'Europe/London']);
  const seoul = z[0].value;
  if (/12:00/.test(seoul)) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`UTC 03:00 은 서울 12:00. 나온 것 ${seoul}`);
  }
  if (z.every((x) => x.value !== '. ')) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('세 도시 다 나와야 한다');
  }
}

/* ── 시간 격자 (TASK-KL-287) ─────────────────────────────────────
 * 지금 저기가 몇 시(변환)와 **언제 다 같이 깨어 있나**(계획)는 다른 물음이다.
 * 뒤엣것은 한 순간이 아니라 하루가 통째로 있어야 답이 나온다. */
{
  const rows = hourGrid(NOW, ['Asia/Seoul', 'America/New_York']);
  if (rows.length === 2 && rows[0].cells.length === 24) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`도시마다 24칸이어야 한다. 나온 것 ${rows.length}줄 ${rows[0] && rows[0].cells.length}칸`);
  }
  const seoul9 = rows[0].cells[9];
  if (seoul9.hour === 9 && seoul9.ease === 'ok') process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`서울 09시는 일하는 때. 나온 것 ${seoul9.hour}시 ${seoul9.ease}`);
  }
  /* 서울 09시면 뉴욕은 **전날 20시**. 자는 때는 아니고 그럭저럭이다.
   * (처음엔 'bad' 로 적었다가 틀렸다: 저녁 8시를 자는 시간으로 본 건 내 착각이었다.) */
  const ny9 = rows[1].cells[9];
  if (ny9.hour === 20 && ny9.ease === 'meh' && ny9.dayShift === -1) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`서울 09시면 뉴욕은 전날 20시, 그럭저럭. 나온 것 ${ny9.hour}시 ${ny9.ease} 날짜차 ${ny9.dayShift}`);
  }
}

{
  const want = [[9, 'ok'], [17, 'ok'], [18, 'meh'], [7, 'meh'], [3, 'bad'], [23, 'bad']];
  let ok = true;
  for (const [h, e] of want) if (easeOf(h) !== e) ok = false;
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('일하는 때, 그럭저럭, 자는 때를 가른다');
  }
}

{
  const near = hourGrid(NOW, ['Asia/Seoul', 'Asia/Tokyo']);
  const good = bestHours(near).hours;
  if (good.length > 0 && good.every((i) => near.every((r) => r.cells[i].ease === 'ok'))) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(`가까운 두 도시는 겹치는 때가 있어야 한다. 나온 것 ${good.length}칸`);
  }
  /* 반대편끼리는 일하는 때가 안 겹칠 수 있다. 그러면 그럭저럭까지 받아 준다.
   * 빈손으로 두면 화면이 불가능이라 말하는데, 실제 답은 이른 아침, 늦은 밤이다. */
  const far = hourGrid(NOW, ['Asia/Seoul', 'America/Los_Angeles']);
  const farBest = bestHours(far);
  /* 반대편끼리는 다 편한 때가 아예 없을 수 있다. 그때는 **빈손이 아니라 덜 나쁜 때**를 준다 . 
   * 없다가 아니라 이만큼은 감수해야 한다가 진짜 답이다. */
  if (farBest.hours.length > 0) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('겹치는 때가 없어도 덜 나쁜 때는 짚어 줘야 한다');
  }
  if (farBest.level === 'least' ? true : farBest.hours.every((i) => far.every((r) => r.cells[i].ease !== 'bad'))) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push('그럭저럭 수준으로 골랐으면 자는 시간이 끼면 안 된다');
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
