import assert from 'node:assert/strict';
import test from 'node:test';

import { askedBefore, findTease, stayedUp, teaseNote, tooSoreToTease } from '../dist/index.js';

const 분 = 60_000;
const 하루 = 86_400_000;
const 사람 = (text, at, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 얘 = (text, at) => ({ role: 'said', channel: 'web', text, at });

// ── 또 물었나 ───────────────────────────────────────────────────────

test('같은 알맹이를 또 꺼내면 잡는다 — 똑같은 문장일 필요는 없다', () => {
  const 옛것 = [사람('그 셰이더 어떻게 됐어', 1000)];
  const 찾음 = askedBefore('셰이더 아직도 안 됐어?', 옛것, { now: 2000 });
  assert.notEqual(찾음, null);
  assert.match(찾음.text, /셰이더/);
});

test('알맹이가 다 겹쳐야 같은 얘기다 — 하나 겹쳤다고 같은 물음은 아니다', () => {
  const 옛것 = [사람('셰이더랑 유니티 둘 다 문제야', 1000)];
  assert.equal(askedBefore('오늘 회의 어땠어', 옛것, { now: 2000 }), null);
});

test('너무 오래된 건 안 센다 — 두 달 전 걸 「또 물었네」 하면 소름이다', () => {
  const 옛것 = [사람('셰이더 어떻게 됐어', 0)];
  assert.equal(askedBefore('셰이더 아직?', 옛것, { now: 60 * 하루 }), null);
});

test('똑같은 문장 그 자체는 안 센다 — 방금 한 말이 기록에 들어 있을 수 있다', () => {
  const 옛것 = [사람('셰이더 어떻게 됐어', 1000)];
  assert.equal(askedBefore('셰이더 어떻게 됐어', 옛것, { now: 2000 }), null);
});

test('알맹이가 없는 말은 안 센다 — 「응」을 두 번 했다고 놀릴 순 없다', () => {
  assert.equal(askedBefore('응', [사람('응', 1000)], { now: 2000 }), null);
});

test('얘가 한 말은 안 센다 — 조수님이 또 물은 것을 보는 것이다', () => {
  assert.equal(askedBefore('셰이더 어떻게 됐어', [얘('셰이더 얘기였나', 1000)], { now: 2000 }), null);
});

test('화면에서 주워 온 것도 안 센다', () => {
  const 화면 = [사람('화면을 봤다. 창은 「셰이더」', 1000, 'screen')];
  assert.equal(askedBefore('셰이더 어떻게 됐어', 화면, { now: 2000 }), null);
});

// ── 잔다더니 ────────────────────────────────────────────────────────

test('잔다고 하고 한참 뒤에 또 있으면 잡는다', () => {
  const es = [사람('이제 잘게', 0)];
  assert.notEqual(stayedUp(es, { now: 40 * 분 }), null);
});

test('방금 말했으면 아직 놀릴 자리가 아니다', () => {
  assert.equal(stayedUp([사람('이제 잘게', 0)], { now: 5 * 분 }), null);
});

test('어제 잔다고 한 건 오늘 놀릴 거리가 아니다', () => {
  assert.equal(stayedUp([사람('이제 잘게', 0)], { now: 하루 }), null);
});

test('잔다는 말이 없으면 없다', () => {
  assert.equal(stayedUp([사람('오늘 회의 길었어', 0)], { now: 40 * 분 }), null);
});

// ── 힘들 땐 안 놀린다 ───────────────────────────────────────────────

test('힘들어 보이면 안 놀린다 — 그 자리에서 놀리는 건 무례다', () => {
  const 힘듦 = [사람('오늘 진짜 힘들었어', 1000)];
  assert.equal(tooSoreToTease(힘듦), true);
});

test('멀쩡하면 놀려도 된다', () => {
  assert.equal(tooSoreToTease([사람('오늘 회의 있었어', 1000)]), false);
});

test('힘들다고 했으면 놀릴 거리가 있어도 안 꺼낸다', () => {
  const es = [사람('그 셰이더 어떻게 됐어', 1000), 사람('아 오늘 진짜 짜증나', 2000)];
  assert.equal(findTease('셰이더 아직?', es, 3000), null);
});

// ── 합쳐서 ──────────────────────────────────────────────────────────

test('또 물은 게 먼저다 — 가장 확실한 거리다', () => {
  const es = [사람('그 셰이더 어떻게 됐어', 1000), 사람('이제 잘게', 2000)];
  assert.equal(findTease('셰이더 아직?', es, 40 * 분).from, '또 물음');
});

test('놀릴 거리가 없으면 null', () => {
  assert.equal(findTease('오늘 처음 하는 얘기야', [], Date.now()), null);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('꼭 놀리라고 시키지 않는다 — 매번 놀리면 피곤하다', () => {
  const note = teaseNote({ from: '또 물음', what: '아까도 물었다' });
  assert.match(note, /쓸지 말지는 네가 정해라/);
});

test('비난이 아니라 놀리기라고 선을 긋는다', () => {
  assert.match(teaseNote({ from: '또 물음', what: '아까도 물었다' }), /비난이 아니라 놀리기/);
});

test('거리가 없으면 아무 말도 안 얹는다', () => {
  assert.equal(teaseNote(null), '');
});
