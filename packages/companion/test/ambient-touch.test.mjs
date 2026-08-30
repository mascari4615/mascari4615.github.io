// 곁의 통로 목록이 **실제 통로보다 낡아** 있었다 (111회차).
//
// 110회차 재료에 이런 줄이 있었다:
//
//   - 2026. 8. 20. 조수님이: 조수님이 나를 붙잡아 끌고 다녔다.
//
// 화자는 조수님인데 내용은 얘 관점의 문장이다. 세어 보니 `touch` 채널이었다 . 
// 창을 붙잡아 끌면 얘가 스스로 만드는 감각인데, 곁의 통로 목록(AMBIENT_CHANNELS)에
// **그 이름이 없었다.** 목록은 screen, nudge, idle, clock 넷이고 그 뒤에 붙은 몸은 안 들어갔다.
//
// 그래서 나눈 말로 취급돼 회상에도, 마지막으로 나눈 얘기에도 실렸다
// (107회차의 nudge 오염에 인용돼 있던 그 문장이 바로 이것이다. 두 결함이 한 뿌리였다).
//
// 몸을 늘릴 때마다 이 목록이 낡는다. 그래서 **통로 이름을 손으로 두 번 적지 않는다** . 
// 몸이 쓰는 상수를 목록이 그대로 가져다 쓴다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { AMBIENT_CHANNELS, conversationOnly, TOUCH_CHANNEL, recallFrom } from '../dist/index.js';

test('닿음도 곁의 통로다. 사람이 건넨 말이 아니다', () => {
  assert.ok(AMBIENT_CHANNELS.includes(TOUCH_CHANNEL), '몸을 붙였는데 목록이 안 따라왔다');
});

test('닿음은 나눈 말에 안 들어간다', () => {
  const rows = [
    { role: 'sensed', channel: TOUCH_CHANNEL, text: '조수님이 나를 붙잡아 끌고 다녔다.', at: 1 },
    { role: 'sensed', channel: 'web', text: '오늘 뭐 했어?', at: 2 },
  ];
  const only = conversationOnly(rows);
  assert.equal(only.length, 1);
  assert.equal(only[0].channel, 'web');
});

test('닿음은 회상 재료도 되지 않는다', () => {
  const rows = [
    { role: 'sensed', channel: TOUCH_CHANNEL, text: '조수님이 나를 붙잡아 끌고 다녔다.', at: 1 },
  ];
  assert.deepEqual(recallFrom(() => rows)({ text: '붙잡아 끌고 다닌 거 얘기' }, []), []);
});
