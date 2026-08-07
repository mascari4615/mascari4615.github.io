import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { EpisodeStore, episodeNote, 기운재기, 언제쯤 } from '../dist/index.js';

const 사람 = (text, at = 1, channel = 'web') => ({ role: 'sensed', channel, text, at });
const 얘 = (text, at = 1) => ({ role: 'said', channel: 'web', text, at });
const 하루 = 24 * 60 * 60_000;

test('감정이 실린 말은 기운이 있다', () => {
  assert.ok(기운재기('오늘 발표 진짜 망했어 속상해') > 0);
  assert.ok(기운재기('드디어 됐다!!') > 0);
});

test('지나가는 말은 사건이 아니다', () => {
  assert.equal(기운재기('응'), 0);
  assert.equal(기운재기('오늘 점심 뭐 먹지'), 0);
});

test('물음표만 잔뜩인 건 감정이 아니라 질문이다', () => {
  assert.equal(기운재기('이거 어떻게 하는 거야??'), 0);
});

test('사람이 한 말만 사건으로 센다 — 얘가 흥분한 걸 사람 일로 기억하면 안 된다', () => {
  const s = new EpisodeStore();
  s.learn([얘('진짜 너무 신난다 완전 좋아!')]);
  assert.equal(s.all.length, 0);
});

test('화면 곁눈질은 안 센다', () => {
  const s = new EpisodeStore();
  s.learn([사람('진짜 너무 속상해 완전 망했어', 1, 'screen')]);
  assert.equal(s.all.length, 0);
});

test('같은 말은 두 번 안 담는다', () => {
  const s = new EpisodeStore();
  s.learn([사람('오늘 발표 진짜 망했어 속상해')]);
  s.learn([사람('오늘 발표 진짜 망했어 속상해')]);
  assert.equal(s.all.length, 1);
});

test('자리가 모자라면 기운 약한 것부터 버린다 — 오래된 큰일이 먼저 사라지면 안 된다', () => {
  const s = new EpisodeStore({ keep: 2 });
  s.learn([사람('진짜 너무 속상하고 억울하고 화나서 미치겠어 완전 망했어', 1)]);
  s.learn([사람('오늘 좀 짜증났어 진짜', 2)]);
  s.learn([사람('완전 신나고 뿌듯하고 행복해 드디어 해냈어 진짜 너무 기뻐', 3)]);
  assert.equal(s.all.length, 2);
  assert.ok(s.all.some((e) => e.said.includes('억울')), '가장 큰 일은 남아야 한다');
});

test('말이 겹치면 그때 일을 찾아낸다', () => {
  const s = new EpisodeStore();
  s.learn([사람('오늘 발표 진짜 망했어 너무 속상해')]);
  assert.notEqual(s.related('그 발표 결과 나왔어 속상하다'), null);
});

test('안 겹치면 안 꺼낸다 — 늘 붙이면 기억하는 척이 된다', () => {
  const s = new EpisodeStore();
  s.learn([사람('오늘 발표 진짜 망했어 너무 속상해')]);
  assert.equal(s.related('저녁 뭐 먹을까'), null);
});

test('조사만 겹치는 건 안 센다', () => {
  const s = new EpisodeStore();
  s.learn([사람('오늘 발표 진짜 망했어 너무 속상해')]);
  assert.equal(s.related('그거는 그렇고 이거는'), null);
});

test('이어지는 일이 있으면 그때 말을 그대로 보여 준다', () => {
  const s = new EpisodeStore();
  s.learn([사람('오늘 발표 진짜 망했어 너무 속상해', 1000)]);
  const note = episodeNote(s, '발표 얘기 나왔는데 속상하더라', 1000 + 하루 * 3);
  assert.match(note, /발표/);
  assert.match(note, /3일 전에/);
  assert.match(note, /캐묻지는 마라/);
});

test('이어지는 게 없으면 아무 말도 안 얹는다', () => {
  const s = new EpisodeStore();
  assert.equal(episodeNote(s, '뭐 하고 있어', 5), '');
});

test('얼마나 지났는지 사람 말로', () => {
  const 지금 = 100 * 하루;
  assert.equal(언제쯤(지금 - 하루 * 40, 지금), '한참 전에');
  assert.equal(언제쯤(지금 - 하루 * 9, 지금), '지난주쯤');
  assert.equal(언제쯤(지금 - 하루, 지금), '어제');
  assert.equal(언제쯤(지금 - 1000, 지금), '아까');
});

test('파일에 남겨 두면 껐다 켜도 이어진다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epi-'));
  const path = join(dir, '그때.json');
  try {
    new EpisodeStore({ path }).learn([사람('오늘 발표 진짜 망했어 너무 속상해')]);
    assert.equal(new EpisodeStore({ path }).all.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('파일이 깨져 있어도 안 죽는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'epi-'));
  const path = join(dir, '그때.json');
  try {
    writeFileSync(path, '깨진 것', 'utf8');
    assert.deepEqual(new EpisodeStore({ path }).all, []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('잘못 담긴 건 지운다', () => {
  const s = new EpisodeStore();
  s.learn([사람('오늘 발표 진짜 망했어 너무 속상해')]);
  assert.equal(s.forget('발표'), true);
  assert.equal(s.all.length, 0);
  assert.equal(s.forget('없던말'), false);
});
