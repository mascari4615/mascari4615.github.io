import assert from 'node:assert/strict';
import test from 'node:test';

import { Face, expressionFrom, expressionNote, isExpression, stripExpression, 평소 } from '../dist/index.js';

const 마음 = (valence, arousal) => ({ valence, arousal });

// ── 표 뽑아내기 ─────────────────────────────────────────────────────

test('말 앞에 붙은 표를 뽑아낸다', () => {
  assert.deepEqual(stripExpression('[놀람] 어, 왔네.'), { text: '어, 왔네.', tagged: '놀람' });
});

test('표는 반드시 말에서 지운다 — 안 지우면 소리 내어 읽는다', () => {
  const { text } = stripExpression('[뾰족] 그만 좀.');
  assert.equal(text.includes('['), false);
  assert.equal(text.includes('뾰족'), false);
});

test('표가 없으면 말 그대로다', () => {
  assert.deepEqual(stripExpression('그냥 하는 말'), { text: '그냥 하는 말', tagged: null });
});

test('모르는 표는 말의 일부다 — 함부로 지우면 대사가 사라진다', () => {
  assert.deepEqual(stripExpression('[중요] 이건 놔둬'), { text: '[중요] 이건 놔둬', tagged: null });
});

test('표가 둘이면 앞의 것만 쓴다 — 얼굴은 하나다', () => {
  assert.equal(stripExpression('[웃음] 아 [처짐] 근데').tagged, '웃음');
});

test('표를 지우고 남은 빈틈을 정리한다', () => {
  assert.equal(stripExpression('[웃음]   진짜?').text, '진짜?');
});

test('아는 표정인지 가릴 수 있다', () => {
  assert.equal(isExpression('웃음'), true);
  assert.equal(isExpression('희열'), false);
});

// ── 얼굴 유도 ───────────────────────────────────────────────────────

test('두뇌가 단 표가 가장 세다 — 얘가 스스로 고른 것이니까', () => {
  assert.equal(expressionFrom({ feeling: 마음(-0.9, -0.9), tagged: '웃음' }), '웃음');
});

test('표가 없어도 돌아간다 — 표에만 기대면 두뇌를 갈아 끼울 때 얼굴이 죽는다', () => {
  assert.equal(expressionFrom({ feeling: 마음(0.6, 0.1) }), '웃음');
  assert.equal(expressionFrom({ feeling: 마음(-0.6, 0.1) }), '뾰족');
});

test('웃는 말이면 웃는 얼굴', () => {
  assert.equal(expressionFrom({ feeling: 평소, text: 'ㅋㅋ 진짜' }), '웃음');
});

test('놀란 말이면 놀란 얼굴', () => {
  assert.equal(expressionFrom({ feeling: 평소, text: '어? 그래?' }), '놀람');
});

test('언짢은데 깨어 있으면 뾰족한 얼굴 — 놀란 것과 다르다', () => {
  assert.equal(expressionFrom({ feeling: 마음(-0.5, 0.5) }), '뾰족');
  assert.equal(expressionFrom({ feeling: 마음(0.3, 0.5) }), '놀람');
});

test('푹 가라앉으면 졸린 얼굴', () => {
  assert.equal(expressionFrom({ feeling: 마음(0, -0.7) }), '졸림');
});

test('평온이 기본이다 — 늘 뭔가 짓고 있으면 표정이 아니라 경련이다', () => {
  assert.equal(expressionFrom({ feeling: 평소 }), '평온');
  assert.equal(expressionFrom({ feeling: 평소, text: '그냥 하는 말' }), '평온');
});

test('아는 표정만 나온다', () => {
  for (let v = -1; v <= 1; v += 0.2) {
    for (let a = -1; a <= 1; a += 0.2) {
      assert.equal(isExpression(expressionFrom({ feeling: 마음(v, a) })), true, `${v},${a} 에서 모르는 표정이 나왔다`);
    }
  }
});

// ── 바뀔 때만 흘리기 ────────────────────────────────────────────────

test('바뀐 것만 흘린다 — 조각마다 쏘면 받는 쪽이 깜빡인다', () => {
  const face = new Face();
  assert.equal(face.changeTo('웃음'), '웃음');
  assert.equal(face.changeTo('웃음'), null);
  assert.equal(face.changeTo('뾰족'), '뾰족');
});

test('처음은 평온이다', () => {
  assert.equal(new Face().current, '평온');
  assert.equal(new Face().changeTo('평온'), null, '평온에서 평온으로는 안 흘린다');
});

test('말이 끝나면 평온으로 돌아간다 — 표정이 남아 굳지 않게', () => {
  const face = new Face();
  face.changeTo('뾰족');
  assert.equal(face.rest(), '평온');
  assert.equal(face.current, '평온');
  assert.equal(face.rest(), null, '이미 평온이면 또 안 흘린다');
});

// ── 두뇌에 알리기 ───────────────────────────────────────────────────

test('쓸 수 있는 표를 알려 준다', () => {
  const note = expressionNote();
  for (const e of ['평온', '웃음', '놀람', '뾰족', '처짐', '졸림']) {
    assert.match(note, new RegExp(`\\[${e}\\]`), `${e} 가 안내에 없다`);
  }
});

test('꼭 달라고 시키지 않는다 — 안 달아도 돌아가야 한다', () => {
  assert.match(expressionNote(), /꼭 달 필요는 없다/);
});

test('안내에 적힌 표는 실제로 뽑히는 표와 같다 — 어긋나면 얼굴이 영영 안 바뀐다', () => {
  const 안내 = expressionNote();
  for (const m of 안내.matchAll(/\[([^\]]+)\]/g)) {
    assert.equal(stripExpression(`[${m[1]}] 말`).tagged, m[1], `안내의 [${m[1]}] 이 안 뽑힌다`);
  }
});
