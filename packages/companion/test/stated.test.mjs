import assert from 'node:assert/strict';
import test from 'node:test';

import { StatedStore, findConflicts, statedFacts, statedNote } from '../dist/index.js';

const 사람 = (text, at = 1, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 얘 = (text, at = 2) => ({ role: 'said', channel: 'web', text, at });

// ── 뽑기 ────────────────────────────────────────────────────────────

test('자기에 대해 대놓고 말한 것을 뽑는다', () => {
  const 뽑힌것 = statedFacts([사람('나 커피 진짜 좋아해')]);
  assert.equal(뽑힌것.length, 1);
  assert.match(뽑힌것[0].said, /커피/);
});

test('묻는 말은 사실이 아니다 — 안 빼면 물어본 것이 그대로 사실이 된다', () => {
  for (const t of ['내가 커피 좋아해 싫어해?', '나 그거 좋아하나?', '내가 자주 그러나요?']) {
    assert.deepEqual(statedFacts([사람(t)]), [], `${t}`);
  }
});

test('그때뿐인 말은 사실이 아니다 — 「오늘 피곤해」가 영구 사실로 굳으면 안 된다', () => {
  for (const t of ['오늘 나 진짜 힘들어해', '지금 나 커피 마셔']) {
    assert.deepEqual(statedFacts([사람(t)]), [], `${t}`);
  }
});

test('자기 얘기가 아니면 안 센다', () => {
  assert.deepEqual(statedFacts([사람('박 대리는 커피 좋아해')]), []);
});

test('취향·상태가 아니면 안 센다', () => {
  assert.deepEqual(statedFacts([사람('나 어제 거기 갔어')]), []);
});

test('얘가 한 말은 안 센다', () => {
  assert.deepEqual(statedFacts([얘('나 커피 좋아해')]), []);
});

test('화면 곁눈질도 안 센다', () => {
  assert.deepEqual(statedFacts([사람('나 커피 좋아해', 1, 'screen')]), []);
});

test('너무 짧거나 너무 긴 말은 안 센다', () => {
  assert.deepEqual(statedFacts([사람('나 좋아')]), []);
  assert.deepEqual(statedFacts([사람(`나 커피 좋아해 ${'가'.repeat(100)}`)]), []);
});

// ── 쌓기 ────────────────────────────────────────────────────────────

test('쌓인다', () => {
  const s = new StatedStore();
  s.learn([사람('나 커피 진짜 좋아해')]);
  s.learn([사람('나 매운 거 못 먹어')]);
  assert.equal(s.all.length, 2);
});

test('같은 말은 두 번 안 쌓는다', () => {
  const s = new StatedStore();
  s.learn([사람('나 커피 진짜 좋아해')]);
  s.learn([사람('나 커피 진짜 좋아해')]);
  assert.equal(s.all.length, 1);
});

test('덮어쓰지 않는다 — 바뀐 것과 처음 것이 둘 다 보여야 어긋남을 안다', () => {
  const s = new StatedStore();
  s.learn([사람('나 커피 진짜 좋아해', 1)]);
  s.learn([사람('나 이제 커피 싫어해', 2)]);
  assert.equal(s.all.length, 2);
});

test('너무 많이 들고 있지 않는다', () => {
  const s = new StatedStore({ keep: 3 });
  for (let i = 0; i < 8; i += 1) s.learn([사람(`나 ${i}번 좋아해`, i)]);
  assert.equal(s.all.length, 3);
});

test('잘못 쌓인 건 지운다', () => {
  const s = new StatedStore();
  s.learn([사람('나 커피 진짜 좋아해')]);
  assert.equal(s.forget('커피'), true);
  assert.equal(s.all.length, 0);
  assert.equal(s.forget('없는말'), false);
});

// ── 어긋남 ──────────────────────────────────────────────────────────

test('직접 들은 것과 아는 것이 어긋나면 잡는다', () => {
  const 어긋남 = findConflicts([{ said: '나 커피 진짜 좋아해', at: 1 }], '- 커피를 싫어함\n- 한국어를 씀');
  assert.equal(어긋남.length, 1);
  assert.match(어긋남[0], /커피/);
});

test('어긋나지 않으면 조용하다', () => {
  assert.deepEqual(findConflicts([{ said: '나 커피 진짜 좋아해', at: 1 }], '- 커피를 좋아함'), []);
});

test('아는 게 없으면 어긋날 것도 없다', () => {
  assert.deepEqual(findConflicts([{ said: '나 커피 좋아해', at: 1 }], null), []);
  assert.deepEqual(findConflicts([{ said: '나 커피 좋아해', at: 1 }], ''), []);
});

test('좋다/싫다가 안 드러난 말은 못 가린다 — 아는 척하지 않는다', () => {
  assert.deepEqual(findConflicts([{ said: '나 매일 커피 마셔', at: 1 }], '- 커피를 싫어함'), []);
});

// ── 두뇌에 넘길 한 줄 ────────────────────────────────────────────────

test('없으면 아무 말도 안 얹는다', () => {
  assert.equal(statedNote([]), '');
});

test('직접 들은 쪽이 무겁다고 못 박는다', () => {
  const note = statedNote([{ said: '나 커피 진짜 좋아해', at: 1 }]);
  assert.match(note, /커피/);
  assert.match(note, /짐작한 것보다 무겁다/);
});

test('어긋나는 게 있으면 조용히 넘기지 않는다', () => {
  const facts = [{ said: '나 커피 진짜 좋아해', at: 1 }];
  const note = statedNote(facts, findConflicts(facts, '- 커피를 싫어함'));
  assert.match(note, /어긋나는 게 있다/);
  assert.match(note, /직접 들은 쪽을 따라라/);
});

test('너무 많이 늘어놓지 않는다', () => {
  const 많이 = Array.from({ length: 10 }, (_, i) => ({ said: `나 ${i}번 좋아해`, at: i }));
  assert.equal((statedNote(많이, [], 2).match(/번 좋아해/g) ?? []).length, 2);
});

test('가장 최근 것을 보여 준다 — 사람은 바뀐다', () => {
  const facts = [{ said: '나 옛날 것 좋아해', at: 1 }, { said: '나 요즘 것 좋아해', at: 2 }];
  assert.match(statedNote(facts, [], 1), /요즘 것/);
});

// ── 껐다 켜기 ───────────────────────────────────────────────────────

test('파일에 남겨 두면 껐다 켜도 이어진다', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'stated-'));
  const path = join(dir, '들은것.json');
  try {
    new StatedStore({ path }).learn([사람('나 커피 진짜 좋아해')]);
    assert.equal(new StatedStore({ path }).all.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('파일이 깨져 있어도 죽지 않는다', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'stated-'));
  const path = join(dir, '들은것.json');
  try {
    writeFileSync(path, '깨진 것', 'utf8');
    assert.deepEqual(new StatedStore({ path }).all, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
