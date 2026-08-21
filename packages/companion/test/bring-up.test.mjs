import assert from 'node:assert/strict';
import test from 'node:test';

import { topicFirst, topicSkipReason, notRaised, pendingThoughts } from '../dist/index.js';

const material = [
  { name: '단골얘기', text: '조수님과 자꾸 나오는 얘기: 「셰이더」(2일에 걸쳐 15번)', weight: 3 },
  { name: '궁금', text: '', weight: 5 },
  { name: '기분', text: '지금 기운이 처져 있다', weight: 12 },
];
const heldMark = { 단골얘기: 5, mood: 1 };
const base = { material: material, 얼마나참았나: (n) => heldMark[n] ?? 0, cooling: true, askedTurn: false };

test('오래 참은 것을 먼저 꺼낸다 — 참기만 하다 끝나면 그건 생각이 아니다', () => {
  const r = topicFirst(base);
  assert.equal(r?.이름, '단골얘기');
  assert.match(r.말, /네가 먼저 꺼내라/);
  assert.match(r.말, /셰이더/, '꺼낼 내용이 같이 넘어가야 한다');
});

test('한창일 때는 안 꺼낸다 — 끼어드는 건 방해다', () => {
  assert.equal(topicFirst({ ...base, cooling: false }), null);
  assert.match(topicSkipReason({ ...base, cooling: false }), /안 식었다/);
});

test('물어본 turn 에는 안 꺼낸다 — 물음을 두고 딴 얘기는 회피다', () => {
  assert.equal(topicFirst({ ...base, askedTurn: true }), null);
  assert.match(topicSkipReason({ ...base, askedTurn: true }), /물어본 turn/);
});

test('한두 번 밀린 건 안 꺼낸다 — 그냥 아무 말이나 하는 게 된다', () => {
  const few = { ...base, 얼마나참았나: () => 1 };
  assert.equal(topicFirst(few), null);
  assert.match(topicSkipReason(few), /넘게 참은 게 없다 \(가장 오래 참은 게 1번\)/);
});

test('할 말이 없는 재료는 안 꺼낸다 — 빈 걸 꺼내라고 하면 지어낸다', () => {
  const emptyOnly = { ...base, material: [{ name: '궁금', text: '   ', weight: 5 }], 얼마나참았나: () => 9 };
  assert.equal(topicFirst(emptyOnly), null);
});

test('꺼진 재료도 안 꺼낸다 — 지금 자리에 없는 얘기다', () => {
  const off = { ...base, material: [{ name: '놀리기', text: '놀려라', weight: 5, when: false }], 얼마나참았나: () => 9 };
  assert.equal(topicFirst(off), null);
});

test('꺼낼 자리면 왜 안 꺼내는지가 없다', () => {
  assert.equal(topicSkipReason(base), null);
});

// ── 밀린 생각과 이어 붙는다 ────────────────────────────────────────

test('실제로 밀린 것을 세어 꺼낸다 — 표를 따로 들지 않는다', () => {
  const pressed = new pendingThoughts();
  for (let i = 0; i < 4; i += 1) { pressed.적기('단골얘기', '밀림'); pressed.다음턴(); }
  pressed.적기('기분', '실림');
  const r = topicFirst({ ...base, 얼마나참았나: (n) => pressed.얼마나참았나(n) });
  assert.equal(r?.이름, '단골얘기');
  assert.equal(r.heldCount, 4);
});

test('말하고 나면 풀려서 또 안 꺼낸다', () => {
  const pressed2 = new pendingThoughts();
  for (let i = 0; i < 4; i += 1) { pressed2.적기('단골얘기', '밀림'); pressed2.다음턴(); }
  pressed2.적기('단골얘기', '실림');
  assert.equal(topicFirst({ ...base, 얼마나참았나: (n) => pressed2.얼마나참았나(n) }), null);
});

// ── 시킨 게 먹었나 ────────────────────────────────────────────────

test('먼저 꺼내라고 했는데 그 얘기가 안 나오면 잡는다 — 시켜 놓고 안 세면 재료만 얹고 끝난다', () => {
  assert.match(notRaised('오늘 날씨 좋네', true, ['셰이더 얘기가 자꾸 나온다']), /안 나왔다/);
  assert.equal(notRaised('셰이더 그거 아직 붙잡고 있어?', true, ['셰이더 얘기가 자꾸 나온다']), null);
});

test('꺼낼 자리가 아니면 아무것도 안 잡는다', () => {
  assert.equal(notRaised('오늘 날씨 좋네', false, ['셰이더']), null);
});

test('아무 말도 안 했으면 그것도 잡는다', () => {
  assert.match(notRaised('   ', true, ['셰이더']), /아무 말도 안 했다/);
});
