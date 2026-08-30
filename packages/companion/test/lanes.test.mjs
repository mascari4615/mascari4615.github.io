import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { folderTitle, listGrokLanes, roomLane, workLane, talkLane } from '../dist/desk/lanes.js';

test('작업 폴더 이름만 남긴다', () => {
  assert.equal(folderTitle('C%3A%5CUsers%5Cmasca%5Crepos%5Ckarmoddrine'), 'karmoddrine');
});

test('그록 세션 폴더를 레인으로 모은다', () => {
  const home = mkdtempSync(join(tmpdir(), 'companion-lanes-'));
  const sid = '01a01227-51d9-7c82-a6d4-ba88cef64ec7';
  const dir = join(home, 'sessions', 'C%3A%5CUsers%5Cmasca%5Crepos%5Ckarmoddrine', sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'note.txt'), 'x');

  mkdirSync(join(home, 'sessions', 'C%3A%5CUsers%5Cmasca%5Crepos', sid), { recursive: true });
  const lanes = listGrokLanes({ home, sessionId: sid });
  assert.equal(lanes.length, 1);
  assert.equal(lanes[0].id, sid);
  assert.equal(lanes[0].vendor, 'grok');
  assert.match(lanes[0].title, /karmoddrine|repos/);
  assert.equal(lanes[0].here, true);
});

test('방은 말하는 자리다', () => {
  const lane = roomLane('욘, 말하는 자리');
  assert.equal(lane.id, 'room');
  assert.equal(lane.kind, 'room');
  assert.equal(lane.live, true);
});

test('일 방과 말 방이 갈린다', () => {
  assert.equal(workLane().id, 'work');
  assert.equal(workLane().title, '일');
  assert.equal(talkLane().id, 'talk');
  assert.equal(talkLane().title, '말');
});
