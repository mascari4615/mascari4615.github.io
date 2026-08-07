import assert from 'node:assert/strict';
import test from 'node:test';

import { 읽을토막 } from '../assets/say-chunks.js';

test('문장이 끝나면 그 문장을 내보낸다', () => {
  const r = 읽을토막('안녕, 오늘 어땠어? 나는');
  assert.equal(r.토막, '안녕, 오늘 어땠어?');
});

test('아직 문장이 안 끝나도 쉼표에서 먼저 내보낸다 — 첫 소리를 앞당기는 게 목적이다', () => {
  const r = 읽을토막('어 그거 나도 봤는데, 진짜 웃기더라');
  assert.notEqual(r, null);
  assert.equal(r.토막, '어 그거 나도 봤는데,');
});

test('짧은 쉼표에서는 안 끊는다 — 뚝뚝 끊겨 들린다', () => {
  assert.equal(읽을토막('응, 그러니까 이제'), null);
});

test('짧은 문장 하나만 있으면 더 기다린다', () => {
  assert.equal(읽을토막('응.'), null);
});

test('쉼표 뒤에 남은 게 없으면 안 끊는다 — 어차피 곧 올 문장 끝과 다를 게 없다', () => {
  assert.equal(읽을토막('어 그거 나도 봤는데,', { 남길것: 2 }), null);
});

test('여러 문장이 한꺼번에 오면 마지막 끝까지 한 번에 먹는다', () => {
  const r = 읽을토막('그래. 나도 그랬어! 근데');
  assert.equal(r.토막, '그래. 나도 그랬어!');
});

test('먹은 길이만큼 정확히 나아간다 — 어긋나면 같은 말을 두 번 읽는다', () => {
  // **흘러나오는 상황을 흉내 낸다.** 다 온 글을 한 번에 넣으면 문장 끝이 먼저 잡혀서
  // 쉼표 끊기가 아예 안 일어난다 — 실제로는 쉼표까지만 와 있을 때 한 번 끊긴다.
  const 앞부분 = '어 그거 나도 봤는데, 진짜';
  const 첫 = 읽을토막(앞부분);
  assert.equal(첫.토막, '어 그거 나도 봤는데,');

  const 전체 = '어 그거 나도 봤는데, 진짜 웃기더라.';
  const 남은 = 전체.slice(첫.먹은길이);
  assert.equal(남은.trim(), '진짜 웃기더라.');
  assert.equal(읽을토막(남은).토막, '진짜 웃기더라.');
});

test('빈 글은 아무것도 안 내보낸다', () => {
  assert.equal(읽을토막(''), null);
  assert.equal(읽을토막('   '), null);
  assert.equal(읽을토막(null), null);
});

test('문턱을 조절할 수 있다 — 목소리가 느리면 더 잘게 끊는 게 낫다', () => {
  assert.notEqual(읽을토막('응, 그러니까', { 쉼문턱: 2 }), null);
});

test('말줄임표도 문장 끝으로 본다 — 얘가 자주 쓴다', () => {
  const r = 읽을토막('그게 말이야… 사실은');
  assert.equal(r.토막, '그게 말이야…');
});
