import assert from 'node:assert/strict';
import test from 'node:test';

import { Backchannel } from '../dist/index.js';

const 초 = 1000;
const 맞장구 = (options = {}) => new Backchannel({ withinMs: 2500, roll: () => 0, ...options });

test('첫 마디에는 맞장구를 안 친다 — 그건 듣는 게 아니라 흘리는 것이다', () => {
  assert.equal(맞장구().heard(0), null);
});

test('이어서 두 번째 마디가 오면 받아 준다', () => {
  const b = 맞장구();
  b.heard(0);
  assert.notEqual(b.heard(900), null);
});

test('한 뭉치에 한 번만 — 마디마다 「응」 「응」 하면 소음이다', () => {
  const b = 맞장구();
  b.heard(0);
  assert.notEqual(b.heard(900), null);
  assert.equal(b.heard(1800), null);
  assert.equal(b.heard(2700), null);
});

test('한참 있다 말하면 새 뭉치다 — 이어 말한 게 아니다', () => {
  const b = 맞장구();
  b.heard(0);
  assert.equal(b.heard(60 * 초), null, '새 뭉치의 첫 마디에는 안 친다');
  assert.notEqual(b.heard(60 * 초 + 500), null, '그 다음 마디에는 친다');
});

test('얼마나 빨라야 이어 말한 것인지 정할 수 있다', () => {
  const 좁게 = 맞장구({ withinMs: 500 });
  좁게.heard(0);
  assert.equal(좁게.heard(900), null, '0.9초는 이어 말한 게 아니다');

  const 넓게 = 맞장구({ withinMs: 5000 });
  넓게.heard(0);
  assert.notEqual(넓게.heard(900), null);
});

test('답이 나가면 뭉치가 끝난다 — 답한 뒤의 맞장구는 뒷북이다', () => {
  const b = 맞장구();
  b.heard(0);
  b.heard(900);
  assert.equal(b.used, true);

  b.answered();
  assert.equal(b.used, false);
  assert.equal(b.heard(1800), null, '답 뒤 첫 마디는 새 뭉치의 첫 마디다');
  assert.notEqual(b.heard(2200), null);
});

test('같은 소리를 연달아 내지 않는다', () => {
  const b = 맞장구();
  b.heard(0);
  const 첫번 = b.heard(900);
  b.answered();
  b.heard(2000);
  const 두번 = b.heard(2500);
  assert.notEqual(두번, 첫번);
});

test('내는 소리는 아주 짧다 — 길면 그건 맞장구가 아니라 끼어드는 것이다', () => {
  const b = 맞장구({ roll: Math.random });
  for (let i = 0; i < 30; i += 1) {
    b.answered();
    b.heard(i * 10_000);
    const 소리 = b.heard(i * 10_000 + 500);
    assert.notEqual(소리, null);
    assert.ok(소리.length <= 5, `「${소리}」 는 너무 길다`);
  }
});

test('뭉치를 세는 것은 답이 나갈 때까지 이어진다', () => {
  const b = 맞장구();
  b.heard(0);
  b.heard(900);
  b.heard(1800);
  b.heard(2700);
  assert.equal(b.used, true, '답이 없었으니 아직 같은 뭉치다');
});

test('한 뭉치에 소리는 하나다 — 뜸과 맞장구가 겹치면 혼잣말하는 사람이 된다', () => {
  const b = 맞장구();
  b.heard(0);
  assert.equal(b.mayFiller(), true, '아직 아무 소리도 안 냈으면 뜸은 나간다');
  assert.equal(b.heard(900), null, '뜸이 나갔으면 맞장구는 안 친다');
  assert.equal(b.mayFiller(), false, '뜸도 두 번은 안 나간다');
});

test('맞장구가 먼저 나갔으면 뜸이 삼켜진다', () => {
  const b = 맞장구();
  b.heard(0);
  assert.notEqual(b.heard(900), null);
  assert.equal(b.mayFiller(), false);
});

test('답이 나가면 다시 소리를 낼 수 있다', () => {
  const b = 맞장구();
  b.heard(0);
  b.mayFiller();
  b.answered();
  assert.equal(b.mayFiller(), true);
});
