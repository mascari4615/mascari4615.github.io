import assert from 'node:assert/strict';
import test from 'node:test';

import { 드묾가산, 드묾덧입히기, pickIngredients } from '../dist/index.js';

const 셈 = (실림, 밀림, 꺼짐, 빔) => ({ 실림, 밀림, 꺼짐, 빔 });

test('거의 늘 꺼져 있던 재료는 켜졌을 때 크게 세진다 — 그 순간에 딱 맞는 말이다', () => {
  // 실측: 자기상 (지나감 613 · 밀림 3 · 꺼짐 610 · 빔 0)
  assert.ok(드묾가산(셈(0, 3, 610, 0)) >= 10, `자기상 같은 재료가 안 세지면 영영 안 실린다`);
});

test('늘 켜져 있는 재료는 안 밀어준다 — 안 그러면 그냥 다 같이 세진다', () => {
  assert.equal(드묾가산(셈(500, 20, 0, 5)), 0);
});

test('반쯤 켜지는 재료도 안 밀어준다 — 드문 게 아니다', () => {
  assert.equal(드묾가산(셈(100, 50, 150, 0)), 0);
});

test('아직 얼마 안 돌았으면 아무 말도 안 한다 — 새 재료가 첫 turn 에 1등이면 안 된다', () => {
  assert.equal(드묾가산(셈(0, 0, 5, 0)), 0);
  assert.equal(드묾가산(undefined), 0);
});

test('「빔」은 드묾으로 안 센다 — 늘 빈 재료가 가장 세지면 안 된다', () => {
  // 실측: 표류 (지나감 620 · 빔 620) — 켜지긴 하는데 만들 게 없는 것이다
  assert.equal(드묾가산(셈(0, 0, 0, 620)), 0);
});

test('꺼진 재료에는 안 얹는다 — 어차피 안 실리고 계산만 흐려진다', () => {
  const 얹은것 = 드묾덧입히기(
    [{ name: '자기상', text: '가', weight: 7, when: false }],
    () => 셈(0, 3, 610, 0),
  );
  assert.equal(얹은것[0].weight, 7);
});

test('원본 무게는 안 바뀐다 — 다음 turn 이 이전 turn 을 물려받으면 안 된다', () => {
  const 원본 = [{ name: '자기상', text: '가', weight: 7 }];
  드묾덧입히기(원본, () => 셈(0, 3, 610, 0));
  assert.equal(원본[0].weight, 7);
});

test('드물게 켜진 재료가 늘 있던 재료를 이긴다 — 이게 이 자리를 만든 이유다', () => {
  const 셈표 = { 자기상: 셈(0, 3, 610, 0), 기분: 셈(500, 20, 0, 0) };
  const 목록 = [
    { name: '기분', text: '가'.repeat(25), weight: 12 },
    { name: '자기상', text: '나'.repeat(25), weight: 7 },
  ];
  const 그냥 = pickIngredients(목록, { maxChars: 25, maxLines: 1 }).map((x) => x.name);
  assert.deepEqual(그냥, ['기분'], '고치기 전에는 늘 있던 쪽이 이겼다');

  const 드묾붙여 = pickIngredients(드묾덧입히기(목록, (n) => 셈표[n]), { maxChars: 25, maxLines: 1 });
  assert.deepEqual(드묾붙여.map((x) => x.name), ['자기상'], '조수님이 얘 얘기를 물었는데 기분이 실리면 뒤집힌 것이다');
});
