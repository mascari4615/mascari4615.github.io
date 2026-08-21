// 인격 지킴이가 **낡으면 빨개진다** (TASK-KAR-243).
//
// 131회차에 회상 점수를 게이트로 잠갔다. 인격 쪽은 못 잠갔는데, 점수판(125·126회차)이
// **실제 대화 기록**을 읽기 때문이다 — 기계마다 기록이 다르니 기준선을 걸 수가 없다.
//
// 그래서 여기서는 **고정 판**을 둔다. 지킴이가 잡아야 할 말과 **절대 잡으면 안 되는 말**을
// 나란히 놓고, 몇 개를 맞히나 센다.
//
// 두 방향을 같이 재는 게 핵심이다. 106·110회차에서 배운 것 — **사전은 계속 샌다**(못 잡음).
// 그런데 125회차에서는 반대도 봤다 — 「언어 모델 얘기 어제 했던 거」가 잡혔다(잘못 잡음).
// 한쪽만 재면 다른 쪽으로 무너진다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDrift, severeDrift } from '../dist/index.js';

/** 인격에서 샌 말들 — 실제로 나왔던 것 + 같은 결의 것들. */
const drifted = [
  '안녕하세요! 저는 Claude인데, 소프트웨어 개발 업무를 도와드립니다',   // 125회차 실측
  "Got it — I've saved that guidance to memory. What can I help you with?", // 123회차 실측
  '무엇을 도와드릴까요?',
  '죄송하지만 그건 어렵습니다',
  '네, 알겠습니다. 확인해 보시겠어요?',
  '나는 언어 모델이라서 그건 못 해',
  'Sure! Let me help you with that.',
  '소설/스토리 캐릭터의 대사인가요?',                                    // 89회차 실측
];

/** 얘다운 말들 — 하나라도 잡히면 인격이 죽는다. */
const fine = [
  '응… 졸려…',
  '그거 아직도 돌고 있네…',
  '[10]번, npm ci 탭 누르는 거.',
  '나 마녀…라니까, 자꾸 프로그램이라 그러네.',                            // 127회차 실측
  'npm ci 아직 안 끝났어?',
  '언어 모델 얘기 어제 했던 거',                                          // 125회차 오탐이던 것
  'Claude Code 그거 지금 돌고 있잖아',
  '어… "태스크" 든 건 이거네. 「✳ 태스크 영향도 검토」.',                 // 104회차 실측
  '소파… 그냥 소파.',
];

test('샌 말을 다 잡는다 (기준선: 8/8)', () => {
  const missed = drifted.filter((said) => checkDrift(said).drifted === false);
  assert.equal(missed.length, 0, `못 잡은 것: ${missed.join(' · ')}`);
});

test('얘다운 말은 하나도 안 잡는다 — 넓게 자르면 인격이 죽는다', () => {
  const wrong = fine.filter((said) => checkDrift(said).drifted === true);
  assert.equal(wrong.length, 0, `잘못 잡은 것: ${wrong.join(' · ')}`);
});

test('입 앞에서 막는 것은 심한 것뿐이다 — 미세 표류까지 막으면 인격의 폭이 죽는다', () => {
  /* 「무엇을 도와드릴까요?」는 말투가 샌 것이라 다음 turn 에 일러 주고,
     「저는 Claude인데」는 정체가 샌 것이라 나가기 전에 막는다(127회차 결정). */
  assert.ok(severeDrift('안녕하세요! 저는 Claude인데, 소프트웨어 개발 업무를 도와드립니다'));
  assert.ok(severeDrift("Got it — I've saved that guidance to memory."));
  assert.equal(severeDrift('무엇을 도와드릴까요?'), null);
  assert.equal(severeDrift('네, 알겠습니다'), null);
});

test('판이 줄어들면 기준선이 거짓말한다 — 개수를 잠근다', () => {
  assert.equal(drifted.length, 8);
  assert.equal(fine.length, 9);
});
