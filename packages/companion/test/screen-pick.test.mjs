// **무엇을 목록에 넣을까** — 자르는 기준이 「나무 순서」였다 (TASK-KAR-246).
//
// 139회차에 목록이 전부인 척하지 않게 했다. 그런데 **무엇을 남기는지**는 안 봤다.
// 140회차에 쟀다 (창별로, 화면 안에 있는 것만):
//
//   Discord  화면 안 599 · 만질 수 있는 것 292 → 목록에 든 것 **59** (밖으로 밀린 것 233)
//   msedge   화면 안 182 · 만질 수 있는 것 135 → 목록에 든 것 100 (밀린 것 35)
//
// **Discord 는 만질 수 있는 것의 80%가 밀려난다.** 까닭은 자르는 기준이 값어치가 아니라
// **나무 순서**이기 때문이다. 나무 순서는 창틀·툴바가 먼저고 내용이 뒤다. 게다가 만질 수
// 없는 Text 가 자리를 잡아먹는다 — Discord 에서 버려진 479개 중 Text 가 203개인데,
// 앞 120 안에도 Text 가 들어 있었다.
//
// 뉴로 대조표에서 우리 갭은 전부 **행동** 쪽이다. 누를 수 있는 것이 목록에 없으면 두뇌는
// 그것이 **존재하는 줄도 모른다.**
//
// 번호는 **안 바꾼다.** 번호는 창을 걷는 순서가 매기고, 누르는 쪽(`press-element.ps1`)이
// 같은 순서로 다시 걸어 찾는다. 목록에서 몇 개 빠졌다고 다시 매기면 **엉뚱한 것을 누른다.**

import assert from 'node:assert/strict';
import test from 'node:test';

import { pickWorthShowing } from '../dist/index.js';

const act = (i) => ({ i, k: 'Button', n: `누를것${i}`, r: [i, i, 20, 20], p: ['Invoke'] });
const text = (i) => ({ i, k: 'Text', n: `글${i}`, r: [i, i, 20, 20], p: [] });

test('만질 수 있는 것이 먼저 든다 — 뒤에 있어도', () => {
  const all = [...Array.from({ length: 5 }, (_, at) => text(at + 1)), act(6), act(7)];
  const picked = pickWorthShowing(all, 3);
  assert.equal(picked.length, 3);
  assert.ok(picked.some((one) => one.i === 6), '뒤에 있던 누를 것이 안 들었다');
  assert.ok(picked.some((one) => one.i === 7), '뒤에 있던 누를 것이 안 들었다');
});

test('번호를 다시 매기지 않는다 — 다시 매기면 엉뚱한 것을 누른다', () => {
  const picked = pickWorthShowing([text(1), text(2), act(3)], 2);
  for (const one of picked) {
    assert.ok([1, 2, 3].includes(one.i), `번호가 바뀌었다: ${one.i}`);
  }
  assert.ok(picked.some((one) => one.i === 3));
});

test('걷던 순서를 지킨다 — 목록이 화면 위에서 아래로 읽혀야 한다', () => {
  const all = [act(1), text(2), act(3), text(4), act(5)];
  const picked = pickWorthShowing(all, 5);
  assert.deepEqual(picked.map((one) => one.i), [1, 2, 3, 4, 5]);
});

test('자리가 남으면 읽을 거리도 넣는다 — 만질 것만 있으면 무슨 창인지 모른다', () => {
  const all = [text(1), text(2), act(3)];
  const picked = pickWorthShowing(all, 3);
  assert.equal(picked.length, 3);
  assert.ok(picked.some((one) => one.k === 'Text'));
});

test('상한보다 적으면 그대로 둔다', () => {
  const all = [act(1), text(2)];
  assert.deepEqual(pickWorthShowing(all, 120), all);
});

test('만질 수 있는 것만으로 상한이 넘치면 앞에서부터 — 실측 Discord 292개 자리', () => {
  const all = Array.from({ length: 292 }, (_, at) => act(at + 1));
  const picked = pickWorthShowing(all, 120);
  assert.equal(picked.length, 120);
  assert.equal(picked[0].i, 1);
  assert.equal(picked[119].i, 120);
});
