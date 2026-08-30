// 회상 재료에 **다시 볼 값어치가 없는 것**이 자리를 먹고 있었다.
//
// 106회차 라이브에서 두뇌 재료를 그대로 찍어 봤다. 방금 찾아본 것 8줄 중 셋이
// 얘 자신이 한 말이었고, 그중 둘은 알맹이가 없었다:
//
//   - 2026. 8. 21. 내가: ...아니다.
//   - 2026. 8. 21. 내가: 아직도 npm ci 붙들고 있는데 시계까지 신경쓰냐, 조수님...
//
// 재료 자리는 8줄뿐이다(`recallFrom` 상한). ...아니다. 한 줄이 들어가면 진짜 옛 기억
// 하나가 밀려난다. 64회차에 겪은 가장 값진 재료가 가장 먼저 밀린다와 같은 모양이다.
//
// 얘가 한 말 전부를 빼지는 않는다. 저번에 내가 뭐랬지는 제 말이 있어야 답한다.
// 빼는 것은 **알맹이가 없는 것**뿐이다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { recallFrom } from '../dist/index.js';

/* 진짜 검색은 말끝을 깎아 가며 찾아서, ...아니다. 같은 줄도 어떤 조각엔 걸린다 . 
   라이브에서 실제로 그렇게 들어갔다. 여기서는 그 최악을 그대로 흉내 낸다. */
function rowsFrom(entries) {
  const search = () => entries;
  /* 110회차부터 회상은 기본이 사람이 한 말이다. 여기서는 얘 말까지 뒤지는 자리를
     재는 것이라 그 물음 모양을 쓴다. */
  return recallFrom(search)({ text: '마라탕 얘기할 때 너 뭐랬지' }, []);
}

test('알맹이 없는 제 말은 재료에 안 들어간다', () => {
  const rows = rowsFrom([
    { role: 'said', channel: 'web', text: '...아니다.', at: Date.now() },
    { role: 'said', channel: 'web', text: '응...', at: Date.now() },
    { role: 'sensed', channel: 'web', text: '마라탕 얘기 진짜 못 먹겠더라', at: Date.now() },
  ]);
  assert.equal(rows.length, 1, `알맹이 없는 줄이 남았다: ${JSON.stringify(rows)}`);
  assert.match(rows[0], /마라탕/);
});

test('알맹이 있는 제 말은 그대로 쓴다. 저번에 내가 뭐랬지는 그게 있어야 답한다', () => {
  const rows = rowsFrom([
    { role: 'said', channel: 'web', text: '마라탕은 자극적이라 조수님한테 안 맞을 것 같다고 했잖아', at: Date.now() },
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /내가/);
});

test('사람이 한 말은 짧아도 남긴다. 사람 말은 짧아도 사실이다', () => {
  const rows = rowsFrom([
    { role: 'sensed', channel: 'web', text: '마라탕 싫어', at: Date.now() },
  ]);
  assert.equal(rows.length, 1);
  assert.match(rows[0], /조수님이/);
});

// 우리가 넣은 지시문이 조수님이 한 말로 회상돼 나왔다.
//
// 107회차에 기억 파일을 세어 보니 `nudge` 채널로 담긴 줄이 7개고, 그 본문이 우리가 얘한테
// 넣는 지시문 그대로였다. ...그중 **한 조각만 집어서** 안부를 물어라. 게다가 그 안에
// 받아쓰기 환청(자막 제공 및 광고를 포함하고 있습니다)까지 인용돼 있었다.
//
// 곁의 채널(screen, nudge, idle, clock)을 빼는 것은 이미 여러 곳이 하고 있다
// (people, self-image, wish). 회상만 안 하고 있었다. 그래서 정본을 여기서도 쓴다.
test('곁의 채널(우리가 넣은 신호)은 회상 재료가 되지 않는다', () => {
  const rows = rowsFrom([
    { role: 'sensed', channel: 'nudge', text: '마라탕 얘기가 나왔다. 그중 한 조각만 집어서 안부를 물어라', at: Date.now() },
    { role: 'sensed', channel: 'screen', text: '화면을 봤다. 지금 앞에 있는 창은 마라탕.', at: Date.now() },
    { role: 'sensed', channel: 'web', text: '마라탕은 진짜 못 먹겠더라', at: Date.now() },
  ]);
  assert.equal(rows.length, 1, `곁의 채널이 남았다: ${JSON.stringify(rows)}`);
  assert.match(rows[0], /못 먹겠더라/);
});
