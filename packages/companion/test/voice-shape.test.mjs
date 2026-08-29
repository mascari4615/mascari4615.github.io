// **목소리의 결**. 문턱 판정에만 쓰고 버리던 값 (TASK-KAR-244).
//
// 우리는 소리를 글자로 바꾼 뒤에만 본다. 같은 괜찮아도 지친 목소리인지 밝은 목소리인지
// 모른다. 밖에서는 그걸 동반자의 핵심으로 꼽는다(원장 2026-08-21: EVI 는 감정 단서를 듣고
// 그 결에 맞춰 답한다).
//
// 감정 모델을 새로 까는 건 사용자 영역이다. 그런데 **창은 이미 소리 크기를 재고 있고**
// 서버는 말소리가 얼마나 있었나를 받는다. **문턱 판정에만 쓰고 버린다.**
// 여기서는 그 두 값만으로 짧고 조용하게 말했다 정도를 말한다.
//
// **관측한 것만 적는다.** 기뻐 보인다 같은 해석은 안 한다(53회차: 안 보고 아는 척하지
// 않기). 그리고 **절대값이 아니라 그 사람의 평소 대비**로 본다. dB 는 기계마다 다르다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { voiceShape } from '../dist/index.js';

test('평소보다 짧고 조용하면 그렇게 말한다', () => {
  const line = voiceShape({ spokenMs: 400, loudness: 0.05 }, { spokenMs: 2000, loudness: 0.2 });
  assert.ok(line);
  assert.match(line, /짧/);
  assert.match(line, /조용|작/);
});

test('평소보다 길고 크면 그렇게 말한다', () => {
  const line = voiceShape({ spokenMs: 6000, loudness: 0.45 }, { spokenMs: 2000, loudness: 0.2 });
  assert.ok(line);
  assert.match(line, /길/);
  assert.match(line, /크/);
});

test('평소와 비슷하면 아무 말도 안 한다. 없는 결을 지어내지 않는다', () => {
  assert.equal(voiceShape({ spokenMs: 2100, loudness: 0.21 }, { spokenMs: 2000, loudness: 0.2 }), '');
});

test('평소값이 아직 없으면 안 잰다. 첫 판은 견줄 것이 없다', () => {
  assert.equal(voiceShape({ spokenMs: 400, loudness: 0.05 }, null), '');
});

test('마이크를 안 쓴 판이면 아무 말도 안 한다. 글로 친 말에는 결이 없다', () => {
  assert.equal(voiceShape(null, { spokenMs: 2000, loudness: 0.2 }), '');
  assert.equal(voiceShape({ spokenMs: null, loudness: null }, { spokenMs: 2000, loudness: 0.2 }), '');
});

test('해석하지 않는다. 기분을 말하지 않는다', () => {
  const line = voiceShape({ spokenMs: 400, loudness: 0.05 }, { spokenMs: 2000, loudness: 0.2 });
  /* 낱말 기분 자체는 괜찮다. 우리 문구가 무슨 기분인지는 모른다라고 못 박는다.
     막아야 하는 건 **단정**이다. */
  assert.doesNotMatch(line, /슬프|기뻐|화난|지쳐|우울|신나/);
  assert.match(line, /모른다/, '해석이 아니라는 걸 두뇌한테 말해 줘야 한다');
});
