import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { KnownStamps, 갓알게된것, 얼마나오래 } from '../dist/index.js';

const 하루 = 24 * 60 * 60_000;

test('새 줄은 그때부터, 있던 줄은 처음 본 날을 지킨다', () => {
  let 지금 = 1_000_000;
  const s = new KnownStamps({ now: () => 지금 });
  s.sync('- 커피를 좋아함');
  const 처음 = s.stampOf('커피를 좋아함').처음;
  지금 += 하루 * 5;
  s.sync('- 커피를 좋아함\n- 매운 걸 못 먹음');
  assert.equal(s.stampOf('커피를 좋아함').처음, 처음, '있던 줄의 처음은 안 바뀐다');
  assert.equal(s.stampOf('매운 걸 못 먹음').처음, 지금);
});

test('앞머리 기호나 공백이 달라도 같은 줄로 본다', () => {
  const s = new KnownStamps({ now: () => 5 });
  s.sync('- 커피를  좋아함');
  assert.notEqual(s.stampOf('• 커피를 좋아함'), null);
});

test('사라졌다 돌아와도 처음 본 날을 잃지 않는다 — 몇 주 알던 게 오늘 것이 되면 안 된다', () => {
  let 지금 = 1_000;
  const s = new KnownStamps({ now: () => 지금 });
  s.sync('- 커피를 좋아함');
  const 처음 = s.stampOf('커피를 좋아함').처음;
  지금 += 하루 * 10;
  s.sync('- 매운 걸 못 먹음'); // 졸이는 쪽이 한 번 빠뜨렸다
  지금 += 하루;
  s.sync('- 커피를 좋아함');
  assert.equal(s.stampOf('커피를 좋아함').처음, 처음);
});

test('빈 아는 것에도 안 죽는다', () => {
  const s = new KnownStamps({ now: () => 1 });
  s.sync(null);
  s.sync('');
  assert.equal(s.size, 0);
});

// ── 얼마나 오래 ─────────────────────────────────────────────────────

test('얼마나 오래 알았는지 사람 말로', () => {
  const 지금 = 100 * 하루;
  assert.match(얼마나오래({ 처음: 지금 - 하루 * 30, 마지막: 지금 }, 지금), /오래전부터/);
  assert.match(얼마나오래({ 처음: 지금 - 하루 * 5, 마지막: 지금 }, 지금), /며칠 전/);
  assert.match(얼마나오래({ 처음: 지금 - 하루 * 1.5, 마지막: 지금 }, 지금), /어제오늘/);
  assert.match(얼마나오래({ 처음: 지금 - 1000, 마지막: 지금 }, 지금), /방금/);
});

// ── 두뇌에 얹는 한 줄 ────────────────────────────────────────────────

test('오늘 처음 안 것만 짚는다 — 예전부터 알던 척을 막는 게 목적이다', () => {
  let 지금 = 10 * 하루;
  const s = new KnownStamps({ now: () => 지금 });
  s.sync('- 커피를 좋아함');
  지금 += 하루 * 9;
  s.sync('- 커피를 좋아함\n- 오늘 이사했음');
  const note = 갓알게된것('- 커피를 좋아함\n- 오늘 이사했음', s, 지금);
  assert.match(note, /오늘 이사했음/);
  assert.equal(note.includes('커피'), false, '오래된 것은 안 얹는다');
  assert.match(note, /예전부터 알던 것처럼 말하지 마라/);
});

test('오늘 안 게 없으면 아무 말도 안 얹는다 — 늘 붙으면 재료만 먹는다', () => {
  let 지금 = 10 * 하루;
  const s = new KnownStamps({ now: () => 지금 });
  s.sync('- 커피를 좋아함');
  지금 += 하루 * 3;
  assert.equal(갓알게된것('- 커피를 좋아함', s, 지금), '');
});

test('너무 많이 늘어놓지 않는다', () => {
  const 지금 = 5 * 하루;
  const s = new KnownStamps({ now: () => 지금 });
  const 여러줄 = Array.from({ length: 8 }, (_, i) => `- ${i}번 알게 됨`).join('\n');
  s.sync(여러줄);
  assert.equal((갓알게된것(여러줄, s, 지금).match(/번 알게 됨/g) ?? []).length, 3);
});

test('모르는 줄은 안 짚는다 — 아직 세어 본 적 없는 것을 오늘 것으로 치면 안 된다', () => {
  const s = new KnownStamps({ now: () => 5 * 하루 });
  assert.equal(갓알게된것('- 처음 보는 줄', s, 5 * 하루), '');
});

// ── 껐다 켜기 ───────────────────────────────────────────────────────

test('파일에 남겨 두면 껐다 켜도 이어진다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamps-'));
  const path = join(dir, '언제.json');
  try {
    new KnownStamps({ path, now: () => 777 }).sync('- 커피를 좋아함');
    const 다시 = new KnownStamps({ path, now: () => 999 });
    assert.equal(다시.stampOf('커피를 좋아함').처음, 777);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('파일이 깨져 있어도 기억이 멈추지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stamps-'));
  const path = join(dir, '언제.json');
  try {
    writeFileSync(path, '깨진 것', 'utf8');
    const s = new KnownStamps({ path, now: () => 1 });
    assert.equal(s.size, 0);
    s.sync('- 커피를 좋아함');
    assert.equal(s.size, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('지우면 같이 지워진다', () => {
  const s = new KnownStamps({ now: () => 1 });
  s.sync('- 커피를 좋아함');
  assert.equal(s.forget('커피를 좋아함'), true);
  assert.equal(s.size, 0);
  assert.equal(s.forget('없던 줄'), false);
});
