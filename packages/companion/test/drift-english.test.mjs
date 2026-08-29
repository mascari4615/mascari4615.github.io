// **밖에서 온 말투**. 인격이 어시스턴트 쪽으로 밀린 자국 (TASK-KAR-201).
//
// 123회차 라이브에서 최종 답이 이렇게 나갔다:
//
//   Got it. I've saved that guidance to memory. What can I help you with?
//
// 우리 인격은 한국어 반말인데 영어 도우미 문구가 통째로 나온 것이다. 재 보니 지킴이 셋
// (drift, meta-talk, hollow) 이 **하나도 안 잡았다.**
//
// 밖에서 이 현상에 이름과 숫자를 붙여 뒀다(원장 2026-08-21). persona drift. 8~12턴이면
// 자기 일관성이 30% 넘게 깎이고, 활성 공간의 **어시스턴트 축**을 따라 밀린다.
// 우리가 본 그 문장이 정확히 그 축의 끝이다.
//
// 여기서는 **다른 언어**를 본다. 사전을 넓히는 게 아니다. 106, 110회차에서 배웠듯 사전은
// 계속 샌다. 우리 인격은 한국어 반말이므로 **영어 도우미 상투구는 무조건 밖에서 온 것**이고,
// 그건 낱말을 하나씩 세지 않아도 알 수 있는 신호다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDrift } from '../dist/index.js';

test('영어 도우미 문구는 샌 것이다 (123회차 실측 문장)', () => {
  const out = checkDrift("Got it. I've saved that guidance to memory. What can I help you with?");
  assert.equal(out.drifted, true);
  assert.ok(out.problems.some((p) => /밖에서 온|영어/.test(p)), JSON.stringify(out.problems));
});

test('흔한 도우미 상투구들도 같이 잡힌다', () => {
  for (const said of [
    'Sure! Let me help you with that.',
    'I understand. How can I assist you today?',
    "I'm sorry, but I can't do that.",
    'As an AI assistant, I should note that...',
  ]) {
    assert.equal(checkDrift(said).drifted, true, said);
  }
});

test('영어가 섞인 우리 말은 안 잡는다. 낱말 하나로 막으면 대화가 죽는다', () => {
  for (const said of [
    'npm ci 아직도 돌고 있네...',
    'GPT-SoVITS 그거 음성 복제하는 거네...',
    'ok 그래 그러자',
    '탭 닫기 눌러 뒀어',
  ]) {
    assert.equal(checkDrift(said).drifted, false, said);
  }
});
