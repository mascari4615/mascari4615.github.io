// 회상은 **누구 말**을 뒤져야 하나 (110회차).
//
// 106회차에 알맹이 없는 제 말을 회상에서 뺐다. 그때 판정을 입 앞 지킴이(isHollow)에
// 맡겼는데, 세어 보니 그 방식이 새고 있었다:
//
//   내 말 579, 12자 이하 373(64%), 그중 지킴이가 잡는 것 46, 놓친 종류 182
//   놓친 것들: ...또 돌리네... 파일을 못 찾겠는데... 자고 싶어... 모르겠는데.
//
// 사전을 늘려서 될 일이 아니다. **짧은 게 이 얘의 인격**이라 넓게 자르면 인격을 죽이고,
// 좁게 자르면 계속 샌다. 애초에 두 판정이 다른 것이었다 . 
//  , 입 앞 관문 = 지금 이 말이 성의 없나 (인격을 지켜야 한다)
//  , 회상 재료 = 나중에 다시 볼 값어치가 있나 (인격과 무관하다)
//
// 그래서 사전이 아니라 **구조**로 가른다: 옛 기억을 뒤지는 목적은 거의 언제나 **사람이 한
// 말**을 찾는 것이다. 얘가 한 말은 사람이 그걸 콕 집어 물을 때만 값이 있다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { recallFrom } from '../dist/index.js';

const rows = [
  { role: 'said', channel: 'web', text: '마라탕은 자극적이라 안 맞을 거라고 했잖아', at: Date.now() },
  { role: 'sensed', channel: 'web', text: '마라탕 진짜 못 먹겠더라', at: Date.now() },
];
const ask = (text) => recallFrom(() => rows)({ text }, []);

test('보통 물음에는 사람이 한 말만 뒤진다', () => {
  const found = ask('마라탕 얘기 나왔었나');
  assert.equal(found.length, 1);
  assert.match(found[0], /조수님이/);
});

test('내가 뭐랬지라고 물으면 얘가 한 말도 뒤진다', () => {
  const found = ask('마라탕 얘기할 때 너 뭐랬지?');
  assert.equal(found.length, 2, `얘 말을 못 찾으면 그 물음엔 답할 수 없다: ${JSON.stringify(found)}`);
});

test('네가 그랬잖아도 같은 자리로 친다', () => {
  const found = ask('마라탕 그거 네가 그랬잖아');
  assert.equal(found.length, 2);
});
