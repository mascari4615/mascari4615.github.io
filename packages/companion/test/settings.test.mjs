import assert from 'node:assert/strict';
import test from 'node:test';

import { Quiet, Settings, settingsReport, 설정할것 } from '../dist/index.js';

// ── 기본값 ──────────────────────────────────────────────────────────

test('아무것도 없으면 기본값으로 시작한다', () => {
  const s = new Settings();
  for (const [k, spec] of Object.entries(설정할것)) assert.equal(s.get(k), spec.value, k);
});

test('초를 밀리초로 바꿔 준다 — 그게 필요한 자리가 많다', () => {
  assert.equal(new Settings().ms('먼저말걸기간격초'), 300_000);
});

test('참/거짓을 물어볼 수 있다', () => {
  assert.equal(new Settings().on('먼저말걸기'), true);
});

// ── 바꾸기 ──────────────────────────────────────────────────────────

test('아는 항목은 바뀐다', () => {
  const s = new Settings();
  assert.deepEqual(s.put({ 먼저말걸기: false }), []);
  assert.equal(s.on('먼저말걸기'), false);
});

test('모르는 항목은 안 받고 왜인지 말한다 — 조용히 무시하면 왜 안 바뀌는지 모른다', () => {
  const s = new Settings();
  const 안된것 = s.put({ 아무거나: 1 });
  assert.equal(안된것.length, 1);
  assert.match(안된것[0], /모르는 항목/);
});

test('꼴이 다르면 안 받는다', () => {
  const s = new Settings();
  assert.match(s.put({ 먼저말걸기: 3 })[0], /참\/거짓/);
  assert.match(s.put({ 화면보기간격초: '아무말' })[0], /숫자/);
});

test('범위 밖은 묶고 그렇다고 말한다 — 화면 보기를 0.1초로 두면 컴퓨터가 앓는다', () => {
  const s = new Settings();
  const 안된것 = s.put({ 먼저말걸기간격초: 1 });
  assert.equal(s.get('먼저말걸기간격초'), 60);
  assert.match(안된것[0], /60~3600/);
});

test('끄는 길은 늘 남아 있다', () => {
  const s = new Settings();
  s.put({ 화면보기간격초: 0, 먼저말걸기: false, 놀리기: false });
  assert.equal(s.get('화면보기간격초'), 0);
  assert.equal(s.on('먼저말걸기'), false);
  assert.equal(s.on('놀리기'), false);
});

test('설정 꼴이 아니면 통째로 거절한다', () => {
  assert.match(new Settings().put('아무말')[0], /설정 꼴이 아니다/);
});

// ── 파일 ────────────────────────────────────────────────────────────

test('파일이 정본이다 — 창을 새로 열어도 그대로다', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'settings-'));
  const path = join(dir, '설정.json');
  try {
    new Settings({ path }).put({ 먼저말걸기: false, 화면보기간격초: 600 });
    const 다시 = new Settings({ path });
    assert.equal(다시.on('먼저말걸기'), false);
    assert.equal(다시.get('화면보기간격초'), 600);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('파일이 깨져 있어도 기본값으로 돈다', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'settings-'));
  const path = join(dir, '설정.json');
  const 남긴것 = [];
  try {
    writeFileSync(path, '깨진 것', 'utf8');
    const s = new Settings({ path, log: (m) => 남긴것.push(m) });
    assert.equal(s.on('먼저말걸기'), true);
    assert.equal(남긴것.some((m) => m.includes('못 읽었다')), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── 사람이 읽는 표 ──────────────────────────────────────────────────

test('무엇을 바꿀 수 있는지 그대로 보여 준다', () => {
  const 표 = settingsReport(new Settings());
  for (const k of Object.keys(설정할것)) assert.match(표, new RegExp(k));
  assert.match(표, /60~3600/, '범위도 보여 준다');
});

// ── 실제로 먹나 ─────────────────────────────────────────────────────

test('조용한 시간대를 바꾸면 재시작 없이 먹는다 — 고정 숫자로 받으면 켤 때 값이 박힌다', () => {
  const s = new Settings();
  let 지금 = new Date(2026, 1, 10, 14, 0).getTime();
  const quiet = new Quiet({
    now: () => 지금,
    fromHour: () => Number(s.get('조용한시간시작')),
    toHour: () => Number(s.get('조용한시간끝')),
  });
  assert.equal(quiet.inQuietHours, false, '낮 두 시는 조용한 시간이 아니다');

  s.put({ 조용한시간시작: 13, 조용한시간끝: 18 });
  assert.equal(quiet.inQuietHours, true, '바꾸자마자 먹어야 한다');
});

test('고정 숫자로 줘도 여전히 된다 — 예전 쓰임이 안 깨진다', () => {
  const quiet = new Quiet({ now: () => new Date(2026, 1, 10, 2, 0).getTime(), fromHour: 23, toHour: 7 });
  assert.equal(quiet.inQuietHours, true);
});
