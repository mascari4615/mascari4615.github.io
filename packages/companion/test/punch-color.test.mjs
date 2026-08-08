import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ownWindowExe } from '../dist/index.js';

/**
 * 색 뚫기는 **폐기됐다** — 되살아나지 않는지 지킨다.
 *
 * 옛 수법: 페이지가 형광색 한 가지를 칠하고, 창 띄우는 스크립트가 그 색을 뚫어 투명한
 * 척한다. 그림을 GPU 가 그리는 창에서는 그 색이 안 뚫린다. 그래서 실제로 나온 화면이
 * **형광 분홍 바탕 + 최소화·최대화·닫기 막대 + 그 위에 시커먼 몸**이었다(사용자 실측).
 *
 * 「없는 것보다 나은 차선」이 아니라 결과를 더 나쁘게 만드는 길이라 걷어냈다. 투명은
 * 제 창(`companion-window.exe`)이 창 설정으로 그냥 지원한다.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const 읽기 = (...p) => readFileSync(join(root, ...p), 'utf8');

test('창 띄우는 쪽은 뚫을 색을 더 이상 안 넘긴다', () => {
  const web = 읽기('src', 'body', 'web.ts');
  assert.equal(/const KEY = '[0-9A-Fa-f]{6}'/.test(web), false, '뚫을 색이 되살아났다');
  assert.equal(/-KeyColor/.test(web), false, '색을 뚫는 스크립트를 다시 부르고 있다');
});

test('페이지는 바탕을 칠하지 않는다 — 안 뚫리면 그게 그냥 형광 분홍 화면이다', () => {
  const page = 읽기('assets', 'face.html');
  assert.equal(/document\.body\.style\.background\s*=/.test(page), false, '바탕을 다시 칠하고 있다');
  assert.equal(/URLSearchParams\(location\.search\)\.get\('t'\)/.test(page), false, '색을 다시 받고 있다');
});

test('색을 뚫던 스크립트 자체가 없다', () => {
  assert.equal(existsSync(join(root, 'assets', 'pin-window.ps1')), false);
});

test('제 창은 저장소 위치에 안 묶인다 — 밖에서 알려 주면 그걸 쓴다', () => {
  const 원래 = process.env.COMPANION_WINDOW_EXE;
  try {
    // 이 파일은 반드시 있다. 실제로 있는 파일이어야 「찾았다」가 의미를 갖는다.
    const 있는파일 = join(root, 'package.json');
    process.env.COMPANION_WINDOW_EXE = 있는파일;
    assert.equal(ownWindowExe(), process.platform === 'win32' ? 있는파일 : null);

    process.env.COMPANION_WINDOW_EXE = join(root, '없는-파일.exe');
    assert.notEqual(ownWindowExe(), join(root, '없는-파일.exe'), '없는 자리를 들고 있으면 안 된다');
  } finally {
    if (원래 === undefined) delete process.env.COMPANION_WINDOW_EXE;
    else process.env.COMPANION_WINDOW_EXE = 원래;
  }
});
