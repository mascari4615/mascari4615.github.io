// 손이 막혔을 때 **두뇌가 그 사실을 안다** (TASK-KAR-241).
//
// 121회차 라이브: 「화면에서 아무거나 하나 눌러봐」 → `[참음] 누르기 은 조수님이 안 된다고
// 해서 안 했다` → **사람에게는 아무 말도 안 나갔다.** 관문이 막은 것은 옳지만, 막혔다는
// 사실이 두뇌한테 안 갔다. 그래서 얘는 「못 눌렀어」라고 말할 수가 없다.
//
// 조용히 안 하는 것과 못 한다고 말하는 것은 다르다 — 103회차에 두뇌가 터진 걸 창에 띄운
// 것과 같은 결이다. 곁에 있는 존재가 못 하는 걸 못 한다고 말 안 하면 그냥 고장으로 보인다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { useHands } from '../dist/index.js';

function hand(name, undoable) {
  return {
    name,
    what: '검사용',
    needs: '아무거나',
    undoable,
    async run() { return `${name} 했다`; },
  };
}

test('사람이 안 된다고 하면 그 사실이 결과로 돌아온다', async () => {
  const done = await useHands(
    [hand('누르기', false)],
    [{ name: '누르기', argument: '3' }],
    undefined,
    { async allow() { return false; } },
  );
  assert.equal(done.length, 1, '빈손으로 돌아오면 두뇌는 막힌 줄도 모른다');
  assert.match(done[0], /누르기/);
  assert.match(done[0], /안 된다/);
});

test('물어볼 자리가 없을 때도 그 사실이 돌아온다', async () => {
  const done = await useHands([hand('누르기', false)], [{ name: '누르기', argument: '3' }]);
  assert.equal(done.length, 1);
  assert.match(done[0], /물어/);
});

test('없는 손을 불러도 그 사실이 돌아온다', async () => {
  const done = await useHands([hand('누르기', true)], [{ name: '날아가기', argument: '' }]);
  assert.equal(done.length, 1);
  assert.match(done[0], /날아가기/);
});

test('잘 된 손은 예전처럼 결과만 돌아온다', async () => {
  const done = await useHands([hand('찾아보기', true)], [{ name: '찾아보기', argument: '마라탕' }]);
  assert.deepEqual(done, ['찾아보기 했다']);
});
