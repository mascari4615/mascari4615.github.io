// **목록이 무엇인지 정직하게 말한다** (TASK-KAR-246).
//
// 139회차에 실제 창들의 나무를 세어 봤다 (돌아가던 창 전부):
//
//   Discord         전체 532, 이름 있는 것 445, 화면 안 350
//   msedge          전체 777, 이름 있는 것 510, 화면 안 233
//   Unity            전체   9, 이름 있는 것   9, 화면 안   9
//   WindowsTerminal  전체  28, 이름 있는 것  19, 화면 안  18
//   NVIDIA Overlay   전체   0
//   TextInputHost    전체   0
//
// 두 가지가 나왔다.
//
// **하나. 0 의 까닭이 넷인데 한 줄로 뭉갠다.** 지금은 무슨 까닭이든
// 창 안에서 글자로 읽어 낸 것은 없다 하나다. 그런데 까닭은 (a) 창을 아예 못 잡았다
// (b) 나무가 비었다 (c) 다 이름이 없다 (d) 다 화면 밖이다. 넷이고, 두뇌는 전부
// **화면이 비었다**로 읽는다. NVIDIA Overlay 는 (b) 다. 하지만 Unity 는 **9개**뿐이라
// 거의 못 읽는 창인데도 아무 말이 없다. 98회차 F만 띄워져 있네가 이 자리다.
//
// **둘. 상한에 잘리는데 그걸 안 말한다.** 상한은 120 인데 msedge 는 화면 안에만 **233개**
// 다. 절반을 버리고도 목록은 읽은 것 120개라고 말한다. 두뇌는 그게 전부인 줄 안다.
//
// 없는 것과 못 읽은 것과 잘린 것은 **다른 말**이다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { describeScreen } from '../dist/index.js';

const one = (n) => ({ i: n, k: 'Button', n: `것${n}`, r: [n, n, 10, 10], p: ['Invoke'] });

test('창을 못 잡았으면 그렇게 말한다. 비었다고 하지 않는다', () => {
  const said = describeScreen({ title: '창', elements: [], reading: { root: false } });
  assert.match(said, /못/, `못 읽었다는 말이 없다: ${said}`);
  assert.doesNotMatch(said, /비었|아무것도 없/);
});

test('나무가 진짜 비었으면 비었다고 말한다', () => {
  const said = describeScreen({
    title: '창',
    elements: [],
    reading: { root: true, raw: 0, named: 0, onscreen: 0 },
  });
  assert.match(said, /없다/);
});

test('이름이 없어서 다 걸러졌으면 그렇게 말한다. 창은 안 비었다', () => {
  const said = describeScreen({
    title: '창',
    elements: [],
    reading: { root: true, raw: 40, named: 0, onscreen: 0 },
  });
  assert.match(said, /40/, `전체 개수를 안 말한다: ${said}`);
});

test('상한에 잘렸으면 잘렸다고 말한다. 목록이 전부인 줄 알면 안 된다', () => {
  const elements = Array.from({ length: 120 }, (_, at) => one(at + 1));
  const said = describeScreen({
    title: '창',
    elements,
    reading: { root: true, raw: 777, named: 510, onscreen: 233 },
  });
  assert.match(said, /233/, `화면 안에 몇 개였는지 안 말한다: ${said}`);
  assert.match(said, /더 있다/, `잘렸다는 말이 없다: ${said}`);
  /* 앞의 120개라고 하면 거짓말이다. 140회차부터 값어치로 고른다. */
  assert.doesNotMatch(said, /앞의/, `앞에서 자른 것처럼 말한다: ${said}`);
});

test('다 담겼으면 잘렸다는 말을 안 한다. 없는 걱정을 만들지 않는다', () => {
  const elements = Array.from({ length: 9 }, (_, at) => one(at + 1));
  const said = describeScreen({
    title: 'Unity',
    elements,
    reading: { root: true, raw: 9, named: 9, onscreen: 9 },
  });
  assert.doesNotMatch(said, /더 있|잘렸/);
  assert.match(said, /\[1\]/);
});

test('세어 본 것이 없으면 예전처럼 말한다. 옛 판을 안 깨뜨린다', () => {
  const said = describeScreen({ title: '창', elements: [one(1)] });
  assert.match(said, /창/);
  assert.match(said, /\[1\]/);
});
