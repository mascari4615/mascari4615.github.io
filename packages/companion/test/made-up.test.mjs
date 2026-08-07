import assert from 'node:assert/strict';
import test from 'node:test';

import { factClaims, madeUpFact, madeUpRetryNote, mouthGate } from '../dist/index.js';

const 말 = (text) => ({ role: 'sensed', channel: 'web', text, at: 1 });

// ── 구체적 값 가리기 ────────────────────────────────────────────────

test('시각·날짜·파일 이름·개수를 구체적 값으로 본다', () => {
  assert.equal(factClaims('10시 28분이야').length, 1);
  assert.equal(factClaims('8월 7일에 했잖아').length, 1);
  assert.equal(factClaims('회의록.md 에 있어').length, 1);
  assert.equal(factClaims('세 개 아니고 12개야').length, 1);
});

test('두루뭉술한 말은 사실 주장이 아니다 — 애매한 걸 잡으면 아무 말도 못 한다', () => {
  for (const t of ['좀 늦었네', '그거 꽤 많던데', '아까 봤어', '피곤하겠다']) {
    assert.deepEqual(factClaims(t), [], t);
  }
});

// ── 근거 있나 ───────────────────────────────────────────────────────

test('찾아본 것에 있으면 지어낸 게 아니다', () => {
  assert.equal(madeUpFact('10시 28분이야', ['시계: 2026년 8월 7일 금요일 AM 10:28'], []), null);
});

test('찾아본 적 없으면 지어낸 것이다', () => {
  const why = madeUpFact('10시 28분이야', [], []);
  assert.notEqual(why, null);
  assert.match(why, /안 보고/);
  assert.match(why, /시각/);
});

test('조수님이 알려 준 걸 되뇌는 건 지어낸 게 아니다', () => {
  assert.equal(madeUpFact('3시 30분에 회의라며', [], [말('오늘 3시 30분에 회의야')]), null);
});

test('숫자가 하나라도 다르면 지어낸 것이다 — 비슷한 값으로 넘어가면 안 된다', () => {
  assert.notEqual(madeUpFact('10시 45분이야', ['시계: AM 10:28'], []), null);
});

test('파일 이름도 근거가 있어야 한다', () => {
  assert.equal(madeUpFact('회의록.md 에 있어', ['적어둔것보기: 회의록.md'], []), null);
  assert.notEqual(madeUpFact('회의록.md 에 있어', [], []), null);
});

test('하나만 짚는다 — 여러 개를 늘어놓으면 다시 시키는 말이 길어진다', () => {
  const why = madeUpFact('8월 7일 10시 28분에 12개 봤어', [], []);
  assert.equal((why.match(/안 보고/g) ?? []).length, 1);
});

test('구체적 값이 없으면 조용하다', () => {
  assert.equal(madeUpFact('그냥 좀 늦었네', [], []), null);
});

// ── 다시 시킬 때 ────────────────────────────────────────────────────

test('모른다고 해도 된다고 분명히 한다 — 그게 이 문제의 뿌리다', () => {
  const note = madeUpRetryNote('안 보고 시각을 지어냈다');
  assert.match(note, /모른다고 하는 게 손해가 아니다/);
  assert.match(note, /그럴듯한 숫자를 찍지 마라/);
});

// ── 관문과 이어 보기 ────────────────────────────────────────────────

test('지어낸 값은 관문에서 다시 시킨다', async () => {
  let 이유 = null;
  const gate = mouthGate({
    alsoRetryWhen: (t) => madeUpFact(t, [], []),
    retry: async (why) => { 이유 = why; return '몇 시인지는 모르겠어.'; },
  });
  assert.equal(await gate('10시 28분이야'), '몇 시인지는 모르겠어.');
  assert.match(이유, /안 보고/);
});

test('근거 있는 값은 그대로 나간다 — 관문은 조용해야 한다', async () => {
  const gate = mouthGate({ alsoRetryWhen: (t) => madeUpFact(t, ['시계: AM 10:28'], []) });
  assert.equal(await gate('10시 28분이야'), '10시 28분이야');
  assert.equal(gate.stopped(), 0);
});

test('다시 시킨 것도 지어냈으면 안 쓴다', async () => {
  const gate = mouthGate({
    alsoRetryWhen: (t) => madeUpFact(t, [], []),
    retry: async () => '11시 5분이야',
    fallbacks: ['…'],
  });
  assert.equal(await gate('10시 28분이야'), '…');
});

test('분이 없어도 시각 주장이다 — 「11시 쯤」이 새어 나갔다', () => {
  assert.equal(factClaims('11시 쯤이었나').length, 1);
  assert.notEqual(madeUpFact('11시 쯤이었나', [], []), null);
  assert.equal(madeUpFact('11시 쯤이었나', ['시계: AM 11:13'], []), null);
});

test('그래도 아무 숫자나 시각으로 보지는 않는다', () => {
  assert.deepEqual(factClaims('그거 세 번 했어'), []);
});

test('숫자는 붙어 있어야 근거다 — 흔한 숫자가 아무 데나 있어서 통과하면 안 된다', () => {
  const 흩어진것 = [말('11번 봤어'), 말('27개 있었나')];
  assert.notEqual(madeUpFact('11시 27분이었어', [], 흩어진것), null, '따로 있으면 근거가 아니다');
  assert.equal(madeUpFact('11시 27분이었어', ['시계: AM 11:27'], []), null, '붙어 있으면 근거다');
});

test('앞의 0 은 같은 값으로 본다 — 「09:05」와 「9시 5분」', () => {
  assert.equal(madeUpFact('9시 5분이야', ['시계: AM 09:05'], []), null);
});

test('얘가 한 말은 근거가 아니다 — 제가 지어낸 값을 제가 인용하면 영영 통과한다', () => {
  const 제말 = [{ role: 'said', channel: 'web', text: '…11시 27분이었어.', at: 1, via: 'brain' }];
  assert.notEqual(madeUpFact('11시 27분이었지', [], 제말), null);
});

test('조수님이 한 말은 여전히 근거다', () => {
  assert.equal(madeUpFact('11시 27분이었지', [], [말('11시 27분에 시작했어')]), null);
});
