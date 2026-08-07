import assert from 'node:assert/strict';
import test from 'node:test';

import { dayMark } from '../dist/index.js';

const 하루 = 86_400_000;
/** 오늘 오후 2시로 고정 — 시계를 넣을 수 있어야 시험이 안 흔들린다. */
const 낮 = new Date(2026, 1, 10, 14, 0).getTime();
const 밤 = new Date(2026, 1, 10, 23, 30).getTime();

const 사람 = (text, at) => ({ role: 'sensed', channel: 'web', text, at });
const 얘 = (text, at) => ({ role: 'said', channel: 'web', text, at });

test('처음 만난 사람에게는 매듭이 없다 — 어제가 없으니까', () => {
  assert.equal(dayMark([], { now: () => 낮 }), null);
});

test('오늘 처음 만나면 그걸 안다', () => {
  const 어제 = [사람('마녀 게임 만드는 중이야', 낮 - 하루), 얘('응…', 낮 - 하루 + 1)];
  const mark = dayMark(어제, { now: () => 낮 });
  assert.equal(mark.kind, '첫인사');
  assert.match(mark.note, /마녀 게임/);
});

test('며칠 만인지도 안다', () => {
  const 사흘전 = [사람('그때 얘기', 낮 - 3 * 하루)];
  assert.match(dayMark(사흘전, { now: () => 낮 }).note, /3일 만/);
});

test('오늘 이미 얘기했으면 첫인사가 아니다', () => {
  const entries = [사람('어제 얘기', 낮 - 하루), 사람('오늘 아침에 인사함', 낮 - 3600_000)];
  assert.equal(dayMark(entries, { now: () => 낮 }), null);
});

test('밤늦게 오늘 제법 얘기했으면 하루를 닫는다', () => {
  const 오늘 = [];
  for (let i = 0; i < 5; i += 1) 오늘.push(사람(`오늘 얘기 ${i}`, 밤 - 3600_000 + i));
  const mark = dayMark(오늘, { now: () => 밤 });
  assert.equal(mark.kind, '마무리');
  assert.match(mark.note, /하루가 저물었다/);
});

test('밤이어도 오늘 거의 안 얘기했으면 닫을 하루가 없다', () => {
  const 오늘 = [사람('한마디', 밤 - 60_000)];
  assert.equal(dayMark(오늘, { now: () => 밤 }), null);
});

test('낮에는 하루를 닫지 않는다', () => {
  const 오늘 = [];
  for (let i = 0; i < 6; i += 1) 오늘.push(사람(`오늘 얘기 ${i}`, 낮 - 3600_000 + i));
  assert.equal(dayMark(오늘, { now: () => 낮 }), null);
});

test('첫인사가 마무리보다 먼저다 — 오늘 처음 만난 게 지금 가장 큰 사실이다', () => {
  const 어제만 = [사람('어제 얘기', 밤 - 하루)];
  assert.equal(dayMark(어제만, { now: () => 밤 }).kind, '첫인사');
});

test('어제 얘기 중 한 조각만 집으라고 일러 준다 — 요약도, 한 마디로 넘기기도 막는다', () => {
  const 어제 = [사람('어제 얘기', 낮 - 하루)];
  const note = dayMark(어제, { now: () => 낮 }).note;
  assert.match(note, /한 조각만 집어서/);
  assert.match(note, /늘어놓지도 마라/);
});

test('언제 하루를 닫을지는 밖에서 정할 수 있다', () => {
  const 오늘 = [];
  const 저녁 = new Date(2026, 1, 10, 21, 0).getTime();
  for (let i = 0; i < 5; i += 1) 오늘.push(사람(`얘기 ${i}`, 저녁 - 3600_000 + i));
  assert.equal(dayMark(오늘, { now: () => 저녁 }), null);
  assert.equal(dayMark(오늘, { now: () => 저녁, closingHour: 20 }).kind, '마무리');
});
