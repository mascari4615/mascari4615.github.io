import assert from 'node:assert/strict';
import test from 'node:test';

import { 말할수있게, 소리낼만한가, anySpeech } from '../dist/index.js';

/* 화면에서 주운 점자 기호 하나에 목소리 서버가 400 으로 죽어 그 turn 이 통째로 무음이
   됐다(실측 2026-08-08). 한 글자 때문에 한 마디를 잃지 않게 한다. */

test('읽을 수 없는 그림 기호는 걷어낸다 — 실제로 목소리를 죽였던 글자', () => {
  assert.equal(말할수있게('「⠂ F」만 띄워져 있네'), 'F 만 띄워져 있네');
  assert.equal(말할수있게('박스 ┌─┐ 그림'), '박스 그림');
});

test('사람이 읽는 것은 그대로 둔다', () => {
  assert.equal(말할수있게('응, 그래… 진짜?'), '응, 그래… 진짜?');
  assert.equal(말할수있게('ㅋㅋ 30% 정도'), 'ㅋㅋ 30% 정도');
});

test('읽을 게 남는지 가른다', () => {
  assert.equal(소리낼만한가('안녕'), true);
  assert.equal(소리낼만한가('⠂⠄⠆'), false);
  assert.equal(소리낼만한가('...'), false);
});

test('소리로 낼 게 없으면 만들지 않는다 — 빈 소리를 애써 만들지 않는다', async () => {
  let 불렸나 = false;
  const 목소리 = anySpeech([
    {
      label: '가짜',
      speech: {
        name: '가짜',
        contentType: 'audio/wav',
        voices: async () => [{ id: 'v', label: 'v', gender: '?' }],
        synthesize: async () => { 불렸나 = true; return Buffer.from('x'); },
      },
    },
  ]);
  await assert.rejects(() => 목소리.synthesize('⠂⠄'), /소리로 낼 게 없는/);
  assert.equal(불렸나, false, '못 읽을 글을 목소리 쪽에 넘겼다');
});

test('걸러낸 뒤의 글로 소리를 만든다', async () => {
  let 받은글 = '';
  const 목소리 = anySpeech([
    {
      label: '가짜',
      speech: {
        name: '가짜',
        contentType: 'audio/wav',
        voices: async () => [{ id: 'v', label: 'v', gender: '?' }],
        synthesize: async (t) => { 받은글 = t; return Buffer.from('x'); },
      },
    },
  ]);
  await 목소리.synthesize('⠂ 안녕 ⠄');
  assert.equal(받은글, '안녕');
});
