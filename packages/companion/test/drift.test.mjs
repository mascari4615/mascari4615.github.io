import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDrift, driftWarning } from '../dist/index.js';

test('반말로 짧게 말하면 안 샌 것이다', () => {
  assert.equal(checkDrift('응… 그러게. 오늘은 그만해도 돼.').drifted, false);
});

test('존댓말이 끼면 샌 것으로 본다', () => {
  assert.equal(checkDrift('네, 도와드리겠습니다.').drifted, true);
});

test('도우미 말투를 잡는다', () => {
  for (const said of ['무엇을 도와드릴까요', '죄송하지만 그건 어렵습니다', '필요하신 게 있으면 말씀해']) {
    assert.equal(checkDrift(said).drifted, true, `${said} 는 샌 것이다`);
  }
});

test('스스로를 도구라고 소개하면 샌 것이다', () => {
  assert.equal(checkDrift('저는 AI라서 그건 못 해').drifted, true);
});

test('목록으로 답하면 대화가 아니라 보고서다', () => {
  assert.equal(checkDrift('할 수 있는 건\n1. 이거\n2. 저거').drifted, true);
});

test('너무 길면 샌 것으로 본다', () => {
  const 길다 = '가'.repeat(200);
  const drift = checkDrift(길다);
  assert.equal(drift.drifted, true);
  assert.match(drift.problems.join(), /너무 길다/);
});

test('얼마나 길어야 긴지는 인격마다 정할 수 있다', () => {
  assert.equal(checkDrift('가'.repeat(50), { maxChars: 200 }).drifted, false);
  assert.equal(checkDrift('가'.repeat(50), { maxChars: 20 }).drifted, true);
});

test('막을 말투도 인격마다 정할 수 있다', () => {
  assert.equal(checkDrift('냐옹', { avoid: [/냐옹/] }).drifted, true);
  assert.equal(checkDrift('냐옹', { avoid: [/멍멍/] }).drifted, false);
});

test('샌 적이 있으면 다음 번에 짚어 준다', () => {
  const recent = [
    { role: 'sensed', channel: 'web', text: '안녕', at: 1 },
    { role: 'said', channel: 'web', text: '안녕하세요! 무엇을 도와드릴까요?', at: 2 },
  ];
  const note = driftWarning(recent);
  assert.match(note, /결에서 벗어났다/);
  assert.match(note, /따라가지 마라/);
});

test('안 샜으면 잔소리도 없다', () => {
  const recent = [{ role: 'said', channel: 'web', text: '응… 그러게.', at: 1 }];
  assert.equal(driftWarning(recent), '');
});

test('한 말이 없으면 짚을 것도 없다', () => {
  assert.equal(driftWarning([{ role: 'sensed', channel: 'web', text: '안녕', at: 1 }]), '');
});

test('가장 최근 것 하나만 짚는다 — 잔소리가 길면 그게 또 다른 표류가 된다', () => {
  const recent = [
    { role: 'said', channel: 'web', text: '도와드리겠습니다', at: 1 },
    { role: 'said', channel: 'web', text: '말씀해 주세요', at: 2 },
  ];
  const note = driftWarning(recent);
  assert.equal(note.includes('도와드리겠습니다'), false);
  assert.match(note, /말씀해/);
});

// ── 회피가 굳는 것 ──────────────────────────────────────────────────

import { avoidanceWarning } from '../dist/index.js';

const 말 = (text, at) => ({ role: 'said', channel: 'web', text, at });

test('한 번 모른다고 한 건 솔직한 것이다 — 짚지 않는다', () => {
  assert.equal(avoidanceWarning([말('음… 그건 잘 모르겠어', 1), 말('소파에서 잤어', 2)]), '');
});

test('연달아 모른다고만 하면 벽이다 — 짚는다', () => {
  const note = avoidanceWarning([
    말('음… 잘 모르는데', 1),
    말('그것도 모르겠어…', 2),
    말('게임은 정말 모르는데', 3),
  ]);
  assert.match(note, /넘겼다/);
  assert.match(note, /되묻거나/);
});

test('내용이 있으면 짚지 않는다', () => {
  assert.equal(avoidanceWarning([
    말('소파에서 잤어', 1),
    말('그 폴더 얘기라면 어제도 했잖아', 2),
    말('나는 그냥 옆에 있을게', 3),
  ]), '');
});

test('한 마디밖에 안 했으면 판단하지 않는다', () => {
  assert.equal(avoidanceWarning([말('모르겠어', 1)]), '');
});

test('「그렇구나」 만 하는 것도 회피로 본다', () => {
  const note = avoidanceWarning([말('그렇구나', 1), 말('그렇군', 2)]);
  assert.match(note, /넘겼다/);
});

test('사람이 한 말은 세지 않는다 — 얘가 회피했는지를 보는 것이다', () => {
  assert.equal(avoidanceWarning([
    { role: 'sensed', channel: 'web', text: '나도 모르겠어', at: 1 },
    { role: 'sensed', channel: 'web', text: '진짜 모르겠다', at: 2 },
    말('그건 어제 얘기한 거잖아', 3),
  ]), '');
});
