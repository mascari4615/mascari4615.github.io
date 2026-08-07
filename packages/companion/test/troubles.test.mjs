import assert from 'node:assert/strict';
import test from 'node:test';

import { Troubles, troublesReport } from '../dist/index.js';

// ── 모으기 ──────────────────────────────────────────────────────────

test('종류별로 센다', () => {
  const t = new Troubles();
  t.hit('걸림', '말투가 샜다');
  t.hit('걸림', '또 샜다');
  t.hit('못함', '시계를 못 썼다');
  assert.equal(t.count('걸림'), 2);
  assert.equal(t.count('못함'), 1);
  assert.equal(t.count('죽음'), 0);
});

test('실제로 있었던 자리를 남긴다 — 숫자만 있으면 뭘 고칠지 모른다', () => {
  const t = new Troubles();
  t.hit('걸림', '「무엇을 도와드릴까요」');
  assert.match(t.all[0].what, /도와드릴까요/);
});

test('너무 긴 것은 잘라 둔다', () => {
  const t = new Troubles();
  t.hit('걸림', '가'.repeat(500));
  assert.ok(t.all[0].what.length <= 120);
});

test('종류마다 몇 개씩만 남긴다 — 한 종류가 쏟아지면 다른 종류가 밀려난다', () => {
  const t = new Troubles({ keepEach: 2 });
  for (let i = 0; i < 10; i += 1) t.hit('걸림', `걸린 것 ${i}`);
  t.hit('못함', '손 하나');
  assert.equal(t.all.filter((x) => x.kind === '걸림').length, 2);
  assert.equal(t.all.filter((x) => x.kind === '못함').length, 1, '쏟아진 종류에 밀리면 안 된다');
});

test('가장 최근 것을 남긴다', () => {
  const t = new Troubles({ keepEach: 1 });
  t.hit('걸림', '옛것');
  t.hit('걸림', '새것');
  assert.equal(t.all.filter((x) => x.kind === '걸림')[0].what, '새것');
});

// ── 사람이 읽는 표 ──────────────────────────────────────────────────

test('걸린 게 없으면 그렇다고 말한다', () => {
  assert.match(troublesReport(new Troubles()), /아직 걸린 게 없다/);
});

test('잦은 것을 위에 둔다 — 한 번 있었던 일보다 자꾸 나는 일이 고칠 거리다', () => {
  const t = new Troubles();
  t.hit('못함', '한 번');
  for (let i = 0; i < 5; i += 1) t.hit('걸림', `자주 ${i}`);
  const 머리 = troublesReport(t).split('\n')[0];
  assert.ok(머리.indexOf('걸림') < 머리.indexOf('못함'));
});

test('실제 자리도 같이 보여 준다', () => {
  const t = new Troubles();
  t.hit('걸림', '「무엇을 도와드릴까요」');
  const 표 = troublesReport(t);
  assert.match(표, /걸림 1번/);
  assert.match(표, /도와드릴까요/);
});

test('없는 종류는 표에 안 올린다', () => {
  const t = new Troubles();
  t.hit('걸림', '하나');
  assert.equal(troublesReport(t).includes('죽음'), false);
});

// ── 껐다 켜기 ───────────────────────────────────────────────────────

test('파일에 남겨 두면 껐다 켜도 이어진다 — 며칠 봐야 뭐가 자주 나는지 안다', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'troubles-'));
  const path = join(dir, '잘못.json');
  try {
    const 처음 = new Troubles({ path });
    처음.hit('걸림', '말투가 샜다');
    처음.hit('걸림', '또');
    const 다시 = new Troubles({ path });
    assert.equal(다시.count('걸림'), 2);
    assert.match(다시.all[0].what, /샜다/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('파일이 깨져 있어도 죽지 않는다', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'troubles-'));
  const path = join(dir, '잘못.json');
  try {
    writeFileSync(path, '깨진 것', 'utf8');
    assert.equal(new Troubles({ path }).count('걸림'), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
