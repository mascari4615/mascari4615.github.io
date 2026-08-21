// 누르는 손 (TASK-KAR-241 2단계).
//
// 104회차에 화면을 글자로 읽고, 117회차에 「무엇을 할 수 있나」를 싣고, 120회차에 번호를
// 붙였다. 이제 그 번호 하나로 누른다.
//
// 여기서 재는 것은 **말이 실제 동작으로 바뀌는 자리**다 — 두뇌가 「[3] 눌러」라고 하면
// 우리가 3번을 집는가, 화면이 그새 바뀌었으면 **엉뚱한 걸 누르지 않고 멈추는가**,
// 못 누르는 것이면 **못 누른다고 말하는가**. 조용한 실패가 제일 나쁘다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { pressHand } from '../dist/index.js';

function handWith(reply) {
  const calls = [];
  const hand = pressHand({
    run: async (args) => { calls.push(args); return reply; },
  });
  return { hand, calls };
}

test('되돌릴 수 없는 손이다 — 관문을 그냥 지나가면 안 된다', () => {
  const { hand } = handWith('PRESS=ok how=Invoke name=저장');
  assert.equal(hand.undoable, false);
  assert.equal(hand.name, '누르기');
});

test('번호만 줘도 누른다', async () => {
  const { hand, calls } = handWith('PRESS=ok how=Invoke name=저장');
  const said = await hand.run('3');
  assert.deepEqual(calls[0], { number: 3, expectName: '' });
  assert.match(said, /눌렀다/);
  assert.match(said, /저장/);
});

test('번호와 이름을 같이 주면 이름까지 넘긴다 — 화면이 바뀌었는지 보라고', async () => {
  const { hand, calls } = handWith('PRESS=ok how=Invoke name=탭 닫기');
  await hand.run('3 | 탭 닫기');
  assert.deepEqual(calls[0], { number: 3, expectName: '탭 닫기' });
});

test('화면이 그새 바뀌었으면 안 누르고 그렇게 말한다', async () => {
  const { hand } = handWith('PRESS=moved expected=탭 닫기 found=새 탭');
  const said = await hand.run('3 | 탭 닫기');
  assert.match(said, /바뀌|달라/);
  /* 「안 눌렀다」 안에 「눌렀다」가 들어 있다 — 글자만 세면 안 되고 **안** 을 봐야 한다. */
  assert.match(said, /안 눌렀다/);
});

test('못 누르는 것이면 못 누른다고 말한다 — 조용히 지나가지 않는다', async () => {
  const { hand } = handWith('PRESS=cannot name=그냥 글 patterns=');
  const said = await hand.run('7');
  assert.match(said, /못 누/);
});

test('번호가 아니면 무엇을 달라고 하는지 말한다', async () => {
  const { hand, calls } = handWith('PRESS=ok how=Invoke name=x');
  const said = await hand.run('저장 단추');
  assert.equal(calls.length, 0, '번호가 없는데 아무거나 누르면 안 된다');
  assert.match(said, /번호/);
});
