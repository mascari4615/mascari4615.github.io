import assert from 'node:assert/strict';
import test from 'node:test';

import { 되새김, 되새김노트, 되새김묻기 } from '../dist/index.js';

const 말 = (text, role = 'sensed', at = Date.now()) => ({ role, channel: 'web', kind: 'text', text, at });
const 오간말 = [
  말('셰이더 또 안 되네 진짜'),
  말('많이 붙잡고 있었구나', 'said'),
  말('어제도 새벽까지 했는데'),
  말('밤에만 그 얘기를 하네', 'said'),
];

const 짚은것 = (무엇, 근거 = ['셰이더 또 안 되네 진짜']) => ({ 무엇, 근거, at: Date.now() });

test('짚은 것을 근거와 함께 담는다', async () => {
  const r = new 되새김({ 물어보기: async () => [짚은것('조수님은 막힌 얘기를 밤에만 꺼낸다')] });
  assert.equal(await r.되새기기(오간말), 1);
  assert.equal(r.all[0].무엇, '조수님은 막힌 얘기를 밤에만 꺼낸다');
  assert.equal(r.all[0].근거.length, 1);
});

test('근거를 못 대면 버린다 — 되새김은 헛것이 가장 잘 나오는 자리다', async () => {
  const 적힌것 = [];
  const r = new 되새김({ 물어보기: async () => [{ 무엇: '조수님은 사실 고양이를 싫어한다', 근거: [] }], log: (m) => 적힌것.push(m) });
  assert.equal(await r.되새기기(오간말), 0);
  assert.equal(r.all.length, 0);
  assert.match(적힌것.join(' '), /근거가 없어 버렸다/);
});

test('같은 걸 또 짚지 않는다 — 글자가 달라도 같은 얘기면 안 담는다', async () => {
  const r = new 되새김({ 물어보기: async () => [짚은것('조수님은 셰이더에 자꾸 막힌다')] });
  await r.되새기기(오간말);
  const r2 = new 되새김({ 물어보기: async () => [짚은것('조수님은 셰이더에 계속 막힌다')] });
  r2.all.push(...r.all);
  assert.equal(await r2.되새기기(오간말), 0, '거의 같은 말을 두 번 담으면 재료 자리를 다 먹는다');
});

test('아무것도 안 짚어도 조용히 넘어간다 — 억지로 만들지 않는다', async () => {
  const r = new 되새김({ 물어보기: async () => [] });
  assert.equal(await r.되새기기(오간말), 0);
});

test('두뇌가 죽어도 대화는 안 멈춘다 — 그리고 조용히 삼키지 않는다', async () => {
  const 적힌것 = [];
  const r = new 되새김({ 물어보기: async () => { throw new Error('두뇌 없음'); }, log: (m) => 적힌것.push(m) });
  assert.equal(await r.되새기기(오간말), 0);
  assert.match(적힌것.join(' '), /실패/);
});

test('물어보기가 없으면 아무 일도 안 한다 — 아무 데도 안 걸리고 그냥 돈다', async () => {
  const r = new 되새김();
  assert.equal(await r.되새기기(오간말), 0);
  assert.equal(r.셀때인가, false);
});

// ── 언제 되새기나 ────────────────────────────────────────────────

test('말이 얼마쯤 쌓여야 되새긴다 — 매 turn 되새기면 그게 값이다', () => {
  const r = new 되새김({ 마다: 3, 물어보기: async () => [] });
  assert.equal(r.셈([말('하나')]), false);
  assert.equal(r.셈([말('하나'), 말('둘'), 말('셋')]), true);
});

test('되새기고 나면 다시 쌓일 때까지 안 한다', async () => {
  const r = new 되새김({ 마다: 3, 물어보기: async () => [] });
  r.셈([말('하나'), 말('둘'), 말('셋')]);
  await r.되새기기(오간말);
  assert.equal(r.셀때인가, false);
});

// ── 두뇌에 얹을 한 줄 ─────────────────────────────────────────────

test('지금 얘기와 이어질 때만 얹는다 — 늘 붙이면 사람을 계속 분석하는 꼴이다', async () => {
  const r = new 되새김({ 물어보기: async () => [짚은것('조수님은 셰이더 얘기를 밤에만 꺼낸다')] });
  await r.되새기기(오간말);
  assert.equal(되새김노트(r, '오늘 점심 뭐 먹지'), '');
  assert.match(되새김노트(r, '셰이더 그거 밤에 다시 볼까'), /밤에만/);
});

test('짚은 게 없으면 빈 말', () => {
  assert.equal(되새김노트(new 되새김(), '셰이더 얘기'), '');
});

// ── 두뇌에게 넘어가는 물음 ────────────────────────────────────────

test('물음에 오간 말이 들어가고, 이미 짚은 것은 다시 짚지 말라고 한다', async () => {
  let 본것 = '';
  const 묻기 = 되새김묻기(async (p) => { 본것 = p; return '조수님은 밤에만 막힌 얘기를 한다 || 어제도 새벽까지 했는데'; });
  const 나온것 = await 묻기(오간말, ['이미 짚어 둔 무언가']);
  assert.ok(본것.includes('셰이더 또 안 되네'), '오간 말이 물음에 없다');
  assert.ok(본것.includes('이미 짚어 둔 무언가'), '이미 짚은 것이 물음에 없다');
  assert.equal(나온것[0].무엇, '조수님은 밤에만 막힌 얘기를 한다');
  assert.deepEqual(나온것[0].근거, ['어제도 새벽까지 했는데']);
});

test('근거 없이 온 줄은 아예 안 만든다', async () => {
  const 묻기 = 되새김묻기(async () => '조수님은 고양이를 싫어한다');
  assert.deepEqual(await 묻기(오간말, []), []);
});

test('근거 여러 개를 갈라 읽는다', async () => {
  const 묻기 = 되새김묻기(async () => '- 조수님은 밤에 막힌다 || 어제도 새벽까지 ; 셰이더 또 안 되네');
  const r = await 묻기(오간말, []);
  assert.equal(r[0].근거.length, 2);
  assert.equal(r[0].무엇, '조수님은 밤에 막힌다', '앞의 목록 표시는 떼어야 한다');
});

test('오간 말이 없으면 두뇌를 부르지도 않는다', async () => {
  let 불렀나 = false;
  const 묻기 = 되새김묻기(async () => { 불렀나 = true; return ''; });
  assert.equal(await 묻기([], []), null);
  assert.equal(불렀나, false);
});
