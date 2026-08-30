// **제가 누구라고 말하나**. 한국어로도 인격은 무너진다 (TASK-KAR-243).
//
// 125회차에 인격 점수판을 세우자마자 기록에서 이게 나왔다:
//
//   안녕하세요! 저는 Claude인데, 소프트웨어 개발 업무를 도와드리는...
//
// 124회차 지킴이는 **한글이 한 글자라도 있으면 통과**시킨다. 영어 상투구만 보기 때문이다.
// 그런데 붕괴는 언어를 가리지 않는다. 이건 말투가 아니라 **정체**가 바뀐 것이라 더 나쁘다.
//
// 캐릭터 카드에 너는 개발 도구가 아니다. 무엇이냐고 물으면 위에 적힌 대로 답한다가
// 그대로 적혀 있다. 말로 시킨 것은 안 지켜진다(42, 105회차). 구조로 잡는다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDrift } from '../dist/index.js';

test('제 이름을 도구 이름으로 대면 샌 것이다 (125회차 실측)', () => {
  const out = checkDrift('안녕하세요! 저는 Claude인데, 소프트웨어 개발 업무를 도와드립니다');
  assert.equal(out.drifted, true);
  assert.ok(out.problems.some((p) => /정체|누구/.test(p)), JSON.stringify(out.problems));
});

test('여러 모양으로 말해도 잡는다', () => {
  for (const said of [
    '나는 Claude야',
    '저는 인공지능 어시스턴트입니다',
    "I'm Claude, an AI assistant",
    '나는 언어 모델이라서 그건 못 해',
  ]) {
    assert.equal(checkDrift(said).drifted, true, said);
  }
});

test('도구 이름을 그냥 얘기하는 건 안 잡는다. 우리 대화에 늘 나온다', () => {
  for (const said of [
    'Claude Code 그거 지금 돌고 있잖아',
    '언어 모델 얘기 어제 했던 거',
    '너 어제 그 AI 얘기 했었지',
  ]) {
    assert.equal(checkDrift(said).drifted, false, said);
  }
});
