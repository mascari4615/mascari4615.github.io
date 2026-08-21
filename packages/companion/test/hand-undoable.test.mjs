// 되돌릴 수 없는 손은 묻고 쓴다 (TASK-KAR-239).
//
// 104회차에 화면 요소의 **좌표**가 생겼다. 다음 칸이 누르기고, 그 순간 이 관문이 없으면
// 안 되는 것이 된다. 게다가 우리는 샌드박스가 아니라 조수님 화면 맨바닥에서 돈다.
//
// 밖의 표준은 「똑똑하게 판단하기」가 아니라 **규칙으로 잠그기**다. 기준은 하나 —
// 되돌릴 수 있나. 되돌릴 수 있는 것(읽기·찾기)은 안 묻는다. 다 물으면 아무도 안 읽는다.
//
// 기본값은 안전 쪽이다: **모르면 못 되돌린다**로 친다. 손을 새로 만든 사람이 표시를
// 잊었을 때 조용히 위험한 쪽으로 열리면 안 된다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { useHands } from '../dist/index.js';

function hand(name, undoable, ran) {
  return {
    name,
    what: '검사용',
    needs: '아무거나',
    ...(undoable === undefined ? {} : { undoable }),
    async run(argument) { ran.push(`${name}:${argument}`); return `${name} 했다`; },
  };
}

test('되돌릴 수 있는 손은 아무 것도 안 묻고 돈다', async () => {
  const ran = [];
  const asked = [];
  const done = await useHands([hand('찾아보기', true, ran)], [{ name: '찾아보기', argument: '마라탕' }], undefined, {
    allow: async (h) => { asked.push(h.name); return true; },
  });
  assert.deepEqual(ran, ['찾아보기:마라탕']);
  assert.deepEqual(asked, [], '읽기 손까지 물으면 아무도 안 읽는다');
  assert.equal(done.length, 1);
});

test('못 되돌리는 손은 묻고, 된다고 해야 돈다', async () => {
  const ran = [];
  const asked = [];
  await useHands([hand('열기', false, ran)], [{ name: '열기', argument: 'C:/어디/뭔가.txt' }], undefined, {
    allow: async (h, req) => { asked.push(`${h.name}:${req.argument}`); return true; },
  });
  assert.deepEqual(asked, ['열기:C:/어디/뭔가.txt']);
  assert.deepEqual(ran, ['열기:C:/어디/뭔가.txt']);
});

test('안 된다고 하면 안 돈다', async () => {
  const ran = [];
  const notes = [];
  await useHands([hand('열기', false, ran)], [{ name: '열기', argument: 'C:/어디/뭔가.txt' }], (m) => notes.push(m), {
    allow: async () => false,
  });
  assert.deepEqual(ran, []);
  assert.equal(notes.length, 1, '거절도 자국으로 남아야 한다');
  assert.match(notes[0], /열기/);
});

test('물어볼 자리가 아예 없으면 안 돈다 — 모르면 안전 쪽으로', async () => {
  const ran = [];
  const notes = [];
  await useHands([hand('열기', false, ran)], [{ name: '열기', argument: 'X' }], (m) => notes.push(m));
  assert.deepEqual(ran, []);
  assert.equal(notes.length, 1);
});

test('표시를 안 한 손은 못 되돌리는 것으로 친다', async () => {
  const ran = [];
  const asked = [];
  await useHands([hand('새로만든손', undefined, ran)], [{ name: '새로만든손', argument: 'Y' }], undefined, {
    allow: async (h) => { asked.push(h.name); return false; },
  });
  assert.deepEqual(asked, ['새로만든손'], '표시를 잊었는데 조용히 열리면 안 된다');
  assert.deepEqual(ran, []);
});
