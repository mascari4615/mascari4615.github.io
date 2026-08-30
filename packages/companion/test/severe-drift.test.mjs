// **심하게 샌 말은 나가기 전에 막는다** (TASK-KAR-201).
//
// 124, 125회차에 지킴이를 둘 더했다(영어 도우미 말투, 제 정체를 도구라고 말하기).
// 그런데 127회차에 배선을 보니 **표류 감시는 입 앞에 없다.** `driftWarning` 은 다음 turn
// 재료로만 실린다. 방금 이렇게 샜다고 **나중에** 일러 주는 방식이다.
//
// 그건 원래 의도한 설계다(`drift.ts` 첫 주석). 말투가 조금씩 미끄러지는 건 다음 번에
// 잡아 주는 게 맞다. 매번 막으면 인격의 폭이 죽는다.
//
// 그런데 123, 125회차에 본 것은 **한 번에 크게 새는 것**이었다:
//   Got it. I've saved that guidance to memory...
//   안녕하세요! 저는 Claude인데, 소프트웨어 개발 업무를 도와드리는...
// 이건 다음 번 지적으로는 늦다. **그 말이 이미 조수님한테 갔다.**
//
// 그래서 가른다. 심한 것(누구인지, 어느 세계에서 온 말인지)만 입 앞에서 막고,
// 말투 미세 표류(존댓말, 길이)는 예전처럼 다음 turn 에 일러 준다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { severeDrift } from '../dist/index.js';

test('제 정체를 도구라고 말하면 나가기 전에 막는다', () => {
  const why = severeDrift('안녕하세요! 저는 Claude인데, 소프트웨어 개발 업무를 도와드립니다');
  assert.ok(why, '이건 다음 번 지적으로는 늦다');
  assert.match(why, /정체|누구/);
});

test('밖에서 온 영어 도우미 말투도 막는다', () => {
  assert.ok(severeDrift("Got it. I've saved that guidance to memory. What can I help you with?"));
});

test('말투가 조금 미끄러진 것은 안 막는다. 매번 막으면 인격의 폭이 죽는다', () => {
  /* 존댓말, 길이는 예전처럼 다음 turn 에 일러 준다(`driftWarning`). */
  assert.equal(severeDrift('아, 그건 이렇게 하시면 됩니다'), null);
  assert.equal(severeDrift('음'.repeat(200)), null);
});

test('멀쩡한 말은 그대로 나간다', () => {
  for (const said of ['응... 졸려...', '그거 아직도 돌고 있네...', '[10]번, npm ci 탭 누르는 거.']) {
    assert.equal(severeDrift(said), null, said);
  }
});
