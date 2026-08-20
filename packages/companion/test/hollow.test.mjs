import assert from 'node:assert/strict';
import test from 'node:test';

import { hollowReason, hollowRetryNote, hollowStreak, isHollow, mouthGate } from '../dist/index.js';

const brain = (text) => ({ role: 'said', channel: 'web', text, at: 1, via: 'brain' });
const reflex = (text) => ({ role: 'said', channel: 'web', text, at: 1, via: 'reflex' });

// ── 텅 빔 가리기 ────────────────────────────────────────────────────

test('호응뿐인 대꾸는 텅 빈 것이다', () => {
  for (const t of ['…응…', '어…', '음.', '그래', '그렇구나', '오케이', '글쎄…']) {
    assert.equal(isHollow(t), true, `${t}`);
  }
});

test('짧아도 뜻이 있으면 텅 빈 게 아니다 — 「소파…」는 답이다', () => {
  for (const t of ['소파…', '쉬어…', '또 그러네…', '10시야']) {
    assert.equal(isHollow(t), false, `${t}`);
  }
});

test('빈 말은 텅 빈 것이다', () => {
  assert.equal(isHollow('   '), true);
});

// ── 연달아 세기 ─────────────────────────────────────────────────────

test('연달아 텅 빈 횟수를 센다', () => {
  assert.equal(hollowStreak([brain('소파…'), brain('응'), brain('음…')]), 2);
});

test('알맹이가 하나라도 있으면 거기서 끊긴다', () => {
  assert.equal(hollowStreak([brain('응'), brain('소파…')]), 0);
});

test('고정 대꾸는 안 센다 — 찌르기만 해도 벽으로 오진한다', () => {
  assert.equal(hollowStreak([reflex('…어?'), reflex('왜.'), reflex('응?')]), 0);
});

test('말이 없으면 0 이다', () => {
  assert.equal(hollowStreak([]), 0);
});

// ── 다시 시킬 이유 ──────────────────────────────────────────────────

test('한 번은 그냥 둔다 — 「응」 한마디가 딱 맞는 자리도 있다', () => {
  assert.equal(hollowReason('응', [brain('소파…')]), null);
});

test('연달아 텅 비면 다시 시킨다', () => {
  const why = hollowReason('음…', [brain('소파…'), brain('응')]);
  assert.notEqual(why, null);
  assert.match(why, /2번째/);
});

test('알맹이가 있으면 아무리 이어져도 안 잡는다', () => {
  assert.equal(hollowReason('셰이더 또 붙들었네', [brain('응'), brain('음…')]), null);
});

test('몇 번부터 잡을지 정할 수 있다 — 인격마다 다르다', () => {
  assert.notEqual(hollowReason('응', [], { atLeast: 1 }), null);
  assert.equal(hollowReason('응', [], { atLeast: 2 }), null);
});

test('길게 말하라고 하지 않는다 — 길이를 시키면 다른 인격이 된다', () => {
  const note = hollowRetryNote('2번째 알맹이 없는 대꾸다');
  assert.match(note, /길게 늘이지 말고/);
  assert.match(note, /하나만/);
});

// ── 입 앞 관문과 이어 보기 ──────────────────────────────────────────

test('텅 빈 말도 관문에서 다시 시킨다', async () => {
  let instructionReason = null;
  const gate = mouthGate({
    alsoRetryWhen: (t) => hollowReason(t, [brain('응'), brain('음…')]),
    retry: async (why) => { instructionReason = why; return '셰이더 얘기였나…'; },
  });
  assert.equal(await gate('어…'), '셰이더 얘기였나…');
  assert.match(instructionReason, /알맹이 없는/);
});

test('알맹이 있는 말은 그대로 나간다 — 관문은 조용해야 한다', async () => {
  const gate = mouthGate({ alsoRetryWhen: (t) => hollowReason(t, [brain('응'), brain('음…')]) });
  assert.equal(await gate('소파…'), '소파…');
  assert.equal(gate.stopped(), 0);
});

test('다시 시킨 것도 텅 비면 안 쓴다 — 같은 검사를 통과해야 한다', async () => {
  const gate = mouthGate({
    alsoRetryWhen: (t) => hollowReason(t, [brain('응'), brain('음…')]),
    retry: async () => '어…',
    fallbacks: ['…'],
  });
  assert.equal(await gate('음…'), '…');
});

test('표류와 텅 빔은 다른 말로 시킨다 — 고칠 데가 다르다', async () => {
  const reasons = [];
  const gate = mouthGate({
    alsoRetryWhen: (t) => hollowReason(t, [brain('응'), brain('음…')]),
    retry: async (why) => { reasons.push(why); return '괜찮은 말이야'; },
  });
  await gate('무엇을 도와드릴까요');
  await gate('어…');
  assert.equal(reasons.length, 2);
  assert.notEqual(reasons[0], reasons[1]);
  assert.match(reasons[1], /알맹이 없는/);
});

test('표류가 먼저다 — 둘 다면 말투부터 고친다', async () => {
  let reason = null;
  const gate = mouthGate({
    alsoRetryWhen: () => '알맹이 없는 대꾸다',
    retry: async (why) => { reason = why; return '응, 그거.'; },
  });
  await gate('무엇을 도와드릴까요');
  assert.match(reason, /말투가 조수 쪽으로 샜다/);
});
