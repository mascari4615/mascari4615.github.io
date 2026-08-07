import assert from 'node:assert/strict';
import test from 'node:test';

import { EpisodeStore, episodeNote } from '../dist/index.js';

const 날 = 24 * 60 * 60_000;
const 지금 = new Date(2026, 7, 8, 14, 0).getTime();

/**
 * 사건을 곧바로 심는다 — 기운 **재는** 자리 말고 **고르는** 자리만 본다.
 *
 * learn 을 거치면 기운이 말에서 저절로 정해져서, 「기운만 다르고 나머지는 같은 둘」을
 * 만들 수가 없다. 그러면 이 시험이 재려는 것을 못 잰다.
 */
const 심기 = (...것들) => {
  const s = new EpisodeStore();
  const 안 = s.all; // 안쪽 목록을 그대로 돌려준다
  for (const e of [...것들].sort((a, b) => a.at - b.at)) 안.push(e);
  assert.equal(s.all.length, 것들.length, '심은 게 안 들어갔으면 이 시험은 아무것도 안 잰다');
  return s;
};

test('겹침이 같으면 큰일이 이긴다 — 여태는 목록에서 먼저 만난 것(=가장 오래된 것)이 이겼다', () => {
  const s = 심기(
    { said: '셰이더 파일 이름 바꿨어', at: 지금 - 10 * 날, 기운: 3 },
    { said: '셰이더 진짜 망했어 너무 속상해', at: 지금 - 9 * 날, 기운: 8 },
  );
  assert.match(s.related('셰이더 어떻게 됐어', 1, 지금).said, /망했어/);
});

test('큰일이라고 안 겹치는 게 튀어나오진 않는다 — 그러면 아무 말에나 옛날 얘기가 붙는다', () => {
  const s = 심기({ said: '발표 완전 망했어 진짜 속상하다', at: 지금 - 2 * 날, 기운: 9 });
  assert.equal(s.related('오늘 점심 뭐 먹지', 2, 지금), null);
});

test('오래된 큰일이 어제의 사소한 일을 이긴다 — 사람 기억이 그렇다', () => {
  const s = 심기(
    { said: '발표 자료 좀 고쳤어', at: 지금 - 1 * 날, 기운: 3 },
    { said: '발표 완전 망했어 진짜 속상하다', at: 지금 - 40 * 날, 기운: 9 },
  );
  assert.match(s.related('발표 얘기 나왔는데', 1, 지금).said, /망했어/);
});

test('큰일도 겹침도 같으면 최근 쪽 — 비기는 자리를 가른다', () => {
  const s = 심기(
    { said: '빌드 또 깨졌어 진짜 짜증나', at: 지금 - 20 * 날, 기운: 6 },
    { said: '빌드 또 깨졌다 진짜 짜증나', at: 지금 - 1 * 날, 기운: 6 },
  );
  assert.equal(s.related('빌드 고쳤어?', 1, 지금).at, 지금 - 1 * 날);
});

test('겹친 수만 세면 긴 말이 무조건 이긴다 — 지금 말 길이로 견준다', () => {
  const 긴말 = '어제 회의 자료 준비 하다가 밥 먹고 산책 하고 커피 마시고 왔어 진짜';
  const s = 심기(
    { said: 긴말, at: 지금 - 5 * 날, 기운: 4 },
    { said: '셰이더 때문에 완전 미치겠어 진짜', at: 지금 - 5 * 날, 기운: 8 },
  );
  assert.match(s.related('셰이더 진짜 어렵네', 1, 지금).said, /셰이더/);
});

test('이어지는 게 없으면 아무 말도 안 얹는다 — 늘 붙이면 기억하는 척이다', () => {
  const s = 심기({ said: '발표 완전 망했어 진짜 속상하다', at: 지금 - 2 * 날, 기운: 9 });
  assert.equal(episodeNote(s, '오늘 날씨 좋네', 지금), '');
  assert.match(episodeNote(s, '발표 얘기 말인데 진짜', 지금), /망했어/);
});

test('얼마나 지난 일인지는 물어본 그 시각으로 센다 — 안 넘기면 늘 「아까」가 된다', () => {
  const s = 심기({ said: '발표 완전 망했어 진짜 속상하다', at: 지금 - 10 * 날, 기운: 9 });
  assert.match(episodeNote(s, '발표 진짜 어떻게 됐더라', 지금), /지난주쯤|한참 전에/);
});
