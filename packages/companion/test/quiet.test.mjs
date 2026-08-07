import assert from 'node:assert/strict';
import test from 'node:test';

import { Quiet, asksForQuiet, asksToResume, quietNote } from '../dist/index.js';

const 분 = 60_000;

// ── 부탁 알아듣기 ───────────────────────────────────────────────────

test('조용히 해 달라는 말을 알아듣는다', () => {
  for (const 말 of ['좀 조용히 해', '지금 바빠', '이따 얘기하자', '나중에', '집중해야 해', '말 걸지 마']) {
    assert.notEqual(asksForQuiet(말), null, `${말} 은 조용히 해 달라는 말이다`);
  }
});

test('그냥 하는 말은 부탁이 아니다', () => {
  for (const 말 of ['오늘 회의 길었어', '셰이더 못 고쳤어', '뭐 하고 있었어']) {
    assert.equal(asksForQuiet(말), null, `${말}`);
  }
});

test('시간을 말하면 그만큼 조용히 있는다', () => {
  assert.equal(asksForQuiet('한 시간만 조용히 해').ms, 3600_000);
  assert.equal(asksForQuiet('20분만 조용히').ms, 20 * 분);
});

test('시간을 안 말하면 기본만큼', () => {
  assert.equal(asksForQuiet('좀 조용히 해', 10 * 분).ms, 10 * 분);
});

test('너무 짧게는 안 받는다 — 1초 조용은 조용이 아니다', () => {
  assert.ok(asksForQuiet('0분만 조용히').ms >= 분);
});

test('부탁에는 대꾸할 말이 딸려 온다', () => {
  assert.match(asksForQuiet('30분만 조용히').says, /30분/);
  assert.notEqual(asksForQuiet('좀 조용히').says.trim(), '');
});

test('「이제 됐어」는 푸는 말이다', () => {
  for (const 말 of ['이제 됐어', '다시 얘기하자', '이제 말해도 돼', '회의 끝났어']) {
    assert.equal(asksToResume(말), true, `${말}`);
  }
});

test('푸는 말이 섞이면 조용히 하라는 뜻이 아니다', () => {
  assert.equal(asksForQuiet('이제 됐어 조용히 안 해도 돼'), null);
});

// ── 조용히 있기 ─────────────────────────────────────────────────────

const 만들기 = (options = {}) => {
  let 지금 = new Date(2026, 1, 10, 14, 0).getTime();
  const q = new Quiet({ now: () => 지금, ...options });
  return { q, 흐르게: (ms) => { 지금 += ms; }, 시각: (h) => { 지금 = new Date(2026, 1, 10, h, 0).getTime(); } };
};

test('평소에는 먼저 말을 걸어도 된다', () => {
  assert.equal(만들기().q.maySpeakFirst, true);
});

test('부탁받으면 먼저 안 건다', () => {
  const { q } = 만들기();
  q.hushFor(30 * 분);
  assert.equal(q.maySpeakFirst, false);
  assert.equal(q.hushed, true);
});

test('시간이 지나면 저절로 풀린다 — 영영 입 다물지 않는다', () => {
  const { q, 흐르게 } = 만들기();
  q.hushFor(30 * 분);
  흐르게(31 * 분);
  assert.equal(q.maySpeakFirst, true);
});

test('「이제 됐어」로 바로 풀린다', () => {
  const { q } = 만들기();
  q.hushFor(60 * 분);
  q.resume();
  assert.equal(q.maySpeakFirst, true);
});

test('조용히 있는 중에 또 부탁하면 더 길게 — 짧아지지 않는다', () => {
  const { q } = 만들기();
  q.hushFor(60 * 분);
  q.hushFor(5 * 분);
  assert.equal(q.hushed, true);
  assert.match(q.leftSay(), /시간/);
});

test('남은 시간을 사람 말로 알려 준다', () => {
  const { q } = 만들기();
  q.hushFor(20 * 분);
  assert.match(q.leftSay(), /\d+분/);
  q.resume();
  assert.equal(q.leftSay(), '');
});

// ── 조용한 시간대 ───────────────────────────────────────────────────

test('밤에는 먼저 안 건다', () => {
  const { q, 시각 } = 만들기({ fromHour: 23, toHour: 7 });
  시각(2);
  assert.equal(q.inQuietHours, true);
  assert.equal(q.maySpeakFirst, false);
});

test('낮에는 괜찮다', () => {
  const { q, 시각 } = 만들기({ fromHour: 23, toHour: 7 });
  시각(14);
  assert.equal(q.inQuietHours, false);
});

test('밤을 넘어가는 구간도 제대로 본다 — 23시도 2시도 밤이다', () => {
  const { q, 시각 } = 만들기({ fromHour: 23, toHour: 7 });
  시각(23);
  assert.equal(q.inQuietHours, true);
  시각(22);
  assert.equal(q.inQuietHours, false);
});

test('한마디로 밤을 없앨 수는 없다 — 「이제 됐어」는 부탁만 푼다', () => {
  const { q, 시각 } = 만들기({ fromHour: 23, toHour: 7 });
  시각(2);
  q.hushFor(30 * 분);
  q.resume();
  assert.equal(q.hushed, false, '부탁은 풀렸다');
  assert.equal(q.maySpeakFirst, false, '그래도 밤이다');
});

test('시간대를 안 정하면 시간대 규칙은 없다', () => {
  const { q, 시각 } = 만들기();
  시각(3);
  assert.equal(q.inQuietHours, false);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('평소에는 아무 말도 안 얹는다', () => {
  assert.equal(quietNote(만들기().q), '');
});

test('조용 중이면 답은 하되 짧게 — 벙어리가 되라는 게 아니다', () => {
  const { q } = 만들기();
  q.hushFor(30 * 분);
  const note = quietNote(q);
  assert.match(note, /물으면 답하되/);
  assert.match(note, /먼저 말 걸지 마라/);
});

test('밤과 부탁을 다르게 말한다', () => {
  const { q, 시각 } = 만들기({ fromHour: 23, toHour: 7 });
  시각(2);
  assert.match(quietNote(q), /조용한 시간/);
  q.hushFor(30 * 분);
  assert.match(quietNote(q), /조수님이 조용히 있으라고/);
});
