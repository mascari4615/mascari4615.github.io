import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asksAboutFirstMeeting,
  firstMetNote,
  milestoneNote,
  milestoneToday,
  readTogether,
  milestoneDay,
} from '../dist/index.js';

const day = 86_400_000;
const dateStr = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const person = (at, channel = 'web') => ({ role: 'sensed', channel, text: '오늘 얘기', at });
const companion = (at) => ({ role: 'said', channel: 'web', text: '응', at });

// ── 함께한 시간 ─────────────────────────────────────────────────────

test('아무것도 없으면 함께한 시간도 없다', () => {
  assert.deepEqual(readTogether([]), { firstAt: null, dayNumber: 0, daysTalked: 0 });
});

test('처음 만난 날부터 며칠째인지 센다. 그날이 1일째다', () => {
  const first = dateStr(2026, 5, 1);
  assert.equal(readTogether([person(first)], first).dayNumber, 1);
  assert.equal(readTogether([person(first)], first + 9 * day).dayNumber, 10);
});

test('파일 순서를 믿지 않고 가장 이른 것을 찾는다. 옛 기록을 들여오면 순서가 섞인다', () => {
  const shuffled = [person(dateStr(2026, 8, 6)), person(dateStr(2026, 5, 10)), person(dateStr(2026, 8, 7))];
  assert.equal(readTogether(shuffled).firstAt, dateStr(2026, 5, 10));
});

test('며칠째와 며칠 얘기했나를 따로 센다. 매일 만난 백일과 띄엄띄엄 백일은 다르다', () => {
  const first2 = dateStr(2026, 5, 1);
  const sparse = [person(first2), person(first2 + 50 * day), person(first2 + 99 * day)];
  const t = readTogether(sparse, first2 + 99 * day);
  assert.equal(t.dayNumber, 100);
  assert.equal(t.daysTalked, 3);
});

test('같은 날 여러 번 얘기해도 하루로 센다', () => {
  const today = dateStr(2026, 5, 1);
  assert.equal(readTogether([person(today, 'web'), person(today + 1000), person(today + 2000)], today).daysTalked, 1);
});

test('화면에서 주워 온 것은 만난 것이 아니다. 곁눈질로 사이가 깊어지지 않는다', () => {
  const first3 = dateStr(2026, 5, 1);
  const es = [person(first3 - 30 * day, 'screen'), person(first3)];
  assert.equal(readTogether(es, first3).firstAt, first3);
});

test('얘가 한 말만 있으면 만난 게 아니다', () => {
  assert.equal(readTogether([companion(dateStr(2026, 5, 1))]).firstAt, null);
});

// ── 이정표 ──────────────────────────────────────────────────────────

test('정해 둔 날에만 이정표가 열린다', () => {
  const first4 = dateStr(2026, 5, 1);
  for (const d of milestoneDay) {
    assert.notEqual(milestoneToday([person(first4)], first4 + (d - 1) * day), null, `${d}일째`);
  }
});

test('아무 날도 아니면 null', () => {
  const first5 = dateStr(2026, 5, 1);
  assert.equal(milestoneToday([person(first5)], first5 + 40 * day), null);
});

test('지나간 이정표는 안 챙긴다. 사흘 전이 백일이었어는 계산이지 챙김이 아니다', () => {
  const first6 = dateStr(2026, 5, 1);
  assert.equal(milestoneToday([person(first6)], first6 + 102 * day), null);
});

test('이정표에 부르는 이름이 있다', () => {
  const first7 = dateStr(2026, 5, 1);
  assert.equal(milestoneToday([person(first7)], first7 + 99 * day).says, '백일');
  assert.equal(milestoneToday([person(first7)], first7 + 6 * day).says, '일주일');
});

test('만난 적이 없으면 이정표도 없다', () => {
  assert.equal(milestoneToday([], Date.now()), null);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('이정표인 날에만 한 줄이 나온다', () => {
  const first8 = dateStr(2026, 5, 1);
  assert.equal(milestoneNote([person(first8)], first8 + 40 * day), '');
  assert.notEqual(milestoneNote([person(first8)], first8 + 99 * day), '');
});

test('자랑하지 말라고 못 박는다. 축하 알림처럼 굴면 앱이지 곁이 아니다', () => {
  const first9 = dateStr(2026, 5, 1);
  const note = milestoneNote([person(first9)], first9 + 99 * day);
  assert.match(note, /백일/);
  assert.match(note, /축하 인사처럼 굴지 마라/);
  assert.match(note, /그냥 넘겨도 된다/);
});

test('며칠 얘기했는지도 같이 알려 준다', () => {
  const first10 = dateStr(2026, 5, 1);
  const es = [person(first10), person(first10 + 50 * day), person(first10 + 99 * day)];
  assert.match(milestoneNote(es, first10 + 99 * day), /3일 얘기했다/);
});

// ── 처음 만난 때 묻기 ───────────────────────────────────────────────

test('처음 만난 때를 묻는 말을 알아듣는다', () => {
  for (const q of ['우리 처음 만난 게 언제야?', '너랑 얼마나 됐지', '우리 며칠 됐어']) {
    assert.equal(asksAboutFirstMeeting(q), true, `${q}`);
  }
});

test('그냥 하는 말은 아니다', () => {
  for (const q of ['오늘 뭐 했어', '처음 보는 파일인데', '며칠 뒤에 회의야']) {
    assert.equal(asksAboutFirstMeeting(q), false, `${q}`);
  }
});

test('물으면 날짜로 답할 거리가 있다', () => {
  const first11 = dateStr(2026, 5, 1);
  const note = firstMetNote([person(first11)], first11 + 9 * day);
  assert.match(note, /2026년 5월 1일/);
  assert.match(note, /10일째/);
});

test('만난 적이 없으면 답할 거리도 없다', () => {
  assert.equal(firstMetNote([], Date.now()), '');
});
