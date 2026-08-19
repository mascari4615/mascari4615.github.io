import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Companion,
  InMemoryMemory,
  alwaysRespond,
  chatSegments,
  grokStreamPart,
  previewBrain,
} from '../dist/index.js';

test('채팅 본문의 그림 마크를 화면이 쓰는 함수로 가른다', () => {
  const segs = chatSegments('앞에 ![한 장](https://example.com/a.png) 뒤에');
  assert.deepEqual(segs.map((s) => s.kind), ['text', 'image', 'text']);
  assert.equal(segs[1].src, 'https://example.com/a.png');
  assert.equal(segs[0].text, '앞에 ');
  assert.equal(segs[2].text, ' 뒤에');
});

test('그록 스트림 한 줄이 도구 카드·그림으로 풀린다', () => {
  const tool = grokStreamPart(JSON.stringify({
    type: 'tool_call',
    toolCallId: 'call_1',
    toolName: 'read_file',
    rawInput: { path: 'src/main.rs' },
  }));
  assert.equal(tool?.kind, 'tool');
  assert.equal(tool.name, 'read_file');
  assert.equal(tool.status, 'start');

  const done = grokStreamPart(JSON.stringify({
    type: 'tool_call_update',
    toolCallId: 'call_1',
    status: 'completed',
    rawOutput: { lines: 42 },
  }));
  assert.equal(done?.kind, 'tool');
  assert.equal(done.status, 'done');

  const img = grokStreamPart(JSON.stringify({
    type: 'tool_call_update',
    toolCallId: 'img',
    rawOutput: { path: 'https://cdn.example/x.png' },
  }));
  assert.equal(img?.kind, 'image');
  assert.equal(img.src, 'https://cdn.example/x.png');
});

test('미리보기 두뇌가 흘리는 도구·그림을 입이 그대로 받는다', async () => {
  const seen = [];
  const body = {
    name: 'web',
    sense: { name: 's', start() {} },
    voice: {
      name: 'v',
      speak() {},
      partial() {},
      show(part) { seen.push(part); },
    },
  };
  const companion = new Companion({
    bodies: [body],
    brain: previewBrain(),
    memory: new InMemoryMemory(),
    attention: alwaysRespond,
  });
  await companion.start();
  await companion.feed({ channel: 'web', kind: 'text', text: '손봐줘', at: Date.now() });
  await new Promise((r) => setTimeout(r, 250));
  assert.ok(seen.some((p) => p.kind === 'tool' && p.name === 'read_file'), `도구가 안 왔다: ${JSON.stringify(seen)}`);
  assert.ok(seen.some((p) => p.kind === 'image' && typeof p.src === 'string' && p.src.startsWith('data:image/')), `그림이 안 왔다: ${JSON.stringify(seen)}`);
});
