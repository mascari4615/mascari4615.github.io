import assert from 'node:assert/strict';
import test from 'node:test';

import { composeIngredients, layOut, pickIngredients } from '../dist/index.js';

const 재료 = (name, text, weight, when) => ({ name, text, weight, ...(when === undefined ? {} : { when }) });

test('빈 재료는 없는 것으로 친다', () => {
  const 고른것 = pickIngredients([재료('가', '', 9), 재료('나', '  ', 8), 재료('다', '있는 말', 7)]);
  assert.deepEqual(고른것.map((x) => x.name), ['다']);
});

test('지금 필요 없는 것은 안 넣는다 — 안 물었는데 늘 얹을 이유가 없다', () => {
  const 고른것 = pickIngredients([재료('자기상', '전에 이렇게 말했다', 9, false), 재료('기분', '지금 상태', 8)]);
  assert.deepEqual(고른것.map((x) => x.name), ['기분']);
});

test('무게가 큰 것부터 자리를 얻는다', () => {
  const 고른것 = pickIngredients(
    [재료('작은', '가'.repeat(30), 1), 재료('큰', '나'.repeat(30), 9)],
    { maxChars: 30, maxLines: 5 },
  );
  assert.deepEqual(고른것.map((x) => x.name), ['큰']);
});

test('무게가 같으면 적어 준 순서를 지킨다 — 흔들리면 매번 다른 프롬프트가 된다', () => {
  const all = [재료('가', '하나', 5), 재료('나', '둘', 5), 재료('다', '셋', 5)];
  assert.deepEqual(pickIngredients(all).map((x) => x.name), ['가', '나', '다']);
  assert.deepEqual(pickIngredients(all).map((x) => x.name), ['가', '나', '다']);
});

test('글자 예산을 넘기지 않는다', () => {
  const all = [재료('가', '가'.repeat(50), 9), 재료('나', '나'.repeat(50), 8), 재료('다', '다'.repeat(50), 7)];
  const 고른것 = pickIngredients(all, { maxChars: 120 });
  assert.ok(고른것.reduce((n, x) => n + x.text.length, 0) <= 120);
});

test('줄 수도 제한한다 — 짧은 줄이 많은 것도 제약이 많은 것이다', () => {
  const all = Array.from({ length: 10 }, (_, i) => 재료(`${i}`, '짧다', 10 - i));
  assert.equal(pickIngredients(all, { maxLines: 3 }).length, 3);
});

test('예산에 안 들면 잘라 넣지 않고 건너뛴다 — 반쯤 잘린 지시는 안 넣느니만 못하다', () => {
  const all = [재료('큰', '가'.repeat(100), 9), 재료('작은', '나'.repeat(10), 8)];
  const 고른것 = pickIngredients(all, { maxChars: 50 });
  assert.deepEqual(고른것.map((x) => x.name), ['작은']);
  assert.equal(고른것[0].text.length, 10, '자르지 않는다');
});

// ── 늘어놓기 ────────────────────────────────────────────────────────

test('가장 중요한 것은 맨 앞, 그 다음은 맨 뒤 — 가운데는 흐려진다', () => {
  const 늘어놓음 = layOut([재료('1등', '가', 9), 재료('2등', '나', 8), 재료('3등', '다', 7), 재료('4등', '라', 6)]);
  assert.deepEqual(늘어놓음, ['가', '다', '라', '나']);
});

test('둘 이하면 그대로 둔다', () => {
  assert.deepEqual(layOut([재료('가', '하나', 9), 재료('나', '둘', 8)]), ['하나', '둘']);
  assert.deepEqual(layOut([]), []);
});

test('골라서 늘어놓기까지 한 번에', () => {
  const 글 = composeIngredients([
    재료('기분', '지금 상태', 9),
    재료('안 켬', '이건 빠진다', 8, false),
    재료('사이', '조금 편한 사이', 4),
  ]);
  assert.equal(글.includes('이건 빠진다'), false);
  assert.match(글, /지금 상태/);
  assert.match(글, /조금 편한 사이/);
});

test('아무것도 없으면 빈 글이다', () => {
  assert.equal(composeIngredients([]), '');
  assert.equal(composeIngredients([재료('가', '', 9)]), '');
});

test('실제로 짧아진다 — 이게 이번 회차의 요점이다', () => {
  const 열한줄 = Array.from({ length: 11 }, (_, i) => 재료(`${i}`, '가'.repeat(70), 11 - i));
  const 통째 = 열한줄.map((x) => x.text).join(' ');
  const 골라낸것 = composeIngredients(열한줄);
  assert.ok(골라낸것.length < 통째.length / 2, `${골라낸것.length} vs ${통째.length}`);
});

test('늘 있어야 하는 설명은 재료로 넣지 않는다 — 상황과 자리 다툼을 시키면 밀린다', () => {
  // 36회차 교훈을 시험으로 박아 둔다: 능력 설명이 재료 목록에 있으면 밀릴 수 있다.
  const 재료들 = [
    재료('상황1', '가'.repeat(200), 9),
    재료('상황2', '나'.repeat(200), 8),
    재료('능력설명', '이런 걸 할 수 있다', 2),
  ];
  const 고른것 = pickIngredients(재료들, { maxChars: 420, maxLines: 5 });
  assert.equal(고른것.some((x) => x.name === '능력설명'), true, '이번엔 들어갔지만');

  const 빡빡할때 = pickIngredients(재료들, { maxChars: 400, maxLines: 5 });
  assert.equal(빡빡할때.some((x) => x.name === '능력설명'), false, '빡빡하면 밀린다 — 그래서 재료로 두면 안 된다');
});

// ── 왜 안 실렸나 (81회차) ──────────────────────────────────────────

test('안 실린 이유를 같이 알려 준다 — 「안 실렸다」만 남기면 못 고친다', () => {
  const 남은것 = [];
  pickIngredients(
    [
      { name: '꺼진것', text: '가나다', weight: 9, when: false },
      { name: '빈것', text: '   ', weight: 9 },
      { name: '큰것', text: '가'.repeat(30), weight: 9 },
      { name: '밀린것', text: '나'.repeat(30), weight: 1 },
    ],
    { maxChars: 30, maxLines: 1, 자리: '「너 뭐 좋아해?」', mark: (name, fate, 왜) => 남은것.push([name, fate, 왜]) },
  );
  const 이유 = Object.fromEntries(남은것.map(([n, , w]) => [n, w]));
  assert.match(이유['꺼진것'], /조건이 안 켜졌다/);
  assert.match(이유['빈것'], /만들 게 없었다/);
  assert.match(이유['밀린것'], /자리가 모자랐다/);
  assert.equal(이유['큰것'], '', '실린 것에는 이유가 없다');
});

test('이유에 그 turn 이 뭐였는지 붙는다 — 없으면 어느 순간이었는지 되짚을 수가 없다', () => {
  const 남은것 = [];
  pickIngredients([{ name: '꺼진것', text: '가', weight: 1, when: false }], {
    자리: '「너 뭐 좋아해?」',
    mark: (name, fate, 왜) => 남은것.push(왜),
  });
  assert.match(남은것[0], /너 뭐 좋아해/);
});

test('자리를 안 주면 이유만 남는다 — 부르는 쪽이 안 줘도 안 깨진다', () => {
  const 남은것 = [];
  pickIngredients([{ name: '빈것', text: '', weight: 1 }], { mark: (n, f, 왜) => 남은것.push(왜) });
  assert.equal(남은것[0], '만들 게 없었다');
});
