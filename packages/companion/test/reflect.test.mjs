import assert from 'node:assert/strict';
import test from 'node:test';

import { reflection, reflectionNote, askReflection } from '../dist/index.js';

const text2 = (text, role = 'sensed', at = Date.now()) => ({ role, channel: 'web', kind: 'text', text, at });
const exchange = [
  text2('셰이더 또 안 되네 진짜'),
  text2('많이 붙잡고 있었구나', 'said'),
  text2('어제도 새벽까지 했는데'),
  text2('밤에만 그 얘기를 하네', 'said'),
];

const pointed = (what, evidence = ['셰이더 또 안 되네 진짜']) => ({ what: what, evidence: evidence, at: Date.now() });

test('짚은 것을 근거와 함께 담는다', async () => {
  const r = new reflection({ ask: async () => [pointed('조수님은 막힌 얘기를 밤에만 꺼낸다')] });
  assert.equal(await r.reflect(exchange), 1);
  assert.equal(r.all[0].what, '조수님은 막힌 얘기를 밤에만 꺼낸다');
  assert.equal(r.all[0].evidence.length, 1);
});

test('근거를 못 대면 버린다. 되새김은 헛것이 가장 잘 나오는 자리다', async () => {
  const written = [];
  const r = new reflection({ ask: async () => [{ what: '조수님은 사실 고양이를 싫어한다', evidence: [] }], log: (m) => written.push(m) });
  assert.equal(await r.reflect(exchange), 0);
  assert.equal(r.all.length, 0);
  assert.match(written.join(' '), /근거가 없어 버렸다/);
});

test('같은 걸 또 짚지 않는다. 글자가 달라도 같은 얘기면 안 담는다', async () => {
  const r = new reflection({ ask: async () => [pointed('조수님은 셰이더에 자꾸 막힌다')] });
  await r.reflect(exchange);
  const r2 = new reflection({ ask: async () => [pointed('조수님은 셰이더에 계속 막힌다')] });
  r2.all.push(...r.all);
  assert.equal(await r2.reflect(exchange), 0, '거의 같은 말을 두 번 담으면 재료 자리를 다 먹는다');
});

test('아무것도 안 짚어도 조용히 넘어간다. 억지로 만들지 않는다', async () => {
  const r = new reflection({ ask: async () => [] });
  assert.equal(await r.reflect(exchange), 0);
});

test('두뇌가 죽어도 대화는 안 멈춘다. 그리고 조용히 삼키지 않는다', async () => {
  const written2 = [];
  const r = new reflection({ ask: async () => { throw new Error('두뇌 없음'); }, log: (m) => written2.push(m) });
  assert.equal(await r.reflect(exchange), 0);
  assert.match(written2.join(' '), /실패/);
});

test('물어보기가 없으면 아무 일도 안 한다. 아무 데도 안 걸리고 그냥 돈다', async () => {
  const r = new reflection();
  assert.equal(await r.reflect(exchange), 0);
  assert.equal(r.isCountTime, false);
});

// ── 언제 되새기나 ────────────────────────────────────────────────

test('말이 얼마쯤 쌓여야 되새긴다. 매 turn 되새기면 그게 값이다', () => {
  const r = new reflection({ every: 3, ask: async () => [] });
  assert.equal(r.calc([text2('하나')]), false);
  assert.equal(r.calc([text2('하나'), text2('둘'), text2('셋')]), true);
});

test('되새기고 나면 다시 쌓일 때까지 안 한다', async () => {
  const r = new reflection({ every: 3, ask: async () => [] });
  r.calc([text2('하나'), text2('둘'), text2('셋')]);
  await r.reflect(exchange);
  assert.equal(r.isCountTime, false);
});

// ── 두뇌에 얹을 한 줄 ─────────────────────────────────────────────

test('지금 얘기와 이어질 때만 얹는다. 늘 붙이면 사람을 계속 분석하는 꼴이다', async () => {
  const r = new reflection({ ask: async () => [pointed('조수님은 셰이더 얘기를 밤에만 꺼낸다')] });
  await r.reflect(exchange);
  assert.equal(reflectionNote(r, '오늘 점심 뭐 먹지'), '');
  assert.match(reflectionNote(r, '셰이더 그거 밤에 다시 볼까'), /밤에만/);
});

test('짚은 게 없으면 빈 말', () => {
  assert.equal(reflectionNote(new reflection(), '셰이더 얘기'), '');
});

// ── 두뇌에게 넘어가는 물음 ────────────────────────────────────────

test('물음에 오간 말이 들어가고, 이미 짚은 것은 다시 짚지 말라고 한다', async () => {
  let seen = '';
  const ask = askReflection(async (p) => { seen = p; return '조수님은 밤에만 막힌 얘기를 한다 || 어제도 새벽까지 했는데'; });
  const produced = await ask(exchange, ['이미 짚어 둔 무언가']);
  assert.ok(seen.includes('셰이더 또 안 되네'), '오간 말이 물음에 없다');
  assert.ok(seen.includes('이미 짚어 둔 무언가'), '이미 짚은 것이 물음에 없다');
  assert.equal(produced[0].what, '조수님은 밤에만 막힌 얘기를 한다');
  assert.deepEqual(produced[0].evidence, ['어제도 새벽까지 했는데']);
});

test('근거 없이 온 줄은 아예 안 만든다', async () => {
  const ask2 = askReflection(async () => '조수님은 고양이를 싫어한다');
  assert.deepEqual(await ask2(exchange, []), []);
});

test('근거 여러 개를 갈라 읽는다', async () => {
  const ask3 = askReflection(async () => '- 조수님은 밤에 막힌다 || 어제도 새벽까지 ; 셰이더 또 안 되네');
  const r = await ask3(exchange, []);
  assert.equal(r[0].evidence.length, 2);
  assert.equal(r[0].what, '조수님은 밤에 막힌다', '앞의 목록 표시는 떼어야 한다');
});

test('오간 말이 없으면 두뇌를 부르지도 않는다', async () => {
  let called = false;
  const ask4 = askReflection(async () => { called = true; return ''; });
  assert.equal(await ask4([], []), null);
  assert.equal(called, false);
});
