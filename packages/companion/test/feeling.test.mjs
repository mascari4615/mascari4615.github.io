import assert from 'node:assert/strict';
import test from 'node:test';

import { Heart, feelingNote, usual } from '../dist/index.js';

/** 시계를 손에 쥐고 쓰는 마음. */
const mood = (options = {}) => {
  let now2 = 0;
  const heart = new Heart({ halfLifeMs: 10_000, now: () => now2, ...options });
  return { heart, flow: (ms) => { now2 += ms; } };
};

test('아무 일 없으면 평소 자리에 있다', () => {
  const { heart } = mood();
  assert.deepEqual(heart.state, usual);
});

test('웃어 주면 마음이 좋은 쪽으로 움직인다', () => {
  const { heart } = mood();
  const after = heart.felt('웃어줌');
  assert.ok(after.valence > usual.valence);
  assert.ok(after.arousal > usual.arousal);
});

test('시들하면 나쁜 쪽으로 움직인다', () => {
  const { heart } = mood();
  assert.ok(heart.felt('시들함').valence < usual.valence);
});

test('쿡 찔리면 기분은 별로인데 깬다 — 두 축이 따로 논다', () => {
  const { heart } = mood();
  const after2 = heart.felt('쿡찔림');
  assert.ok(after2.arousal > usual.arousal, '깨긴 한다');
  assert.ok(after2.valence < usual.valence, '좋진 않다');
});

test('쓰다듬으면 좋으면서 가라앉는다 — 찔리는 것과 반대 방향이다', () => {
  const { heart } = mood();
  const after3 = heart.felt('쓰다듬김');
  assert.ok(after3.valence > usual.valence);
  assert.ok(after3.arousal < usual.arousal);
});

test('같은 일이 겹치면 더 밀린다', () => {
  const { heart } = mood();
  const once = heart.felt('웃어줌').valence;
  const secondTurn = heart.felt('웃어줌').valence;
  assert.ok(secondTurn > once);
});

test('세기를 줄이면 덜 밀린다', () => {
  const a = mood().heart.felt('놀이이김', 1).valence;
  const b = mood().heart.felt('놀이이김', 0.5).valence;
  assert.ok(b < a);
});

test('아무리 좋은 일이 쌓여도 끝은 있다', () => {
  const { heart } = mood();
  for (let i = 0; i < 30; i += 1) heart.felt('웃어줌');
  assert.ok(heart.state.valence <= 1);
  assert.ok(heart.state.arousal <= 1);
});

test('아무리 나쁜 일이 쌓여도 바닥은 있다', () => {
  const { heart } = mood();
  for (let i = 0; i < 30; i += 1) heart.felt('무시당함');
  assert.ok(heart.state.valence >= -1);
  assert.ok(heart.state.arousal >= -1);
});

// ── 되돌아오기 ──────────────────────────────────────────────────────

test('시간이 지나면 제자리로 돌아온다 — 안 돌아오면 기분이 아니라 고장이다', () => {
  const { heart, flow: flow } = mood();
  heart.felt('웃어줌');
  const justAfter = heart.state.valence;
  flow(60_000);
  const longAfter = heart.state.valence;
  assert.ok(longAfter < justAfter);
  assert.ok(Math.abs(longAfter - usual.valence) < 0.02, '거의 평소로 돌아와야 한다');
});

test('반감기만큼 지나면 절반쯤 돌아온다', () => {
  const { heart, flow: flow } = mood();
  const justAfter2 = heart.felt('웃어줌').valence;
  const queued = justAfter2 - usual.valence;
  flow(10_000);
  const remaining = heart.state.valence - usual.valence;
  assert.ok(Math.abs(remaining - queued / 2) < 0.01, `절반쯤 남아야 한다 (${remaining} vs ${queued / 2})`);
});

test('되돌아오는 빠르기는 밖에서 정한다', () => {
  const fast = mood({ halfLifeMs: 1000 });
  const slow = mood({ halfLifeMs: 100_000 });
  fast.heart.felt('웃어줌'); slow.heart.felt('웃어줌');
  fast.flow(5000); slow.flow(5000);
  assert.ok(fast.heart.state.valence < slow.heart.state.valence);
});

test('물어보는 것만으로 마음이 달라지지 않는다', () => {
  const { heart } = mood();
  heart.felt('웃어줌');
  assert.deepEqual(heart.state, heart.state);
});

test('나쁜 쪽으로 밀린 것도 제자리로 돌아온다 — 한 번 삐치면 영영 삐치는 건 고장이다', () => {
  const { heart, flow: flow } = mood();
  for (let i = 0; i < 5; i += 1) heart.felt('무시당함');
  flow(120_000);
  assert.ok(Math.abs(heart.state.valence - usual.valence) < 0.02);
});

// ── 시계 기분 위에 얹기 ─────────────────────────────────────────────

test('시계 기분을 밀어내지 않고 얹는다', () => {
  const { heart } = mood();
  const night = { energy: 0.22, warmth: 0.5 };
  const plain = heart.colour(night);
  assert.equal(plain.energy, night.energy, '아무 일 없으면 거의 그대로다');

  heart.felt('놀이이김');
  const whenExcited = heart.colour(night);
  assert.ok(whenExcited.energy > night.energy, '밤이어도 조금은 밀어 준다');
  assert.ok(whenExcited.energy < 0.6, '그래도 밤은 밤이다');
});

test('얹어도 0과 1 밖으로 안 나간다', () => {
  const { heart } = mood();
  for (let i = 0; i < 20; i += 1) heart.felt('무시당함');
  const floor = heart.colour({ energy: 0.05, warmth: 0.05 });
  assert.ok(floor.energy >= 0 && floor.warmth >= 0);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('평소에는 아무 말도 안 얹는다 — 늘 기분 얘기를 하면 그게 소음이다', () => {
  assert.equal(feelingNote(usual), '');
});

test('감정 이름을 붙이지 않는다 — 이름을 주면 그 감정을 연기한다', () => {
  const note = feelingNote({ valence: 0.6, arousal: 0.5 });
  assert.notEqual(note, '');
  for (const name of ['기쁨', '슬픔', '분노', '행복', '우울']) {
    assert.equal(note.includes(name), false, `${name} 이라고 name 붙이면 안 된다`);
  }
  assert.match(note, /감정을 설명하지는 마라/);
});

test('좋은 쪽과 나쁜 쪽을 다르게 말한다', () => {
  assert.match(feelingNote({ valence: 0.6, arousal: 0 }), /나쁘지 않았다/);
  assert.match(feelingNote({ valence: -0.6, arousal: 0 }), /언짢았다/);
});

test('들뜬 것과 가라앉은 것을 다르게 말한다', () => {
  assert.match(feelingNote({ valence: 0, arousal: 0.6 }), /들떠 있다/);
  assert.match(feelingNote({ valence: 0, arousal: -0.6 }), /가라앉아 있다/);
});
