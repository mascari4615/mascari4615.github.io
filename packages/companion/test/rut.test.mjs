import assert from 'node:assert/strict';
import test from 'node:test';

import { brainSaid, findEcho, findRut, opener, rutWarning } from '../dist/index.js';

const 두뇌 = (text, at = 1) => ({ role: 'said', channel: 'web', text, at, via: 'brain' });
const 반사 = (text, at = 1) => ({ role: 'said', channel: 'web', text, at, via: 'reflex' });
const 옛것 = (text, at = 1) => ({ role: 'said', channel: 'web', text, at });
const 사람 = (text, at = 1) => ({ role: 'sensed', channel: 'web', text, at });

// ── 재료 고르기 ─────────────────────────────────────────────────────

test('두뇌가 지은 말만 센다 — 고정 대꾸는 말버릇이 아니다', () => {
  const es = [두뇌('그러게'), 반사('…또 찌르네.'), 사람('안녕'), 두뇌('음…')];
  assert.deepEqual(brainSaid(es).map((e) => e.text), ['그러게', '음…']);
});

test('어디서 왔는지 모르는 옛 기록은 안 센다 — 함부로 두뇌 것으로 치지 않는다', () => {
  assert.deepEqual(brainSaid([옛것('옛날 말')]), []);
});

// ── 첫머리 ──────────────────────────────────────────────────────────

test('말의 첫머리를 뽑는다 — 낱말 하나가 기본이다', () => {
  assert.equal(opener('또 그거네…'), '또');
  assert.equal(opener('…또 그거야 진짜'), '또');
  assert.equal(opener('또 그거네…', 2), '또 그거네');
});

test('앞에 붙은 말줄임과 뒤에 붙은 문장부호는 뗀다 — 그게 다르면 다른 말버릇으로 보인다', () => {
  assert.equal(opener('…응, 그래'), opener('응, 그래'));
});

// ── 굳은 말버릇 ─────────────────────────────────────────────────────

test('두 번은 우연이다 — 사람도 그 정도는 한다', () => {
  const es = [두뇌('또 그거네'), 두뇌('음 그래'), 두뇌('또 그거네')];
  assert.equal(findRut(es), null);
});

test('세 번부터 굳은 것으로 본다', () => {
  const es = [두뇌('또 그거네'), 두뇌('음 그래'), 두뇌('또 그거야'), 두뇌('또 그러네')];
  const rut = findRut(es);
  assert.notEqual(rut, null);
  assert.equal(rut.times, 3);
});

test('몇 번부터 굳은 것으로 볼지 정할 수 있다', () => {
  const es = [두뇌('또 하나'), 두뇌('또 둘')];
  assert.notEqual(findRut(es, { atLeast: 2 }), null);
  assert.equal(findRut(es, { atLeast: 3 }), null);
});

test('오래된 말은 안 본다 — 지난주 말버릇은 지금 말버릇이 아니다', () => {
  const es = [두뇌('또 하나'), 두뇌('또 둘'), 두뇌('또 셋')];
  const 서로다른 = ['음 그래', '글쎄 뭐', '그러게 말이야', '아니 근데', '어제 그거', '오늘 좀', '나중에 보자', '괜찮아 그럼'];
  for (const t of 서로다른) es.push(두뇌(t));
  assert.equal(findRut(es, { window: 8 }), null);
});

test('고정 대꾸가 아무리 겹쳐도 말버릇으로 안 친다 — 그게 진짜 말버릇을 가렸다', () => {
  const es = [반사('…또 찌르네.'), 반사('…또 찌르네.'), 반사('…또 찌르네.'), 반사('…또 찌르네.')];
  assert.equal(findRut(es), null);
});

test('말이 몇 마디 없으면 판단하지 않는다', () => {
  assert.equal(findRut([두뇌('하나'), 두뇌('둘')]), null);
});

// ── 통째 되풀이 ─────────────────────────────────────────────────────

test('같은 문장을 통째로 또 하면 잡는다 — 첫머리가 겹치는 것보다 나쁘다', () => {
  assert.equal(findEcho([두뇌('그러게 말이야'), 두뇌('음'), 두뇌('그러게 말이야')]), '그러게 말이야');
});

test('다 다르면 통째 되풀이는 없다', () => {
  assert.equal(findEcho([두뇌('하나'), 두뇌('둘'), 두뇌('셋')]), null);
});

test('고정 대꾸는 통째로 겹쳐도 안 잡는다 — 원래 정해진 문구다', () => {
  assert.equal(findEcho([반사('…어?'), 반사('…어?')]), null);
});

// ── 잔소리 ──────────────────────────────────────────────────────────

test('평소엔 조용하다 — 늘 짚으면 잔소리 자체가 또 하나의 반복이다', () => {
  assert.equal(rutWarning([두뇌('하나'), 두뇌('둘'), 두뇌('셋')]), '');
});

test('굳었을 때만 짚는다', () => {
  const note = rutWarning([두뇌('또 하나'), 두뇌('또 둘'), 두뇌('또 셋')]);
  assert.match(note, /또/);
  assert.match(note, /굳었다/);
});

test('통째 되풀이가 첫머리보다 먼저다 — 더 나쁜 신호를 먼저 짚는다', () => {
  const es = [두뇌('또 그거네'), 두뇌('또 그거네'), 두뇌('또 저거네')];
  assert.match(rutWarning(es), /똑같이 했다/);
});

test('말이 없으면 아무 말도 안 얹는다', () => {
  assert.equal(rutWarning([]), '');
  assert.equal(rutWarning([사람('안녕')]), '');
});

test('짚을 땐 무엇이 굳었는지 실제로 보여 준다 — 막연한 잔소리는 안 먹는다', () => {
  const note = rutWarning([두뇌('그래서 말인데'), 두뇌('그래서 어떻게'), 두뇌('그래서 뭐')]);
  assert.match(note, /「그래서/);
  assert.match(note, /3번/);
});
