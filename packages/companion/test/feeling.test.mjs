import assert from 'node:assert/strict';
import test from 'node:test';

import { Heart, feelingNote, 평소 } from '../dist/index.js';

/** 시계를 손에 쥐고 쓰는 마음. */
const 마음 = (options = {}) => {
  let 지금 = 0;
  const heart = new Heart({ halfLifeMs: 10_000, now: () => 지금, ...options });
  return { heart, 흐르게: (ms) => { 지금 += ms; } };
};

test('아무 일 없으면 평소 자리에 있다', () => {
  const { heart } = 마음();
  assert.deepEqual(heart.state, 평소);
});

test('웃어 주면 마음이 좋은 쪽으로 움직인다', () => {
  const { heart } = 마음();
  const 뒤 = heart.felt('웃어줌');
  assert.ok(뒤.valence > 평소.valence);
  assert.ok(뒤.arousal > 평소.arousal);
});

test('시들하면 나쁜 쪽으로 움직인다', () => {
  const { heart } = 마음();
  assert.ok(heart.felt('시들함').valence < 평소.valence);
});

test('쿡 찔리면 기분은 별로인데 깬다 — 두 축이 따로 논다', () => {
  const { heart } = 마음();
  const 뒤 = heart.felt('쿡찔림');
  assert.ok(뒤.arousal > 평소.arousal, '깨긴 한다');
  assert.ok(뒤.valence < 평소.valence, '좋진 않다');
});

test('쓰다듬으면 좋으면서 가라앉는다 — 찔리는 것과 반대 방향이다', () => {
  const { heart } = 마음();
  const 뒤 = heart.felt('쓰다듬김');
  assert.ok(뒤.valence > 평소.valence);
  assert.ok(뒤.arousal < 평소.arousal);
});

test('같은 일이 겹치면 더 밀린다', () => {
  const { heart } = 마음();
  const 한번 = heart.felt('웃어줌').valence;
  const 두번 = heart.felt('웃어줌').valence;
  assert.ok(두번 > 한번);
});

test('세기를 줄이면 덜 밀린다', () => {
  const a = 마음().heart.felt('놀이이김', 1).valence;
  const b = 마음().heart.felt('놀이이김', 0.5).valence;
  assert.ok(b < a);
});

test('아무리 좋은 일이 쌓여도 끝은 있다', () => {
  const { heart } = 마음();
  for (let i = 0; i < 30; i += 1) heart.felt('웃어줌');
  assert.ok(heart.state.valence <= 1);
  assert.ok(heart.state.arousal <= 1);
});

test('아무리 나쁜 일이 쌓여도 바닥은 있다', () => {
  const { heart } = 마음();
  for (let i = 0; i < 30; i += 1) heart.felt('무시당함');
  assert.ok(heart.state.valence >= -1);
  assert.ok(heart.state.arousal >= -1);
});

// ── 되돌아오기 ──────────────────────────────────────────────────────

test('시간이 지나면 제자리로 돌아온다 — 안 돌아오면 기분이 아니라 고장이다', () => {
  const { heart, 흐르게 } = 마음();
  heart.felt('웃어줌');
  const 직후 = heart.state.valence;
  흐르게(60_000);
  const 한참뒤 = heart.state.valence;
  assert.ok(한참뒤 < 직후);
  assert.ok(Math.abs(한참뒤 - 평소.valence) < 0.02, '거의 평소로 돌아와야 한다');
});

test('반감기만큼 지나면 절반쯤 돌아온다', () => {
  const { heart, 흐르게 } = 마음();
  const 직후 = heart.felt('웃어줌').valence;
  const 밀린것 = 직후 - 평소.valence;
  흐르게(10_000);
  const 남은것 = heart.state.valence - 평소.valence;
  assert.ok(Math.abs(남은것 - 밀린것 / 2) < 0.01, `절반쯤 남아야 한다 (${남은것} vs ${밀린것 / 2})`);
});

test('되돌아오는 빠르기는 밖에서 정한다', () => {
  const 빠른 = 마음({ halfLifeMs: 1000 });
  const 느린 = 마음({ halfLifeMs: 100_000 });
  빠른.heart.felt('웃어줌'); 느린.heart.felt('웃어줌');
  빠른.흐르게(5000); 느린.흐르게(5000);
  assert.ok(빠른.heart.state.valence < 느린.heart.state.valence);
});

test('물어보는 것만으로 마음이 달라지지 않는다', () => {
  const { heart } = 마음();
  heart.felt('웃어줌');
  assert.deepEqual(heart.state, heart.state);
});

test('나쁜 쪽으로 밀린 것도 제자리로 돌아온다 — 한 번 삐치면 영영 삐치는 건 고장이다', () => {
  const { heart, 흐르게 } = 마음();
  for (let i = 0; i < 5; i += 1) heart.felt('무시당함');
  흐르게(120_000);
  assert.ok(Math.abs(heart.state.valence - 평소.valence) < 0.02);
});

// ── 시계 기분 위에 얹기 ─────────────────────────────────────────────

test('시계 기분을 밀어내지 않고 얹는다', () => {
  const { heart } = 마음();
  const 밤 = { energy: 0.22, warmth: 0.5 };
  const 그냥 = heart.colour(밤);
  assert.equal(그냥.energy, 밤.energy, '아무 일 없으면 거의 그대로다');

  heart.felt('놀이이김');
  const 신났을때 = heart.colour(밤);
  assert.ok(신났을때.energy > 밤.energy, '밤이어도 조금은 밀어 준다');
  assert.ok(신났을때.energy < 0.6, '그래도 밤은 밤이다');
});

test('얹어도 0과 1 밖으로 안 나간다', () => {
  const { heart } = 마음();
  for (let i = 0; i < 20; i += 1) heart.felt('무시당함');
  const 바닥 = heart.colour({ energy: 0.05, warmth: 0.05 });
  assert.ok(바닥.energy >= 0 && 바닥.warmth >= 0);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('평소에는 아무 말도 안 얹는다 — 늘 기분 얘기를 하면 그게 소음이다', () => {
  assert.equal(feelingNote(평소), '');
});

test('감정 이름을 붙이지 않는다 — 이름을 주면 그 감정을 연기한다', () => {
  const note = feelingNote({ valence: 0.6, arousal: 0.5 });
  assert.notEqual(note, '');
  for (const 이름 of ['기쁨', '슬픔', '분노', '행복', '우울']) {
    assert.equal(note.includes(이름), false, `${이름} 이라고 이름 붙이면 안 된다`);
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
