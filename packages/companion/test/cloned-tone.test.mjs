import assert from 'node:assert/strict';
import test from 'node:test';

import { clonedSpeech, 기분빠르기 } from '../dist/index.js';

/** 진짜로 안 보내고, 무엇을 보내려 했는지만 가로챈다. */
function 가로채기() {
  const 보낸것 = [];
  const 원래 = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    보낸것.push(JSON.parse(init.body));
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  };
  return { 보낸것, 되돌리기: () => { globalThis.fetch = 원래; } };
}

const 목소리 = () => clonedSpeech({ refAudioPath: 'ref.wav', refText: '참고' });

test('결이 없으면 늘 하던 속도', async () => {
  const { 보낸것, 되돌리기 } = 가로채기();
  try {
    await 목소리().synthesize('안녕');
    assert.equal(보낸것[0].speed_factor, 1);
  } finally { 되돌리기(); }
});

test('처진 결은 느리게 — 결을 붙여 놓고 안 받으면 붙인 적 없는 것과 같다', async () => {
  const { 보낸것, 되돌리기 } = 가로채기();
  try {
    await 목소리().synthesize('안녕', 'cloned@처짐');
    assert.ok(보낸것[0].speed_factor < 1, `느려야 하는데 ${보낸것[0].speed_factor}`);
  } finally { 되돌리기(); }
});

test('들뜬 결은 빠르게', async () => {
  const { 보낸것, 되돌리기 } = 가로채기();
  try {
    await 목소리().synthesize('안녕', 'cloned@들뜸');
    assert.ok(보낸것[0].speed_factor > 1);
  } finally { 되돌리기(); }
});

test('모르는 결은 늘 하던 속도 — 엉뚱한 값이 들어와도 안 튄다', async () => {
  const { 보낸것, 되돌리기 } = 가로채기();
  try {
    await 목소리().synthesize('안녕', 'cloned@없는결');
    assert.equal(보낸것[0].speed_factor, 1);
  } finally { 되돌리기(); }
});

test('네 결이 모두 이어져 있다 — 하나만 빠지면 그 마음만 안 들린다', async () => {
  for (const 결 of Object.keys(기분빠르기)) {
    const { 보낸것, 되돌리기 } = 가로채기();
    try {
      await 목소리().synthesize('안녕', `cloned@${결}`);
      assert.notEqual(보낸것[0].speed_factor, 1, `${결} 이 안 이어졌다`);
    } finally { 되돌리기(); }
  }
});
