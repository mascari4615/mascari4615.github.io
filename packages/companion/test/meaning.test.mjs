import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { 뜻기억, 닮은정도 } from '../dist/index.js';

/* 진짜 모델은 시험에서 안 쓴다 — 뜨는 데 수십 초 걸리고, 남의 모델이 바뀌면 우리 시험이
   빨개지는 건 우리 고장이 아니다. 대신 **꺼내는 규칙**과 **준비 안 됐을 때**를 잠근다.
   가짜 뜻 = 낱말 몇 개를 축으로 삼은 벡터. */
const axis = ['매움', '음식', '날씨', '게임'];
const fakeMeasure = (table) => ({
  measure: async (content) => {
    const value = table[content];
    if (value === undefined) return null;
    const length2 = Math.hypot(...value) || 1;
    return value.map((v) => v / length2);
  },
});

const table2 = {
  '마라탕은 매워서 못 먹어': [1, 1, 0, 0],
  '매운 음식 싫어함': [1, 0.9, 0, 0],
  '오늘 날씨 좋다': [0, 0, 1, 0],
  '저번에 못 먹는다고 한 게 뭐였지': [0.9, 1, 0, 0],
};

const newFile = () => join(mkdtempSync(join(tmpdir(), 'meaning-')), '뜻-색인.json');

test('낱말이 하나도 안 겹쳐도 뜻으로 찾는다', async () => {
  const meaning = new 뜻기억({ measure: fakeMeasure(table2), 문턱: 0.5 });
  await meaning.담기([
    { role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 },
    { role: 'sensed', channel: 'web', text: '오늘 날씨 좋다', at: 2 },
  ]);
  const produced = await meaning.찾기('저번에 못 먹는다고 한 게 뭐였지');
  assert.equal(produced.length, 1, `나온 것: ${JSON.stringify(produced)}`);
  assert.equal(produced[0].text, '마라탕은 매워서 못 먹어');
});

test('안 닮은 건 안 꺼낸다 — 문턱 아래는 버린다', async () => {
  const meaning2 = new 뜻기억({ measure: fakeMeasure(table2), 문턱: 0.9 });
  await meaning2.담기([{ role: 'sensed', channel: 'web', text: '오늘 날씨 좋다', at: 1 }]);
  assert.deepEqual(await meaning2.찾기('매운 음식 싫어함'), []);
});

test('아직 준비가 안 됐으면 빈손으로 돌아온다 — 기다리게 하지 않는다', async () => {
  const meaning3 = new 뜻기억({ measure: { measure: async () => null } });
  assert.equal(await meaning3.담기([{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }]), 0);
  assert.deepEqual(await meaning3.찾기('아무거나 물어봄'), []);
});

test('짧은 말은 색인에 안 담는다 — 「응」이 아무거나 닮아 보이면 안 된다', async () => {
  const meaning4 = new 뜻기억({ measure: fakeMeasure({ ...table2, '응': [1, 0, 0, 0] }) });
  await meaning4.담기([{ role: 'sensed', channel: 'web', text: '응', at: 1 }]);
  assert.equal(meaning4.담긴수, 0);
});

test('같은 말은 두 번 안 담는다', async () => {
  const meaning5 = new 뜻기억({ measure: fakeMeasure(table2) });
  const line = [{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }];
  await meaning5.담기(line);
  await meaning5.담기(line);
  assert.equal(meaning5.담긴수, 1);
});

test('방금 나눈 말은 빼고 준다 — 두뇌가 이미 보고 있다', async () => {
  const meaning6 = new 뜻기억({ measure: fakeMeasure(table2), 문턱: 0.5 });
  await meaning6.담기([{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }]);
  const produced2 = await meaning6.찾기('저번에 못 먹는다고 한 게 뭐였지', { 뺄것: new Set(['마라탕은 매워서 못 먹어']) });
  assert.deepEqual(produced2, []);
});

test('껐다 켜도 색인이 남는다', async () => {
  const path = newFile();
  const firstRun = new 뜻기억({ path, measure: fakeMeasure(table2) });
  await firstRun.담기([{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }]);
  const nextRun = new 뜻기억({ path, measure: fakeMeasure(table2), 문턱: 0.5 });
  assert.equal(nextRun.담긴수, 1);
  const produced3 = await nextRun.찾기('저번에 못 먹는다고 한 게 뭐였지');
  assert.equal(produced3[0]?.text, '마라탕은 매워서 못 먹어');
  assert.ok(readFileSync(path, 'utf8').includes('마라탕'));
});

test('오래되면 앞에서부터 빠진다', async () => {
  const many = {};
  const lines = [];
  for (let i = 0; i < 5; i += 1) {
    const t = `아주 긴 말 번호 ${i} 입니다`;
    many[t] = [i + 1, 1, 0, 0];
    lines.push({ role: 'sensed', channel: 'web', text: t, at: i });
  }
  const meaning7 = new 뜻기억({ measure: fakeMeasure(many), max: 3 });
  await meaning7.담기(lines);
  assert.equal(meaning7.담긴수, 3);
});

test('닮은정도는 같은 것끼리 1 에 가깝다', () => {
  assert.ok(닮은정도([1, 0], [1, 0]) > 0.99);
  assert.ok(닮은정도([1, 0], [0, 1]) < 0.01);
});
