import assert from 'node:assert/strict';
import test from 'node:test';

import { isBroken, brokenLines } from '../dist/index.js';

test('실제로 깨져 들어온 말을 잡는다', () => {
  const why = isBroken('���� �����');
  assert.notEqual(why, null);
  assert.match(why, /깨져/);
});

test('멀쩡한 한글은 안 막는다', () => {
  assert.equal(isBroken('오늘 발표 진짜 망했어'), null);
});

test('이모지·특수문자는 깨진 게 아니다 — 멀쩡한 말이 막히면 안 된다', () => {
  assert.equal(isBroken('오늘 진짜 좋았어 🎉🎉 ~!@#'), null);
  assert.equal(isBroken('coffee & 커피 — 둘 다'), null);
});

test('하나쯤 섞인 건 그냥 둔다 — 진짜로 그 글자를 붙여 넣었을 수 있다', () => {
  assert.equal(isBroken('이 글자 � 이거 뭐야 왜 이렇게 나와'), null);
});

test('빈 말은 깨진 게 아니다', () => {
  assert.equal(isBroken(''), null);
  assert.equal(isBroken('   '), null);
  assert.equal(isBroken(null), null);
});

test('쌓인 것 중 깨진 줄만 골라낸다', () => {
  const lines = [
    { text: '오늘 발표 망했어' },
    { text: '���� ����' },
    { text: '내일은 괜찮겠지' },
  ];
  const selected = brokenLines(lines);
  assert.equal(selected.length, 1);
  assert.match(selected[0].text, /�/);
});

test('고르기는 지우지 않는다 — 무엇이 지워질지 먼저 볼 수 있어야 한다', () => {
  const lines2 = [{ text: '�����' }];
  brokenLines(lines2);
  assert.equal(lines2.length, 1);
});
