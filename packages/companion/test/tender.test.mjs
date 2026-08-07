import assert from 'node:assert/strict';
import test from 'node:test';

import { pickIngredients, readTender, tenderNote } from '../dist/index.js';

const 사람 = (text, at = 1, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 얘 = (text, at = 2) => ({ role: 'said', channel: 'web', text, at });

// ── 힘든 기색 읽기 ──────────────────────────────────────────────────

test('힘들다는 말을 알아본다', () => {
  for (const t of ['오늘 진짜 힘들었어', '너무 지쳤다', '좀 우울해', '막막하네', '불안해서']) {
    assert.equal(readTender([사람(t)]).soft, true, `${t}`);
  }
});

test('평범한 말은 조심할 자리가 아니다', () => {
  for (const t of ['오늘 회의 있었어', '셰이더 고쳤어', '뭐 하고 있어']) {
    assert.equal(readTender([사람(t)]).soft, false, `${t}`);
  }
});

test('얘가 한 말은 안 본다 — 제 말에 스스로 반응하면 안 된다', () => {
  assert.equal(readTender([얘('힘들었겠네…')]).soft, false);
});

test('화면 곁눈질도 안 본다', () => {
  assert.equal(readTender([사람('화면을 봤다. 창은 「힘들다.txt」', 1, 'screen')]).soft, false);
});

test('오래된 말은 안 본다 — 지난주에 힘들었다고 오늘까지 조심하지 않는다', () => {
  const es = [사람('힘들었어', 1), 사람('오늘 회의', 2), 사람('셰이더', 3), 사람('밥 먹었어', 4), 사람('그렇구나', 5)];
  assert.equal(readTender(es, 3).soft, false);
});

test('무거운 말은 따로 가린다 — 그냥 힘든 것과 다르다', () => {
  const t = readTender([사람('요즘 다 끝내고 싶다')]);
  assert.equal(t.soft, true);
  assert.equal(t.heavy, true);
});

test('그냥 힘든 건 무겁지 않다', () => {
  assert.equal(readTender([사람('오늘 진짜 힘들었어')]).heavy, false);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('평소엔 아무 말도 안 얹는다', () => {
  assert.equal(tenderNote(readTender([사람('오늘 회의 있었어')])), '');
});

test('조심할 자리에서는 농담·딴 얘기를 하지 말라고 한다', () => {
  const note = tenderNote(readTender([사람('오늘 진짜 힘들었어')]));
  assert.match(note, /농담·놀리기·딴 얘기는 지금 하지 마라/);
});

test('고치려 들지 말라고 한다 — 조언은 곁에 있는 것과 다른 일이다', () => {
  const note = tenderNote(readTender([사람('오늘 진짜 힘들었어')]));
  assert.match(note, /고치려 들지도 마라/);
  assert.match(note, /곁에 있어라/);
});

test('무거운 자리에서는 한 줄 더 붙인다 — 가벼운 말로 넘기지 말라고', () => {
  const note = tenderNote(readTender([사람('요즘 다 끝내고 싶다')]));
  assert.match(note, /가벼운 말로 넘기지 마라/);
  assert.match(note, /사람한테 말해 보라고/);
});

test('무거워도 고치려 들라고는 하지 않는다 — 얘가 할 수 있는 건 곁에 있는 것이다', () => {
  const note = tenderNote(readTender([사람('요즘 다 끝내고 싶다')]));
  assert.match(note, /고치려 들지도 마라/);
});

// ── 재료를 실제로 끄나 ──────────────────────────────────────────────

const 재료 = (name, text, weight, when) => ({ name, text, weight, ...(when === undefined ? {} : { when }) });

test('조심할 자리에서는 가벼운 재료가 빠진다', () => {
  const 조심 = readTender([사람('오늘 진짜 힘들었어')]);
  const 고른것 = pickIngredients([
    재료('조심', tenderNote(조심), 14),
    재료('놀리기', '놀릴 거리', 5, 조심.soft === false),
    재료('이정표', '오늘 백일', 8, 조심.soft === false),
    재료('기분', '지금 상태', 9),
  ]);
  const 이름들 = 고른것.map((x) => x.name);
  assert.equal(이름들.includes('놀리기'), false);
  assert.equal(이름들.includes('이정표'), false);
  assert.equal(이름들.includes('조심'), true);
});

test('평소에는 가벼운 재료가 그대로 있다', () => {
  const 조심 = readTender([사람('오늘 회의 있었어')]);
  const 고른것 = pickIngredients([
    재료('조심', tenderNote(조심), 14),
    재료('놀리기', '놀릴 거리', 5, 조심.soft === false),
    재료('기분', '지금 상태', 9),
  ]);
  assert.equal(고른것.map((x) => x.name).includes('놀리기'), true);
});

test('조심하라는 줄은 가장 무거워 예산에 안 밀린다 — 밀리면 아무 소용이 없다', () => {
  const 조심 = readTender([사람('오늘 진짜 힘들었어')]);
  const 고른것 = pickIngredients(
    [
      재료('긴것1', '가'.repeat(200), 9),
      재료('긴것2', '나'.repeat(200), 8),
      재료('조심', tenderNote(조심), 14),
    ],
    { maxChars: 300, maxLines: 5 },
  );
  assert.equal(고른것[0].name, '조심');
});
