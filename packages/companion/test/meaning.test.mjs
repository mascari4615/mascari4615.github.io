import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { 뜻기억, 닮은정도 } from '../dist/index.js';

/* 진짜 모델은 시험에서 안 쓴다 — 뜨는 데 수십 초 걸리고, 남의 모델이 바뀌면 우리 시험이
   빨개지는 건 우리 고장이 아니다. 대신 **꺼내는 규칙**과 **준비 안 됐을 때**를 잠근다.
   가짜 뜻 = 낱말 몇 개를 축으로 삼은 벡터. */
const 축 = ['매움', '음식', '날씨', '게임'];
const 가짜재기 = (표) => ({
  재기: async (글) => {
    const 값 = 표[글];
    if (값 === undefined) return null;
    const 길이 = Math.hypot(...값) || 1;
    return 값.map((v) => v / 길이);
  },
});

const 표 = {
  '마라탕은 매워서 못 먹어': [1, 1, 0, 0],
  '매운 음식 싫어함': [1, 0.9, 0, 0],
  '오늘 날씨 좋다': [0, 0, 1, 0],
  '저번에 못 먹는다고 한 게 뭐였지': [0.9, 1, 0, 0],
};

const 새파일 = () => join(mkdtempSync(join(tmpdir(), 'meaning-')), '뜻-색인.json');

test('낱말이 하나도 안 겹쳐도 뜻으로 찾는다', async () => {
  const 뜻 = new 뜻기억({ 재기: 가짜재기(표), 문턱: 0.5 });
  await 뜻.담기([
    { role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 },
    { role: 'sensed', channel: 'web', text: '오늘 날씨 좋다', at: 2 },
  ]);
  const 나온것 = await 뜻.찾기('저번에 못 먹는다고 한 게 뭐였지');
  assert.equal(나온것.length, 1, `나온 것: ${JSON.stringify(나온것)}`);
  assert.equal(나온것[0].text, '마라탕은 매워서 못 먹어');
});

test('안 닮은 건 안 꺼낸다 — 문턱 아래는 버린다', async () => {
  const 뜻 = new 뜻기억({ 재기: 가짜재기(표), 문턱: 0.9 });
  await 뜻.담기([{ role: 'sensed', channel: 'web', text: '오늘 날씨 좋다', at: 1 }]);
  assert.deepEqual(await 뜻.찾기('매운 음식 싫어함'), []);
});

test('아직 준비가 안 됐으면 빈손으로 돌아온다 — 기다리게 하지 않는다', async () => {
  const 뜻 = new 뜻기억({ 재기: { 재기: async () => null } });
  assert.equal(await 뜻.담기([{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }]), 0);
  assert.deepEqual(await 뜻.찾기('아무거나 물어봄'), []);
});

test('짧은 말은 색인에 안 담는다 — 「응」이 아무거나 닮아 보이면 안 된다', async () => {
  const 뜻 = new 뜻기억({ 재기: 가짜재기({ ...표, 응: [1, 0, 0, 0] }) });
  await 뜻.담기([{ role: 'sensed', channel: 'web', text: '응', at: 1 }]);
  assert.equal(뜻.담긴수, 0);
});

test('같은 말은 두 번 안 담는다', async () => {
  const 뜻 = new 뜻기억({ 재기: 가짜재기(표) });
  const 줄 = [{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }];
  await 뜻.담기(줄);
  await 뜻.담기(줄);
  assert.equal(뜻.담긴수, 1);
});

test('방금 나눈 말은 빼고 준다 — 두뇌가 이미 보고 있다', async () => {
  const 뜻 = new 뜻기억({ 재기: 가짜재기(표), 문턱: 0.5 });
  await 뜻.담기([{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }]);
  const 나온것 = await 뜻.찾기('저번에 못 먹는다고 한 게 뭐였지', { 뺄것: new Set(['마라탕은 매워서 못 먹어']) });
  assert.deepEqual(나온것, []);
});

test('껐다 켜도 색인이 남는다', async () => {
  const path = 새파일();
  const 첫판 = new 뜻기억({ path, 재기: 가짜재기(표) });
  await 첫판.담기([{ role: 'sensed', channel: 'web', text: '마라탕은 매워서 못 먹어', at: 1 }]);
  const 다음판 = new 뜻기억({ path, 재기: 가짜재기(표), 문턱: 0.5 });
  assert.equal(다음판.담긴수, 1);
  const 나온것 = await 다음판.찾기('저번에 못 먹는다고 한 게 뭐였지');
  assert.equal(나온것[0]?.text, '마라탕은 매워서 못 먹어');
  assert.ok(readFileSync(path, 'utf8').includes('마라탕'));
});

test('오래되면 앞에서부터 빠진다', async () => {
  const 많이 = {};
  const 줄들 = [];
  for (let i = 0; i < 5; i += 1) {
    const t = `아주 긴 말 번호 ${i} 입니다`;
    많이[t] = [i + 1, 1, 0, 0];
    줄들.push({ role: 'sensed', channel: 'web', text: t, at: i });
  }
  const 뜻 = new 뜻기억({ 재기: 가짜재기(많이), 최대: 3 });
  await 뜻.담기(줄들);
  assert.equal(뜻.담긴수, 3);
});

test('닮은정도는 같은 것끼리 1 에 가깝다', () => {
  assert.ok(닮은정도([1, 0], [1, 0]) > 0.99);
  assert.ok(닮은정도([1, 0], [0, 1]) < 0.01);
});
