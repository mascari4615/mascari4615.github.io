import assert from 'node:assert/strict';
import test from 'node:test';

import {
  grokJsonText,
  grokStreamText,
  parseBrainName,
  parseToolMode,
  pickBrain,
} from '../dist/index.js';

test('streaming-json 의 text 만 말로 남긴다', () => {
  assert.equal(grokStreamText('{"type":"text","data":"안녕"}'), '안녕');
  assert.equal(grokStreamText('{"type":"thought","data":"생각하는 중"}'), '');
  assert.equal(grokStreamText('{"type":"end","stopReason":"end_turn"}'), '');
  assert.equal(grokStreamText('not-json'), '');
});

test('json 한 덩어리에서 text 를 뺀다', () => {
  assert.equal(grokJsonText('{"text":"한 마디","stopReason":"end_turn"}'), '한 마디');
  assert.equal(grokJsonText('그냥 글'), '그냥 글');
});

test('두뇌 이름과 도구 모드는 표에서만 고른다', () => {
  assert.equal(parseBrainName('grok'), 'grok');
  assert.equal(parseBrainName('Grok'), 'grok');
  assert.equal(parseBrainName('없는것'), 'echo');
  assert.equal(parseToolMode(undefined), 'talk');
  assert.equal(parseToolMode('work'), 'work');
  assert.equal(parseToolMode('talk'), 'talk');
});

test('고른 두뇌의 이름이 맞다 — 새 백엔드는 여기 한 줄', () => {
  assert.equal(pickBrain('echo').name, 'echo');
  assert.match(pickBrain('grok', { tools: 'talk' }).name, /grok-cli\(talk/);
  assert.match(pickBrain('grok', { tools: 'work' }).name, /grok-cli\(work/);
});
