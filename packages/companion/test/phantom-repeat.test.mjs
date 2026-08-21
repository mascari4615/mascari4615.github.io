// 조용할 때 지어낸 말 — **사전이 아니라 모양으로** 잡는다 (TASK-KAR-240).
//
// 기억에 「자막 제공 및 자막 제공 및 광고를 포함하고 있습니다.」가 5건 남아 있다(107회차).
// 조수님은 그런 말을 한 적이 없다. 밖에서 배운 이름이 있다 — whisper 는 조용할 때 자막
// 상투구를 지어낸다(silence hallucination).
//
// 받아쓰기 관문(`heard.ts`)에 헛것 목록이 이미 있는데 이 문장은 통과했다. 목록에 없어서다.
// 그런데 74회차에 이미 배웠다 — **목록에 하나를 더하면 다음엔 다른 게 나온다.**
//
// 그래서 목록을 늘리는 대신 **모양**을 본다: 지어낸 글은 같은 구절을 되풀이한다
// (「자막 제공 및 **자막 제공 및** 광고를…」). 그건 어느 낱말이 오든 남는 자국이다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { looksLikeSpeech, keepReason } from '../dist/index.js';

test('같은 구절을 되풀이하는 글은 사람 말로 안 본다 (107회차 실측 문장)', () => {
  assert.equal(looksLikeSpeech('자막 제공 및 자막 제공 및 광고를 포함하고 있습니다.'), false);
});

test('되풀이가 길수록 더 확실하다', () => {
  assert.equal(looksLikeSpeech('감사합니다 감사합니다 감사합니다 감사합니다'), false);
  assert.equal(looksLikeSpeech('아 진짜 아 진짜 아 진짜 아 진짜'), false);
});

test('사람도 한 번쯤은 되풀이한다 — 두 번까지는 말로 본다', () => {
  assert.equal(looksLikeSpeech('아니 아니 그게 아니라 오늘 회의가 세 개였다고'), true);
  assert.equal(looksLikeSpeech('진짜 진짜 힘들었어'), true);
});

test('평범한 말은 그대로 지나간다', () => {
  for (const text of ['오늘 뭐 했어', '마라탕 못 먹겠더라', '이거 좀 봐줘']) {
    assert.equal(looksLikeSpeech(text), true, text);
  }
});

test('왜 안 받았는지 사람이 읽을 말로 남는다', () => {
  const why = keepReason('자막 제공 및 자막 제공 및 광고를 포함하고 있습니다.');
  assert.ok(why, '조용히 버리면 「왜 대답을 안 하지」가 된다');
  assert.match(why, /자막 제공/);
});
