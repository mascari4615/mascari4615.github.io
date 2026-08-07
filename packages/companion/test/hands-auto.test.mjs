import assert from 'node:assert/strict';
import test from 'node:test';

import { pickHand, 기본힌트 } from '../dist/index.js';

/** 이름만 있는 가짜 손들 — 고르는 규칙만 본다. */
const 손들 = ['시계', '창목록', '적어둔것보기', '파일찾기', '적어두기', '파일정보']
  .map((name) => ({ name, what: name, needs: '', run: async () => '' }));

const 고른것 = (said) => pickHand(said, 손들);

test('적어 두라는 말에 적어두기를 쓴다 — 곁에 두는 존재한테 가장 자주 시키는 일이다', () => {
  const r = 고른것('우유 사기 적어 둬');
  assert.equal(r?.hand.name, '적어두기');
  assert.equal(r?.argument, '우유 사기');
});

test('시키는 말은 떼어 낸다 — 「적어 둬」까지 적히면 안 된다', () => {
  assert.equal(고른것('내일 병원 가기 잊지 말고 메모해 줘')?.argument.includes('메모'), false);
});

test('파일이 언제 바뀌었는지 물으면 파일정보를 쓴다', () => {
  const r = 고른것('room.ts 언제 바뀌었어?');
  assert.equal(r?.hand.name, '파일정보');
  assert.equal(r?.argument, 'room.ts');
});

test('시각을 물으면 시계를 쓴다', () => {
  assert.equal(고른것('지금 몇 시야?')?.hand.name, '시계');
});

test('그냥 잡담엔 아무 손도 안 쓴다 — 넓게 잡으면 잡담마다 손이 돈다', () => {
  assert.equal(고른것('오늘 좀 피곤하네'), null);
  assert.equal(고른것('시간 없어 죽겠어'), null);
});

test('없는 손은 안 고른다 — 힌트만 있고 손이 없으면 그냥 지나간다', () => {
  assert.equal(pickHand('우유 사기 적어 둬', [손들[0]]), null);
});

test('힌트가 하나도 없는 손은 자동으로 쓰일 길이 없다 — 이번에 찾은 구멍이다', () => {
  const 힌트있는손 = new Set(기본힌트.map((h) => h.hand));
  // 「열기」는 되돌리기 어려워 일부러 뺐다. 나머지는 붙어 있어야 한다.
  for (const 이름 of ['시계', '창목록', '적어둔것보기', '파일찾기', '적어두기', '파일정보']) {
    assert.ok(힌트있는손.has(이름), `${이름} 에 힌트가 없다 — 만들어 두고 안 붙인 것과 같다`);
  }
});
