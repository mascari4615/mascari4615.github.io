// **제 성적을 얘가 본다** (TASK-KAR-243).
//
// 115, 116(회상), 125, 126(인격), 128(누르기). 점수판을 셋이나 지었는데 전부 **우리가** 재는
// 것이다. 얘 자신은 제가 어떤지 모른다. 밖에서 이걸 **아는 것과 하는 것의 틈**이라 부르고,
// 모델이 제 능력을 물으면 **체계적으로 과신**한다는 게 결론이다(MIRROR, 원장 2026-08-21).
// 122회차에 누를게라고 말만 하고 안 누른 것이 우리 판의 그 틈이다.
//
// 그래서 방금 한 말들을 세어 **한 줄**로 돌려준다. 잔소리가 되면 87회차처럼 역효과라
// (강제 재시도가 멀쩡한 답을 무대 뒤 얘기로 바꿔 놨다) 짧아야 하고, **말할 게 없으면
// 아무 말도 안 한다.**

import assert from 'node:assert/strict';
import test from 'node:test';

import { selfScore } from '../dist/index.js';

const mine = (texts) => texts.map((text, i) => ({ role: 'said', channel: 'web', text, at: i }));

test('같은 말을 자꾸 하면 그걸 알려 준다', () => {
  const line = selfScore(mine(['응...', '응...', '응...', '응...', '그렇구나...', '응...']));
  assert.ok(line, '되풀이가 이만하면 말해 줘야 한다');
  assert.match(line, /되풀이|또/);
});

test('말이 길어지고 있으면 그것도 알려 준다', () => {
  const long = '아 그게 말이야 오늘 하루 종일 생각해 봤는데 결국 이런 얘기가 되는 것 같더라고 그러니까'.repeat(3);
  const line = selfScore(mine([long, long + '!', long + '?', long + '~']));
  assert.ok(line);
  assert.match(line, /길/);
});

test('멀쩡하면 아무 말도 안 한다. 잔소리는 그 자체로 표류를 만든다', () => {
  const line = selfScore(mine(['응... 졸려...', '그거 아직 도네...', '소파에서 잘래...', '아 그거 어제 그 얘기지...']));
  assert.equal(line, '');
});

test('말이 얼마 없으면 재지 않는다. 표본이 적으면 아무 말이나 하게 된다', () => {
  assert.equal(selfScore(mine(['응...', '응...'])), '');
});

test('사람이 한 말은 안 센다. 이건 **제** 성적이다', () => {
  const rows = [
    ...mine(['응...', '응...', '응...', '응...']),
    { role: 'sensed', channel: 'web', text: '응...', at: 99 },
  ];
  const line = selfScore(rows);
  assert.ok(line);
  assert.doesNotMatch(line, /5\/5/);
});
