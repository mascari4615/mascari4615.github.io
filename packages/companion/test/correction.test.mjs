import assert from 'node:assert/strict';
import test from 'node:test';

import { applyCorrection, correctionNote, deniesSomething, findCorrection } from '../dist/index.js';

const 얘가한말 = (text) => ({ role: 'said', channel: 'web', text, at: 1, via: 'brain' });

// ── 부정 알아듣기 ───────────────────────────────────────────────────

test('틀렸다는 말을 알아듣는다', () => {
  for (const 말 of ['아니야 그거', '그거 틀렸어', '내가 언제 그랬어', '그런 적 없는데', '아니']) {
    assert.equal(deniesSomething(말), true, `${말}`);
  }
});

test('그냥 하는 말은 부정이 아니다', () => {
  for (const 말 of ['오늘 회의 길었어', '아니면 다음에 하자', '그래 맞아']) {
    assert.equal(deniesSomething(말), false, `${말}`);
  }
});

// ── 고칠 거리 ───────────────────────────────────────────────────────

test('얘가 방금 한 말을 고칠 대상으로 잡는다', () => {
  const 고침 = findCorrection('아니야 그거 틀렸어', 얘가한말('조수님은 커피를 싫어하지'));
  assert.equal(고침.denied, '조수님은 커피를 싫어하지');
});

test('지울 낱말은 얘가 한 말에서 고른다 — 조수님 말에서 뽑으면 「아니」를 지우려 든다', () => {
  const 고침 = findCorrection('아니야', 얘가한말('조수님은 커피를 싫어하지'));
  assert.equal(고침.keys.includes('아니'), false);
  assert.ok(고침.keys.includes('커피'), `${고침.keys}`);
});

test('부정할 대상이 없으면 고칠 것도 없다', () => {
  assert.equal(findCorrection('아니야', undefined), null);
});

test('부정이 아니면 null', () => {
  assert.equal(findCorrection('오늘 회의 길었어', 얘가한말('그랬구나')), null);
});

test('사람이 한 말은 고칠 대상이 아니다 — 얘가 한 말을 고치는 것이다', () => {
  assert.equal(findCorrection('아니야', { role: 'sensed', channel: 'web', text: '뭐라고?', at: 1 }), null);
});

test('대신 알려 준 게 있으면 들고 간다', () => {
  const 고침 = findCorrection('아니야, 나는 커피 좋아해', 얘가한말('커피를 싫어하지'));
  assert.match(고침.instead, /커피 좋아해/);
});

test('「아니야」만 하면 대신 알려 준 건 없다', () => {
  assert.equal(findCorrection('아니야', 얘가한말('커피를 싫어하지')).instead, null);
});

test('서술어는 지울 낱말로 안 고른다 — 「싫어하지」를 지우려 들면 안 된다', () => {
  const 고침 = findCorrection('아니야', 얘가한말('조수님은 커피를 싫어하지'));
  assert.equal(고침.keys.includes('싫어하지'), false);
});

// ── 실제로 지우기 ───────────────────────────────────────────────────

test('아는 것에서 지운다', () => {
  const 지워진것 = [];
  const 고침 = findCorrection('아니야', 얘가한말('조수님은 커피를 싫어하지'));
  const 결과 = applyCorrection(고침, (k) => { 지워진것.push(k); return true; });
  assert.deepEqual(결과, 지워진것);
  assert.ok(결과.includes('커피'));
});

test('지울 게 없으면 아무것도 안 한다 — 「아니야」 한마디에 통째로 비우지 않는다', () => {
  const 고침 = findCorrection('아니야', 얘가한말('조수님은 커피를 싫어하지'));
  assert.deepEqual(applyCorrection(고침, () => false), []);
});

test('한 번에 너무 많이 지우지 않는다', () => {
  const 고침 = findCorrection('아니야', 얘가한말('커피 회의 유니티 셰이더 고양이'));
  assert.ok(applyCorrection(고침, () => true, 2).length <= 2);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('우기지 말라고 한다 — 변명이 가장 나쁘다', () => {
  const note = correctionNote(findCorrection('아니야', 얘가한말('커피를 싫어하지')));
  assert.match(note, /우기거나 변명하지 마라/);
});

test('굽신거리지도 말라고 한다 — 곁에 있는 사이에 그건 결이 아니다', () => {
  assert.match(correctionNote(findCorrection('아니야', 얘가한말('커피를 싫어하지'))), /굽신거리지도 마라/);
});

test('무엇이 틀렸는지 실제로 보여 준다', () => {
  assert.match(correctionNote(findCorrection('아니야', 얘가한말('커피를 싫어하지'))), /커피를 싫어하지/);
});

test('지운 게 있으면 그것도 알려 준다', () => {
  const note = correctionNote(findCorrection('아니야', 얘가한말('커피를 싫어하지')), ['커피']);
  assert.match(note, /지웠다/);
  assert.match(note, /커피/);
});

test('대신 알려 준 게 있으면 그걸 얹는다', () => {
  const note = correctionNote(findCorrection('아니야, 나는 커피 좋아해', 얘가한말('커피를 싫어하지')));
  assert.match(note, /조수님 말로는/);
});

test('얘가 짧게 답하면 조수님 정정문에서 낱말을 뽑는다 — 안 그러면 지울 게 하나도 없다', () => {
  const 고침 = findCorrection('아니야, 나 커피 진짜 좋아해', 얘가한말('싫어하잖아…'));
  assert.ok(고침.keys.includes('커피'), `${고침.keys}`);
});

test('부정하는 말 자체는 지울 거리가 아니다', () => {
  const 고침 = findCorrection('아니야 진짜 아니라니까', 얘가한말('그랬잖아'));
  assert.equal(고침.keys.includes('아니'), false);
  assert.equal(고침.keys.includes('진짜'), false);
});
