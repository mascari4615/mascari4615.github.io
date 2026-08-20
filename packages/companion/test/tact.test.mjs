import assert from 'node:assert/strict';
import test from 'node:test';

import { tactfulAttention } from '../dist/index.js';

const seconds = 1000;
const minutes = 60 * seconds;

function ask(attention, { channel = 'screen', title = null, said = null, at = 1_000_000 } = {}) {
  const recent = said === null ? [] : [{ role: 'said', channel, text: '아까 한 말', at: said }];
  return attention.shouldRespond({
    sensation: { channel, kind: 'screen', text: '화면을 봤다.', at, meta: title === null ? {} : { windowTitle: title } },
    recent,
  });
}

function hint(idle, extra = {}) {
  return tactfulAttention({ now: () => 1_000_000, idleMs: () => idle, ...extra });
}

test('내가 직접 건 말은 눈치 안 본다', () => {
  const attention = hint(0);
  assert.equal(ask(attention, { channel: 'web' }).respond, true);
});

test('한창 타이핑 중이면 끊지 않는다', () => {
  assert.equal(ask(hint(3 * seconds)).respond, false);
});

test('오래 자리를 비웠으면 빈 자리에 말하지 않는다', () => {
  const decision = ask(hint(30 * minutes));
  assert.equal(decision.respond, false);
  assert.match(decision.reason, /자리에 없다/);
});

test('자리에 있는데 잠깐 손을 놓았으면 그때 말을 건다', () => {
  assert.equal(ask(hint(40 * seconds)).respond, true);
});

test('방금 말했으면 참는다', () => {
  const attention = hint(40 * seconds, { cooldownMs: 3 * minutes });
  assert.equal(ask(attention, { said: 1_000_000 - 30 * seconds }).respond, false);
});

test('아까랑 같은 창이면 또 말 걸지 않는다', () => {
  const attention = hint(40 * seconds);
  assert.equal(ask(attention, { title: '같은 창' }).respond, true, '처음엔 말한다');
  assert.equal(ask(attention, { title: '같은 창' }).respond, false, '두 번째는 참는다');
  assert.equal(ask(attention, { title: '다른 창' }).respond, true, '창이 바뀌면 다시 말한다');
});

test('손놀림을 못 재는 환경이면 그 판단만 건너뛰고 막지 않는다', () => {
  const attention = tactfulAttention({ now: () => 1_000_000, idleMs: () => null });
  assert.equal(ask(attention).respond, true);
});
