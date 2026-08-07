import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

/**
 * 화면이 **문법으로 살아 있나.**
 *
 * 창이 통째로 하얬다. 원인은 그림도 투명도 아니고, 글자 하나였다 — `split('\n')` 의
 * 줄바꿈 표시가 **진짜 줄바꿈**으로 들어가 문자열이 안 닫혔고, 그 한 줄 때문에 화면
 * 스크립트가 통째로 파싱에 실패해 **아무것도 실행되지 않았다.**
 *
 * 이 실패는 소리를 안 낸다. 스크립트가 파싱조차 안 되면 그 안에 심어 둔 「에러를 알려라」
 * 도 같이 죽어서, 화면도 조용하고 서버 기록도 조용하다. 그래서 사람이 창을 보고 말해 줄
 * 때까지 몰랐다.
 *
 * 시험이 여기 있는 이유 — 다른 시험은 전부 `src/` 를 본다. 화면은 문자열도 모듈도 아닌
 * .html 안에 있어서 **어떤 게이트도 지나가지 않았다.** 여기서 실제로 파싱해 본다.
 */

const 화면 = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'face.html');

/** 페이지 안의 실행되는 스크립트 토막들 (importmap 은 JSON 이라 뺀다). */
function 스크립트들(html) {
  return [...html.matchAll(/<script(?![^>]*importmap)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

test('화면 스크립트가 파싱된다 — 한 글자만 깨져도 화면 전체가 죽는다', () => {
  const html = readFileSync(화면, 'utf8');
  const 토막 = 스크립트들(html);
  assert.ok(토막.length > 0, '화면에 스크립트가 있어야 한다');
  for (const [i, code] of 토막.entries()) {
    assert.doesNotThrow(() => new Script(code, { filename: `face.html#${i}` }), `${i}번째 토막`);
  }
});

test('곁딸린 모듈들도 파싱된다', async () => {
  const dir = dirname(화면);
  for (const name of ['model.js', 'toon.js', 'face-paint.js']) {
    // 모듈은 import/export 를 쓰므로 스크립트로는 못 컴파일한다. 문법만 보고 싶으니
    // 실행 없이 확인할 수 있는 최소한 — 파일을 감싼 함수로 만들어 본다.
    const code = readFileSync(join(dir, name), 'utf8')
      .replace(/^\s*import[\s\S]*?from\s*'[^']*';?\s*$/gm, '')
      .replace(/^\s*export\s+/gm, '');
    assert.doesNotThrow(() => new Script(`(async () => {\n${code}\n})`, { filename: name }), name);
  }
});

test('줄바꿈 표시가 진짜 줄바꿈으로 새지 않았다 — 이번 사고의 모양 그대로', () => {
  const html = readFileSync(화면, 'utf8');
  // 따옴표를 열고 그 줄에서 안 닫은 채 끝나는 자리. 이게 그때 그 모양이다.
  const 샌곳 = html.split('\n').filter((line) => /\.split\('$/.test(line.trimEnd()));
  assert.deepEqual(샌곳, []);
});
