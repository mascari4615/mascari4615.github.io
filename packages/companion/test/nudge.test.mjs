import assert from 'node:assert/strict';
import test from 'node:test';

import { nudgeSense, reasonToSpeak } from '../dist/index.js';

const 분 = 60_000;
const 시간 = 60 * 분;

const 기본 = {
  sinceTalkedMs: 30 * 분,
  wondering: null,
  windowTitle: null,
  lastWindowTitle: null,
  hour: 14,
};

test('방금까지 얘기하던 참이면 끼어들지 않는다', () => {
  assert.equal(reasonToSpeak({ ...기본, sinceTalkedMs: 2 * 분 }), null);
});

test('할 말이 없으면 조용하다 — 말 걸려고 말 걸지 않는다', () => {
  assert.equal(reasonToSpeak(기본), null);
});

test('하던 일이 바뀌면 그게 말 걸 이유가 된다', () => {
  const r = reasonToSpeak({ ...기본, sinceTalkedMs: 25 * 분, windowTitle: '새 창', lastWindowTitle: '옛 창' });
  assert.ok(r !== null);
  assert.match(r.why, /새 창/);
});

test('같은 창을 계속 보고 있으면 말 걸지 않는다', () => {
  assert.equal(reasonToSpeak({ ...기본, sinceTalkedMs: 25 * 분, windowTitle: '같은 창', lastWindowTitle: '같은 창' }), null);
});

test('한참 조용하면 담아 둔 궁금증을 꺼낸다', () => {
  const r = reasonToSpeak({ ...기본, sinceTalkedMs: 50 * 분, wondering: '그 게임 얘기' });
  assert.match(r.why, /그 게임 얘기/);
});

test('궁금증이 있어도 방금 얘기했으면 안 꺼낸다', () => {
  assert.equal(reasonToSpeak({ ...기본, sinceTalkedMs: 15 * 분, wondering: '그 게임 얘기' }), null);
});

test('새벽까지 안 자면 그건 말 걸 만한 일이다', () => {
  const r = reasonToSpeak({ ...기본, hour: 3, sinceTalkedMs: 40 * 분 });
  assert.match(r.why, /안 자고/);
});

test('아주 오래 못 봤으면 아는 척 한 번', () => {
  const r = reasonToSpeak({ ...기본, sinceTalkedMs: 9 * 시간 });
  assert.match(r.why, /오랜만/);
});

test('한 번에 한 가지 이유만 든다 — 여러 개를 쏟으면 알림이 된다', () => {
  const r = reasonToSpeak({
    ...기본, hour: 3, sinceTalkedMs: 9 * 시간, wondering: '뭐 하나', windowTitle: '새 창', lastWindowTitle: '옛 창',
  });
  assert.equal(typeof r.why, 'string');
  assert.equal(r.why.includes('오랜만') && r.why.includes('궁금'), false);
});

test('이유가 생기면 깨우고, 같은 이유로는 다시 안 깨운다', async () => {
  const woke = [];
  let reason = { why: '한마디', key: '같은이유' };
  const sense = nudgeSense({ everyMs: 15, reason: () => reason });
  sense.start((s) => woke.push(s.text));

  await new Promise((r) => setTimeout(r, 90));
  sense.stop();

  assert.deepEqual(woke, ['한마디'], '여러 번 살펴봐도 같은 이유면 한 번만');
});

test('이유가 없으면 아예 안 깨운다', async () => {
  const woke = [];
  const sense = nudgeSense({ everyMs: 15, reason: () => null });
  sense.start((s) => woke.push(s.text));
  await new Promise((r) => setTimeout(r, 80));
  sense.stop();
  assert.deepEqual(woke, []);
});

test('이유를 보다 터져도 조용히 넘어간다 — 깨우는 일이 멈추지 않게', async () => {
  const problems = [];
  const sense = nudgeSense({
    everyMs: 15,
    reason: () => { throw new Error('터짐'); },
    log: (m) => problems.push(m),
  });
  sense.start(() => {});
  await new Promise((r) => setTimeout(r, 50));
  sense.stop();
  assert.ok(problems.length > 0, '조용히 삼키지 않고 남긴다');
});
