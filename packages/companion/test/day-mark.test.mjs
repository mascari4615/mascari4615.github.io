import assert from 'node:assert/strict';
import test from 'node:test';

import { dayMark } from '../dist/index.js';

const day = 86_400_000;
/** 오늘 오후 2시로 고정 — 시계를 넣을 수 있어야 시험이 안 흔들린다. */
const daytime = new Date(2026, 1, 10, 14, 0).getTime();
const night = new Date(2026, 1, 10, 23, 30).getTime();

const person = (text, at) => ({ role: 'sensed', channel: 'web', text, at });
const companion = (text, at) => ({ role: 'said', channel: 'web', text, at });

test('처음 만난 사람에게는 매듭이 없다 — 어제가 없으니까', () => {
  assert.equal(dayMark([], { now: () => daytime }), null);
});

test('오늘 처음 만나면 그걸 안다', () => {
  const yesterday = [person('마녀 게임 만드는 중이야', daytime - day), companion('응…', daytime - day + 1)];
  const mark = dayMark(yesterday, { now: () => daytime });
  assert.equal(mark.kind, '첫인사');
  assert.match(mark.note, /마녀 게임/);
});

test('며칠 만인지도 안다', () => {
  const threeDaysAgo = [person('그때 얘기', daytime - 3 * day)];
  assert.match(dayMark(threeDaysAgo, { now: () => daytime }).note, /3일 만/);
});

test('오늘 이미 얘기했으면 첫인사가 아니다', () => {
  const entries = [person('어제 얘기', daytime - day), person('오늘 아침에 인사함', daytime - 3600_000)];
  assert.equal(dayMark(entries, { now: () => daytime }), null);
});

test('밤늦게 오늘 제법 얘기했으면 하루를 닫는다', () => {
  const today = [];
  for (let i = 0; i < 5; i += 1) today.push(person(`오늘 얘기 ${i}`, night - 3600_000 + i));
  const mark = dayMark(today, { now: () => night });
  assert.equal(mark.kind, '마무리');
  assert.match(mark.note, /하루가 저물었다/);
});

test('밤이어도 오늘 거의 안 얘기했으면 닫을 하루가 없다', () => {
  const today2 = [person('한마디', night - 60_000)];
  assert.equal(dayMark(today2, { now: () => night }), null);
});

test('낮에는 하루를 닫지 않는다', () => {
  const today3 = [];
  for (let i = 0; i < 6; i += 1) today3.push(person(`오늘 얘기 ${i}`, daytime - 3600_000 + i));
  assert.equal(dayMark(today3, { now: () => daytime }), null);
});

test('첫인사가 마무리보다 먼저다 — 오늘 처음 만난 게 지금 가장 큰 사실이다', () => {
  const yesterdayOnly = [person('어제 얘기', night - day)];
  assert.equal(dayMark(yesterdayOnly, { now: () => night }).kind, '첫인사');
});

test('어제 얘기 중 한 조각만 집으라고 일러 준다 — 요약도, 한 마디로 넘기기도 막는다', () => {
  const yesterday2 = [person('어제 얘기', daytime - day)];
  const note = dayMark(yesterday2, { now: () => daytime }).note;
  assert.match(note, /한 조각만 집어서/);
  assert.match(note, /늘어놓지도 마라/);
});

test('언제 하루를 닫을지는 밖에서 정할 수 있다', () => {
  const today4 = [];
  const evening = new Date(2026, 1, 10, 21, 0).getTime();
  for (let i = 0; i < 5; i += 1) today4.push(person(`얘기 ${i}`, evening - 3600_000 + i));
  assert.equal(dayMark(today4, { now: () => evening }), null);
  assert.equal(dayMark(today4, { now: () => evening, closingHour: 20 }).kind, '마무리');
});
