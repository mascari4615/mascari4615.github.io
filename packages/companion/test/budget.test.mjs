import assert from 'node:assert/strict';
import test from 'node:test';

import { composeIngredients, layOut, pickIngredients } from '../dist/index.js';

const material = (name, text, weight, when) => ({ name, text, weight, ...(when === undefined ? {} : { when }) });

test('빈 재료는 없는 것으로 친다', () => {
  const picked = pickIngredients([material('가', '', 9), material('나', '  ', 8), material('다', '있는 말', 7)]);
  assert.deepEqual(picked.map((x) => x.name), ['다']);
});

test('지금 필요 없는 것은 안 넣는다. 안 물었는데 늘 얹을 이유가 없다', () => {
  const picked2 = pickIngredients([material('자기상', '전에 이렇게 말했다', 9, false), material('기분', '지금 상태', 8)]);
  assert.deepEqual(picked2.map((x) => x.name), ['기분']);
});

test('무게가 큰 것부터 자리를 얻는다', () => {
  const picked3 = pickIngredients(
    [material('작은', '가'.repeat(30), 1), material('큰', '나'.repeat(30), 9)],
    { maxChars: 30, maxLines: 5 },
  );
  assert.deepEqual(picked3.map((x) => x.name), ['큰']);
});

test('무게가 같으면 적어 준 순서를 지킨다. 흔들리면 매번 다른 프롬프트가 된다', () => {
  const all = [material('가', '하나', 5), material('나', '둘', 5), material('다', '셋', 5)];
  assert.deepEqual(pickIngredients(all).map((x) => x.name), ['가', '나', '다']);
  assert.deepEqual(pickIngredients(all).map((x) => x.name), ['가', '나', '다']);
});

test('글자 예산을 넘기지 않는다', () => {
  const all = [material('가', '가'.repeat(50), 9), material('나', '나'.repeat(50), 8), material('다', '다'.repeat(50), 7)];
  const picked4 = pickIngredients(all, { maxChars: 120 });
  assert.ok(picked4.reduce((n, x) => n + x.text.length, 0) <= 120);
});

test('줄 수도 제한한다. 짧은 줄이 많은 것도 제약이 많은 것이다', () => {
  const all = Array.from({ length: 10 }, (_, i) => material(`${i}`, '짧다', 10 - i));
  assert.equal(pickIngredients(all, { maxLines: 3 }).length, 3);
});

test('예산에 안 들면 잘라 넣지 않고 건너뛴다. 반쯤 잘린 지시는 안 넣느니만 못하다', () => {
  const all = [material('큰', '가'.repeat(100), 9), material('작은', '나'.repeat(10), 8)];
  const picked5 = pickIngredients(all, { maxChars: 50 });
  assert.deepEqual(picked5.map((x) => x.name), ['작은']);
  assert.equal(picked5[0].text.length, 10, '자르지 않는다');
});

// ── 늘어놓기 ────────────────────────────────────────────────────────

test('가장 중요한 것은 맨 앞, 그 다음은 맨 뒤. 가운데는 흐려진다', () => {
  const listed = layOut([material('1등', '가', 9), material('2등', '나', 8), material('3등', '다', 7), material('4등', '라', 6)]);
  assert.deepEqual(listed, ['가', '다', '라', '나']);
});

test('둘 이하면 그대로 둔다', () => {
  assert.deepEqual(layOut([material('가', '하나', 9), material('나', '둘', 8)]), ['하나', '둘']);
  assert.deepEqual(layOut([]), []);
});

test('골라서 늘어놓기까지 한 번에', () => {
  const content = composeIngredients([
    material('기분', '지금 상태', 9),
    material('안 켬', '이건 빠진다', 8, false),
    material('사이', '조금 편한 사이', 4),
  ]);
  assert.equal(content.includes('이건 빠진다'), false);
  assert.match(content, /지금 상태/);
  assert.match(content, /조금 편한 사이/);
});

test('아무것도 없으면 빈 글이다', () => {
  assert.equal(composeIngredients([]), '');
  assert.equal(composeIngredients([material('가', '', 9)]), '');
});

test('실제로 짧아진다. 이게 이번 회차의 요점이다', () => {
  const elevenLines = Array.from({ length: 11 }, (_, i) => material(`${i}`, '가'.repeat(70), 11 - i));
  const whole = elevenLines.map((x) => x.text).join(' ');
  const selected = composeIngredients(elevenLines);
  assert.ok(selected.length < whole.length / 2, `${selected.length} vs ${whole.length}`);
});

test('늘 있어야 하는 설명은 재료로 넣지 않는다. 상황과 자리 다툼을 시키면 밀린다', () => {
  // 36회차 교훈을 시험으로 박아 둔다: 능력 설명이 재료 목록에 있으면 밀릴 수 있다.
  const materials = [
    material('상황1', '가'.repeat(200), 9),
    material('상황2', '나'.repeat(200), 8),
    material('능력설명', '이런 걸 할 수 있다', 2),
  ];
  const picked6 = pickIngredients(materials, { maxChars: 420, maxLines: 5 });
  assert.equal(picked6.some((x) => x.name === '능력설명'), true, '이번엔 들어갔지만');

  const whenTight = pickIngredients(materials, { maxChars: 400, maxLines: 5 });
  assert.equal(whenTight.some((x) => x.name === '능력설명'), false, '빡빡하면 밀린다. 그래서 재료로 두면 안 된다');
});

// ── 왜 안 실렸나 (81회차) ──────────────────────────────────────────

test('안 실린 이유를 같이 알려 준다. 안 실렸다만 남기면 못 고친다', () => {
  const remaining = [];
  pickIngredients(
    [
      { name: '꺼진것', text: '가나다', weight: 9, when: false },
      { name: '빈것', text: '   ', weight: 9 },
      { name: '큰것', text: '가'.repeat(30), weight: 9 },
      { name: '밀린것', text: '나'.repeat(30), weight: 1 },
    ],
    { maxChars: 30, maxLines: 1, slot: '너 뭐 좋아해?', mark: (name, fate, why) => remaining.push([name, fate, why]) },
  );
  const reason = Object.fromEntries(remaining.map(([n, , w]) => [n, w]));
  assert.match(reason['꺼진것'], /조건이 안 켜졌다/);
  assert.match(reason['빈것'], /만들 게 없었다/);
  assert.match(reason['밀린것'], /자리가 모자랐다/);
  assert.equal(reason['큰것'], '', '실린 것에는 이유가 없다');
});

test('이유에 그 turn 이 뭐였는지 붙는다. 없으면 어느 순간이었는지 되짚을 수가 없다', () => {
  const remaining2 = [];
  pickIngredients([{ name: '꺼진것', text: '가', weight: 1, when: false }], {
    slot: '너 뭐 좋아해?',
    mark: (name, fate, why2) => remaining2.push(why2),
  });
  assert.match(remaining2[0], /너 뭐 좋아해/);
});

test('자리를 안 주면 이유만 남는다. 부르는 쪽이 안 줘도 안 깨진다', () => {
  const remaining3 = [];
  pickIngredients([{ name: '빈것', text: '', weight: 1 }], { mark: (n, f, why3) => remaining3.push(why3) });
  assert.equal(remaining3[0], '만들 게 없었다');
});
