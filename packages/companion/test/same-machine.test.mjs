import assert from 'node:assert/strict';
import test from 'node:test';

import { isThisMachine } from '../dist/index.js';

/* 곁에서 붙는 화면(KarmoLab 앱)을 들여보내려고 문을 열었다. 이 시험은 **정상 경로부터**
   찌른다. 막는 것만 시험하면 아무도 못 들어오는 문이 통과해 버린다. */

test('이 기계의 다른 창은 들어온다', () => {
  assert.equal(isThisMachine('http://127.0.0.1:8813'), true);
  assert.equal(isThisMachine('http://localhost:8824'), true);
  assert.equal(isThisMachine('http://127.0.0.1:4620'), true);
});

test('앱 창(Tauri)도 들어온다', () => {
  assert.equal(isThisMachine('tauri://localhost'), true);
  assert.equal(isThisMachine('https://tauri.localhost'), true);
});

test('밖은 못 들어온다', () => {
  assert.equal(isThisMachine('https://mascari4615.github.io'), false);
  assert.equal(isThisMachine('http://192.168.0.5:8813'), false);
});

test('이름만 흉내 낸 곳은 못 들어온다', () => {
  // 문자열로 localhost 가 들어 있나만 봤으면 전부 통과했을 것들이다.
  assert.equal(isThisMachine('http://localhost.evil.com'), false);
  assert.equal(isThisMachine('http://127.0.0.1.evil.com'), false);
  assert.equal(isThisMachine('http://evil.com/#localhost'), false);
});

test('주소가 아니거나 이상한 규약이면 못 들어온다', () => {
  assert.equal(isThisMachine('null'), false);
  assert.equal(isThisMachine(''), false);
  assert.equal(isThisMachine('file://'), false);
});
