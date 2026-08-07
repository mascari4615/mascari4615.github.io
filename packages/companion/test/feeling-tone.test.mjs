import assert from 'node:assert/strict';
import test from 'node:test';

import { Heart, splitTone, toneOf, withTone, 기분결, 기분빠르기, 평소 } from '../dist/index.js';

test('평소에는 아무것도 안 얹는다 — 늘 뭔가 얹혀 있으면 그건 결이 아니라 왜곡이다', () => {
  assert.equal(toneOf(평소), null);
  assert.equal(toneOf({ valence: 0.1, arousal: -0.2 }), null);
});

test('신나면 들뜬 결', () => {
  assert.equal(toneOf({ valence: 0.5, arousal: 0.5 }), '들뜸');
});

test('언짢은데 깨어 있으면 뾰족한 결 — 신난 것과 다르다', () => {
  assert.equal(toneOf({ valence: -0.5, arousal: 0.5 }), '뾰족');
});

test('가라앉으면 처진 결', () => {
  assert.equal(toneOf({ valence: -0.3, arousal: -0.6 }), '처짐');
});

test('좋으면서 가라앉으면 누그러진 결 — 처진 것과 다르다', () => {
  assert.equal(toneOf({ valence: 0.5, arousal: -0.6 }), '누그러짐');
});

test('결은 네 칸뿐이다 — 잘게 나눠 봐야 사람 귀에는 안 들린다', () => {
  const 나온것 = new Set();
  for (let v = -1; v <= 1; v += 0.1) {
    for (let a = -1; a <= 1; a += 0.1) {
      const t = toneOf({ valence: v, arousal: a });
      if (t !== null) 나온것.add(t);
    }
  }
  assert.deepEqual([...나온것].sort(), ['누그러짐', '뾰족', '들뜸', '처짐'].sort());
});

// ── 목소리 이름에 붙이기 ────────────────────────────────────────────

test('결을 목소리 이름에 붙인다', () => {
  assert.equal(withTone('ko-KR-SunHiNeural', '들뜸'), 'ko-KR-SunHiNeural@들뜸');
});

test('결이 없으면 이름 그대로다', () => {
  assert.equal(withTone('ko-KR-SunHiNeural', null), 'ko-KR-SunHiNeural');
});

test('이미 결이 붙어 있으면 덧붙이지 않는다 — 사람이 고른 결이 먼저다', () => {
  assert.equal(withTone('목소리@속삭임', '들뜸'), '목소리@속삭임');
});

test('고른 목소리가 없으면 아무것도 안 한다', () => {
  assert.equal(withTone(undefined, '들뜸'), undefined);
  assert.equal(withTone('', '들뜸'), '');
});

test('붙인 결은 다시 가를 수 있다', () => {
  assert.deepEqual(splitTone('ko-KR-SunHiNeural@처짐'), { name: 'ko-KR-SunHiNeural', tone: '처짐' });
  assert.deepEqual(splitTone('ko-KR-SunHiNeural'), { name: 'ko-KR-SunHiNeural', tone: null });
});

// ── 얼마나 흔들리나 ─────────────────────────────────────────────────

test('네 결 모두 흔들 값을 갖는다 — 값이 없는 결이 있으면 그 결은 무음이 된다', () => {
  for (const tone of ['들뜸', '뾰족', '처짐', '누그러짐']) {
    assert.notEqual(기분결[tone], undefined, `${tone} 의 높낮이가 없다`);
    assert.notEqual(기분빠르기[tone], undefined, `${tone} 의 늘어짐이 없다`);
  }
});

test('들뜨면 빨라지고 처지면 느려진다', () => {
  assert.ok(기분빠르기['들뜸'] < 1, '1 보다 작아야 빨라진다');
  assert.ok(기분빠르기['처짐'] > 1, '1 보다 커야 느려진다');
  assert.match(기분결['들뜸'].rate, /^\+/);
  assert.match(기분결['처짐'].rate, /^-/);
});

test('폭이 좁다 — 크게 흔들면 사람 목소리가 아니라 만화 효과음이 된다', () => {
  for (const tone of ['들뜸', '뾰족', '처짐', '누그러짐']) {
    const 퍼센트 = Number(기분결[tone].rate.replace('%', ''));
    assert.ok(Math.abs(퍼센트) <= 20, `${tone} 이 너무 세다 (${퍼센트}%)`);
    assert.ok(Math.abs(기분빠르기[tone] - 1) <= 0.25, `${tone} 늘어짐이 너무 세다`);
  }
});

// ── 마음과 이어 보기 ────────────────────────────────────────────────

test('실제 마음이 결로 이어진다', () => {
  let 지금 = 0;
  const heart = new Heart({ halfLifeMs: 10_000, now: () => 지금 });
  assert.equal(toneOf(heart.state), null, '평소엔 결이 없다');

  heart.felt('놀이이김');
  assert.equal(toneOf(heart.state), '들뜸');

  지금 += 300_000;
  assert.equal(toneOf(heart.state), null, '한참 지나면 결도 풀린다');
});

test('계속 찔리면 뾰족한 결이 된다 — 신난 것으로 잘못 읽으면 안 된다', () => {
  const heart = new Heart({ halfLifeMs: 600_000, now: () => 0 });
  for (let i = 0; i < 6; i += 1) heart.felt('자꾸찔림');
  assert.equal(toneOf(heart.state), '뾰족');
});
