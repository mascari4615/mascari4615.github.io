// 사람이 지운 앎이 **다시 살아나나** (TASK-KAR-236).
//
// 「아는 것」에서 한 줄만 지우는 길은 이미 있다(`forgetKnown`). 그런데 지운 뒤에도 그 얘기가
// 대화 기록에는 남아 있고, 다음 번 졸일 때 두뇌는 그 대화를 다시 읽는다. 그러면 방금 지운
// 줄을 **그대로 다시 적을 수 있다.**
//
// 사람이 지운 것이 되살아나면 그건 지운 게 아니다 — 「몇 번을 지워도 또 그 소리를 한다」가
// 되고, 그건 기억이 아니라 고집이다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { DistillingMemory, InMemoryMemory } from '../dist/index.js';

function memoryThatAlwaysSays(line) {
  return new DistillingMemory({
    inner: new InMemoryMemory(),
    // 두뇌가 대화를 보고 늘 같은 줄을 적는다 — 지운 줄이 대화에 남아 있는 상황.
    distill: async ({ known }) => (known.includes(line) ? known : `${known}\n${line}`.trim()),
    every: 1,
    batch: 1,
  });
}

test('사람이 지운 줄은 다음에 졸일 때 다시 안 담긴다', async () => {
  const line = '- 조수님은 매운 걸 좋아한다.';
  const memory = memoryThatAlwaysSays(line);

  await memory.remember({ role: 'sensed', channel: 'web', text: '매운 거 얘기', at: Date.now() });
  await memory.condense();
  assert.match((await memory.longTerm()) ?? '', /매운 걸 좋아한다/, '먼저 담겨야 이 검사가 뜻이 있다');

  assert.equal(memory.forgetKnown(line), true);
  assert.doesNotMatch((await memory.longTerm()) ?? '', /매운 걸 좋아한다/);

  await memory.remember({ role: 'sensed', channel: 'web', text: '매운 거 얘기 또', at: Date.now() });
  await memory.condense();
  assert.doesNotMatch(
    (await memory.longTerm()) ?? '',
    /매운 걸 좋아한다/,
    '지운 것이 되살아나면 그건 지운 게 아니다',
  );
});

test('지운 적 없는 새 앎은 그대로 담긴다 — 지나치게 막으면 아무것도 안 쌓인다', async () => {
  const memory = memoryThatAlwaysSays('- 조수님은 커피를 좋아한다.');
  await memory.remember({ role: 'sensed', channel: 'web', text: '커피 얘기', at: Date.now() });
  await memory.condense();
  assert.match((await memory.longTerm()) ?? '', /커피를 좋아한다/);
});
