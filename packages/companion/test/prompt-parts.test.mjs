// **본문에 무엇이 실렸나**를 볼 수 있어야 한다 (TASK-KAR-201).
//
// 133회차에 「그림과 글자가 둘 다 두뇌에 가나」를 라이브로 재려다 **못 쟀다.**
// 계측 줄(`[두뇌인자]`)은 인자와 시스템 프롬프트만 찍고, **본문은 길이만** 찍는다 —
// 본문은 stdin 으로 가서 인자에 안 들어가기 때문이다.
//
// 그래서 「재료에 뭐가 들어갔는지」를 밖에서 볼 방법이 없었다. 35회차에 「도는지 모름」을
// 없애려고 발동 기록을 만든 것과 같은 자리다. 여기서는 **본문에 어떤 조각이 실렸는지**를
// 한 줄로 요약한다 — 본문을 통째로 찍으면 로그가 못 읽을 것이 된다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { promptParts } from '../dist/index.js';

test('그림과 글자가 둘 다 실렸으면 둘 다 보인다', () => {
  const line = promptParts([
    '지금까지 오간 말:\n조수님: 안녕',
    '방금 [web] 에게서 들어온 것:\n화면 좀 봐줘',
    '지금 이 사람 화면을 찍은 그림이 now.png 에 있다. 먼저 읽어서 보고 말해라.',
    '화면을 글자로도 읽었다 (그림과 다르면 이쪽이 맞다):\n- [1] Button 「저장」 (0,0,0,0)',
  ].join('\n\n'));
  assert.match(line, /그림/);
  assert.match(line, /글자/);
});

test('그림만 실렸으면 글자는 안 보인다 — 있는 척하면 안 된다', () => {
  const line = promptParts('지금 이 사람 화면을 찍은 그림이 now.png 에 있다.');
  assert.match(line, /그림/);
  assert.doesNotMatch(line, /글자/);
});

test('찾아본 것·손도 센다', () => {
  const line = promptParts('방금 찾아본 것:\n- 어제 마라탕 얘기\n\n[[누르기: 3]]');
  assert.match(line, /찾아본 것/);
});

test('아무 것도 없으면 없다고 한다 — 빈 줄을 내밀지 않는다', () => {
  assert.match(promptParts('그냥 한 마디'), /없/);
});
