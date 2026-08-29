// **더 큰 것이 이미 말한 것은 두 번 안 적는다** (TASK-KAR-248).
//
// A11y-Compressor(ACL 2026)는 접근성 나무를 압축해 토큰을 **원래의 22%** 로 줄이면서
// OSWorld 성공률을 **+5.1%p** 올렸다. 그 세 단계 중 하나가 중복 지우기다.
//
// 그래서 **먼저 쟀다**(141회차, 화면 안에 있는 것만):
//
//   아주 똑같은 줄(갈래+자리+이름)   msedge 0%, Discord 3%
//   같은 자리 + 같은 이름            msedge 0%, Discord 4%
//
// **그 가설은 기각됐다**. 우리 자료에 판박이 중복은 거의 없다. 22% 는 남의 숫자다.
//
// 다시 쟀더니 다른 것이 나왔다. **감싸인 잉여**. 더 큰 것이 같은 이름을 이미 말하고 있는
// 작은 것(버튼 안의 글자 같은 것):
//
//   msedge   화면 안 184, 지울 수 있는 것   7 ( 4%), 글자수 → 98%
//   Discord  화면 안 599, 지울 수 있는 것 123 (21%), 글자수 → 84%
//
// **만질 수 있는 것은 안 지운다.** 감싸여 있어도 누를 수 있으면 그건 새 정보다.
// 실측에서 만질 수 있는 것 292개는 지우기 전후로 **그대로 292개**였다.
//
// 번호도 안 바꾼다. 번호는 창을 걷는 순서가 매기고 누르는 쪽이 같은 순서로 다시 걷는다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { dropSwallowed } from '../dist/index.js';

const big = { i: 1, k: 'Button', n: '저장', r: [0, 0, 100, 40], p: ['Invoke'] };
const label = { i: 2, k: 'Text', n: '저장', r: [10, 10, 40, 20], p: [] };
const other = { i: 3, k: 'Text', n: '딴 말', r: [10, 10, 40, 20], p: [] };

test('더 큰 것이 같은 이름을 이미 말하면 안쪽 글자는 뺀다', () => {
  const left = dropSwallowed([big, label]);
  assert.deepEqual(left.map((one) => one.i), [1]);
});

test('이름이 다르면 안 뺀다. 새 정보다', () => {
  const left = dropSwallowed([big, other]);
  assert.equal(left.length, 2);
});

test('만질 수 있으면 감싸여 있어도 안 뺀다. 실측에서 292개가 그대로였다', () => {
  const innerButton = { i: 2, k: 'Button', n: '저장', r: [10, 10, 40, 20], p: ['Invoke'] };
  const left = dropSwallowed([big, innerButton]);
  assert.equal(left.length, 2);
});

test('감싸이지 않았으면 이름이 같아도 안 뺀다. 다른 자리의 같은 이름은 딴 것이다', () => {
  const far = { i: 2, k: 'Text', n: '저장', r: [500, 500, 40, 20], p: [] };
  const left = dropSwallowed([big, far]);
  assert.equal(left.length, 2);
});

test('더 큰 것의 이름이 안쪽 이름을 품기만 해도 뺀다. 저장은 저장 (Ctrl+S) 안에 있다', () => {
  const wide = { i: 1, k: 'Button', n: '저장 (Ctrl+S)', r: [0, 0, 100, 40], p: ['Invoke'] };
  const left = dropSwallowed([wide, label]);
  assert.deepEqual(left.map((one) => one.i), [1]);
});

test('번호를 다시 매기지 않는다', () => {
  const left = dropSwallowed([big, label, other]);
  assert.deepEqual(left.map((one) => one.i), [1, 3]);
});

test('자리를 못 잰 것(0,0,0,0)은 안 건드린다', () => {
  const folded = { i: 2, k: 'Text', n: '저장', r: [0, 0, 0, 0], p: [] };
  const left = dropSwallowed([big, folded]);
  assert.equal(left.length, 2);
});
