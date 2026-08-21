// 「누를게」라고 **말만** 하는 것 (TASK-KAR-241).
//
// 121회차에 누르는 손을 붙였다. 122회차 라이브에서 「화면에서 아무거나 하나 눌러봐」라고
// 했더니 이렇게 답했다:
//
//   「뭔가 자꾸 돌고 있네… 아, 이거 누를게. 응, 최근 활동 정리 탭 누르고 올게…」
//
// **그리고 아무것도 안 눌렀다.** 손 표시(`[[누르기: 3]]`)를 안 적었기 때문이다.
// 42회차에 같은 것을 겪었다 — 두뇌더러 표를 적어 손을 부르라고 하면 안 쓴다(0/10).
//
// 40회차 관문은 「했다」는 거짓말을 잡는다. 이건 다르다 — **「할게」라고 하고 안 하는 것**이다.
// 41회차에 「약속을 막으면 안 된다」고 정했으니 넓게 잡으면 안 된다. 그래서 **지금 이 turn 에
// 해야 하는 일**(누르기)에만 좁게 건다: 누르겠다고 말했는데 안 눌렀으면 다시 시킨다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { promisedButSkipped } from '../dist/index.js';

test('누르겠다고 말했는데 안 눌렀으면 잡는다 (122회차 실측 문장)', () => {
  const why = promisedButSkipped('아, 이거 누를게. 응, 최근 활동 정리 탭 누르고 올게…', []);
  assert.ok(why, '말만 하고 안 하면 그건 안 한 것이다');
  assert.match(why, /누르/);
});

test('실제로 눌렀으면 안 잡는다', () => {
  assert.equal(promisedButSkipped('그 탭 누를게', ['누르기']), null);
});

test('누르는 얘기가 아니면 안 잡는다 — 약속을 막으면 아무 말도 못 한다', () => {
  for (const said of ['이따 적어둘게', '나중에 찾아볼게', '알겠어 그럴게', '음… 졸려…']) {
    assert.equal(promisedButSkipped(said, []), null, said);
  }
});

test('누르지 못한다고 말하는 것은 약속이 아니다', () => {
  assert.equal(promisedButSkipped('그건 못 누르겠는데', []), null);
  assert.equal(promisedButSkipped('안 누를래', []), null);
});
