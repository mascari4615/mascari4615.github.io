import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { Companion, InMemoryMemory, alwaysRespond, loadCharacter } from '../dist/index.js';

function tempFile(name, content) {
  const path = join(mkdtempSync(join(tmpdir(), 'companion-char-')), name);
  writeFileSync(path, content, 'utf8');
  return path;
}

test('인격 파일은 이름과 본문으로 갈린다', () => {
  const path = tempFile('누구.md', '---\nname: 누구\n---\n\n짧게 말해라.\n반말 쓴다.\n');
  const character = loadCharacter(path);
  assert.equal(character.name, '누구');
  assert.equal(character.instruction, '짧게 말해라.\n반말 쓴다.');
});

test('머리말 없는 파일도 읽힌다 — 이름은 파일명이 된다', () => {
  const path = tempFile('이름없음.md', '그냥 본문만 있다.');
  const character = loadCharacter(path);
  assert.equal(character.name, '이름없음');
  assert.equal(character.instruction, '그냥 본문만 있다.');
});

test('인격은 코어를 거쳐 두뇌까지 그대로 전달된다', async () => {
  let seen = null;
  const brain = { name: 'spy', async think(input) { seen = input.character; return '응'; } };
  const body = { name: 'test', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };
  const character = { name: '누구', instruction: '짧게.' };

  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond, character,
  });
  await companion.start();
  await companion.feed({ channel: 'test', kind: 'text', text: '안녕', at: Date.now() });

  assert.deepEqual(seen, character);
});

test('인격을 안 주면 아무도 아닌 채로 간다', async () => {
  let seen = 'sentinel';
  const brain = { name: 'spy', async think(input) { seen = input.character; return '응'; } };
  const body = { name: 'test', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };

  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
  });
  await companion.start();
  await companion.feed({ channel: 'test', kind: 'text', text: '안녕', at: Date.now() });

  assert.equal(seen, undefined);
});

test('감각에 딸려온 부가 정보(그림 위치 등)는 두뇌까지 살아서 간다', async () => {
  let seen = null;
  const brain = { name: 'spy', async think(input) { seen = input.sensation.meta; return null; } };
  const body = { name: 'screen', sense: { name: 's', start() {} }, voice: { name: 'v', speak() {} } };

  const companion = new Companion({
    bodies: [body], brain, memory: new InMemoryMemory(), attention: alwaysRespond,
  });
  await companion.start();
  await companion.feed({
    channel: 'screen', kind: 'screen', text: '화면을 봤다.', at: Date.now(),
    meta: { imagePath: 'C:/tmp/now.png', windowTitle: '무슨 창' },
  });

  assert.equal(seen.imagePath, 'C:/tmp/now.png');
  assert.equal(seen.windowTitle, '무슨 창');
});
