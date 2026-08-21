// 누른 **뒤에 무엇이 달라졌나** (TASK-KAR-241 다음 칸).
//
// 128회차에 진짜로 눌리는 걸 봤다. 그런데 손이 받는 건 `PRESS=ok` 하나뿐이고, 그건
// **「눌렀다」이지 「됐다」가 아니다.** 밖에서도 그 둘을 갈라 이름을 붙여 뒀다 —
// SenseAct 의 사후 조건, VisCritic 의 누르기 전후 비교(원장 2026-08-21).
//
// 저쪽은 그림을 견주지만 우리는 **글자 목록**을 들고 있다(104회차 트리). 누르기 전후로
// 창 이름과 요소 수를 견주면, 얘가 「눌렀어」가 아니라 **「눌렀더니 창 이름이 바뀌었어」**
// 라고 말할 수 있다. 40회차 관문(안 한 걸 했다고 말하기)이 지키려던 것을 한 걸음 더 민다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { readPressed } from '../dist/index.js';

test('창 이름이 바뀌었으면 그걸 말한다', () => {
  const said = readPressed('PRESS=ok how=Invoke name=PressMe was=PressProbe now=PressProbe-after count=5>5');
  assert.match(said, /눌렀다/);
  assert.match(said, /PressProbe-after/);
});

test('아무것도 안 달라졌으면 **그것도** 말한다 — 눌렀다고만 하면 안 한 걸 했다고 하는 셈이다', () => {
  const said = readPressed('PRESS=ok how=Invoke name=저장 was=메모장 now=메모장 count=12>12');
  assert.match(said, /눌렀/);
  assert.match(said, /달라진 게 없|그대로/);
});

test('요소 수가 달라졌으면 그걸로도 말한다', () => {
  const said = readPressed('PRESS=ok how=Invoke name=열기 was=창 now=창 count=12>20');
  assert.match(said, /12/);
  assert.match(said, /20/);
});

test('사후 조건이 안 실려 와도 예전처럼 말한다 — 옛 형식이 깨지면 안 된다', () => {
  const said = readPressed('PRESS=ok how=Invoke name=PressMe');
  assert.match(said, /PressMe/);
  assert.match(said, /눌렀다/);
});
