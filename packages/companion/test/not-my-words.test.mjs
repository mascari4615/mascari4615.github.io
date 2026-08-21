// **가짜 두뇌가 한 말은 내 말이 아니다** (TASK-KAR-201).
//
// 143회차에 재료를 열어 봤더니 이것이 들어 있었다:
//
//   조수님이 받아 준 내 말: 「(echo) 화면을 봤다. 지금 앞에 있는 창은 「Fa」(되물었다).
//   … 최근 8마디 중 3번을 「(echo)…」 로 시작했다. 말투가 굳었다 — 이번엔 다른 데서 시작해라.
//
// `echoBrain` 은 **LLM 없이 코어가 도는지 보려고 만든 가짜 두뇌**다. 방금 들은 감각을
// 「(echo) …」 로 그대로 돌려준다. 그런데 그 되울림이 **얘가 한 말(role: said)로 기억에
// 남았다.**
//
// 기억을 세어 봤다: **4516줄 중 128줄**. 그리고 그것이 세 군데를 오염시킨다.
//
//   ① 「조수님이 받아 준 내 말」 — 통한 말 본보기가 가짜 두뇌 것이다
//   ② 「말투가 굳었다」 판정 — 가짜 두뇌의 접두사를 얘 말버릇으로 오인한다
//   ③ 그 문장은 **화면 감각을 그대로 옮긴 것**이라, 「창은 「Fa」」 같은 토막이 남는다.
//      98회차의 「⠂ F만 띄워져 있네」와 같은 모양이다
//
// 고치는 자리는 둘이다. **남기지 않는 것**(앞으로)과 **읽을 때 거르는 것**(이미 남은 128줄).
// 하나만 하면 절반만 낫는다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { fromFakeBrain, landingNote } from '../dist/index.js';

const said = (text, at) => ({ role: 'said', channel: 'screen', text, at });
const heard = (text, at) => ({ role: 'sensed', channel: 'web', text, at });

test('가짜 두뇌의 되울림을 알아본다', () => {
  assert.equal(fromFakeBrain('(echo) 화면을 봤다. 지금 앞에 있는 창은 「무엇」.'), true);
});

test('얘가 진짜 한 말은 안 걸린다', () => {
  assert.equal(fromFakeBrain('…또 비디오네…'), false);
  assert.equal(fromFakeBrain('에코가 뭔지 알아?'), false);
  assert.equal(fromFakeBrain('(echo)'), false, '접두사만 있고 내용이 없으면 그냥 빈 말이다');
});

test('통한 말 본보기에 가짜 두뇌 말이 안 든다', () => {
  const entries = [
    said('(echo) 화면을 봤다. 지금 앞에 있는 창은 「무엇」.', 1000),
    heard('그게 뭐야?', 2000),
    said('오늘은 좀 조용하네…', 3000),
    heard('ㅋㅋㅋ', 4000),
  ];
  const note = landingNote(entries);
  assert.doesNotMatch(note, /\(echo\)/, `가짜 두뇌 말이 본보기로 올라왔다: ${note}`);
  assert.match(note, /조용하네/, '진짜 통한 말은 남아야 한다');
});

test('가짜 두뇌 말뿐이면 본보기를 아예 안 만든다 — 없는 것을 지어내지 않는다', () => {
  const entries = [
    said('(echo) 화면을 봤다. 지금 앞에 있는 창은 「무엇」.', 1000),
    heard('ㅋㅋㅋ', 2000),
  ];
  assert.equal(landingNote(entries), '');
});
