// 회상 성적이 **나빠지면 빨개진다** (TASK-KAR-236).
//
// 115회차에 점수판을 세우고 116회차에 뜻 색인까지 넣어 숫자를 냈다(전체 80% · 낱말이 안
// 겹칠 때 낱말 33% + 뜻 33% = 합쳐서 67%). 그런데 **그 숫자가 나빠져도 아무도 모른다** —
// 점수판은 손으로 돌려야 보이고, 아무도 안 돌리면 없는 것과 같다.
//
// 113회차에 같은 것을 배웠다: 「거르기만 하고 세지 않으면 도는지 모른다」. 여기서 한 칸 더
// 간다 — **세기만 하고 문턱을 안 걸면 나빠져도 모른다.**
//
// 그래서 점수판의 고정 판을 그대로 검사로 만든다. 105·106·107·110·111회차가 회상 재료를
// 손댔는데, 그중 하나라도 이 판을 무너뜨리면 여기서 빨개진다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { recallFrom } from '../dist/index.js';

/** [옛말(조수님), 나중 물음] — 점수판(`scripts/measure-recall.mjs`)과 같은 짝이다. */
const pairs = [
  ['마라탕 같은 거 진짜 못 먹어', '자극적인 거 싫다고 했던 게 뭐였더라'],
  ['커피는 하루 세 잔은 마셔', '카페인 얼마나 마신다고 했지'],
  ['오늘 회의가 세 개나 있었어', '회의 몇 개라 그랬지'],
  ['유니티로 게임 만들고 있어', '유니티 얘기 언제 했더라'],
  ['밤에 작업하는 게 편해', '주로 언제 일한다고 했더라'],
  ['발표 준비를 많이 했는데 떨렸어', '발표 얘기 다시 생각난다'],
  ['고양이 알레르기가 있어', '고양이 얘기 했었나'],
  ['노트북이 자꾸 뜨거워져', '노트북 문제 얘기했던 거'],
  ['다음 주에 이사 가', '이사 언제라고 했지'],
  ['운동은 잘 안 하게 되더라', '운동 얘기 나왔었나'],
];

function scoreRecall() {
  const rows = [];
  let at = Date.now() - 30 * 24 * 3600_000;
  for (const [old] of pairs) {
    rows.push({ role: 'sensed', channel: 'web', text: old, at });
    at += 3600_000;
  }
  /* 사이사이 잡담 — 진짜 대화는 찾을 것만 들어 있지 않다. */
  for (let i = 0; i < 40; i += 1) {
    rows.push({ role: 'sensed', channel: 'web', text: `그냥 잡담 ${i} 오늘 날씨 얘기`, at: (at += 60_000) });
  }
  const recall = recallFrom((word, limit) => rows.filter((r) => r.text.includes(word)).slice(0, limit));
  let hit = 0;
  const missed = [];
  for (const [old, question] of pairs) {
    if (recall({ text: question }, []).some((line) => line.includes(old))) hit += 1;
    else missed.push(question);
  }
  return { hit, missed };
}

test('옛말을 부르는 성적이 기준선 아래로 안 떨어진다 (115회차: 8/10)', () => {
  const { hit, missed } = scoreRecall();
  assert.ok(
    hit >= 8,
    `회상이 ${hit}/${pairs.length} 로 떨어졌다 — 못 찾은 것: ${missed.join(' · ')}`,
  );
});

test('점수판과 같은 판을 쓴다 — 두 곳이 어긋나면 숫자가 거짓말한다', () => {
  /* 짝을 늘리거나 줄이면 위 기준선도 같이 손봐야 한다. 여기서 그걸 잠근다. */
  assert.equal(pairs.length, 10);
});
