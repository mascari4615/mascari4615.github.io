// 아는 것에 앎이 아닌 것이 굳지 않게 (TASK-KAR-236).
//
// 103회차에 두뇌 시스템 자리를 찍어 보니 이 사람에 대해 아는 것이 통째로 이랬다:
//
//   아직 아는 것이 없습니다.
//   이 대화는 창작물이나 상황극으로 보여서 조수님에 대한 사실적인 정보를 추출하기 어렵습니다.
//
// 둘 다 **조수님에 대한 앎이 아니다.** 하나는 빈 상태 선언이고, 하나는 졸이는 두뇌가
// 우리에게 하는 말이다. 그게 매 turn 시스템 자리에 실려 나가고 있었다.
//
// 졸이는 프롬프트에는 이미 '아는 것이 없습니다' 같은 말은 붙이지 마라고 적혀 있다.
// **말로 시킨 것은 안 지켜진다**(42회차와 같은 모양). 그래서 구조로 막는다.

import assert from 'node:assert/strict';
import test from 'node:test';

import { onlyKnowledge } from '../dist/index.js';

test('실제로 굳어 있던 두 줄을 걷어낸다 (103회차 실측)', () => {
  const dirty = [
    '아직 아는 것이 없습니다.',
    '',
    '이 대화는 창작물이나 상황극으로 보여서 조수님에 대한 사실적인 정보를 추출하기 어렵습니다.',
  ].join('\n');
  assert.equal(onlyKnowledge(dirty), '');
});

test('진짜 앎은 그대로 둔다. 지나치게 걸러 내면 기억이 사라진다', () => {
  const clean = [
    '- 커피를 진짜 좋아한다.',
    '- 마라탕 같은 자극적인 건 못 먹는다.',
    '- 유니티로 게임을 만든다. 저장소가 셋이다.',
  ].join('\n');
  assert.equal(onlyKnowledge(clean), clean);
});

test('섞여 있으면 앎만 남긴다', () => {
  const mixed = [
    '- 커피를 진짜 좋아한다.',
    '죄송하지만 더 알아낼 수 있는 정보가 없습니다.',
    '- 밤에 주로 작업한다.',
  ].join('\n');
  assert.equal(onlyKnowledge(mixed), '- 커피를 진짜 좋아한다.\n- 밤에 주로 작업한다.');
});

test('무대 뒤 말도 같은 자리에서 걸린다. 지킴이를 두 벌 만들지 않는다', () => {
  const mixed = ['- 커피를 좋아한다.', '이전 대화 내용에서는 확인되지 않는다.'].join('\n');
  assert.equal(onlyKnowledge(mixed), '- 커피를 좋아한다.');
});

test('이미 굳은 파일도 읽을 때 걸러진다. 고친 뒤에도 옛 오염이 실려 나가면 안 된다', async () => {
  const { DistillingMemory, InMemoryMemory } = await import('../dist/index.js');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const folder = mkdtempSync(join(tmpdir(), 'companion-known-'));
  const notePath = join(folder, '아는-것.md');
  try {
    writeFileSync(notePath, '아직 아는 것이 없습니다.\n\n이 대화는 창작물이나 상황극으로 보여서 조수님에 대한 사실적인 정보를 추출하기 어렵습니다.\n', 'utf8');
    const memory = new DistillingMemory({
      inner: new InMemoryMemory(),
      distill: async ({ known }) => known,
      notePath,
    });
    const carried = await memory.longTerm();
    assert.ok(carried === null || carried === '', `오염된 옛 파일이 그대로 실렸다: ${carried}`);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
