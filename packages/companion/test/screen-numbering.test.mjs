// 화면 요소에 **번호**를 붙인다 (TASK-KAR-241 2단계).
//
// 지금은 두뇌에게 Button 탭 닫기처럼 이름으로만 준다. 그런데 실측(120회차):
// 창 하나에 이름 있는 요소 19개 중 **고유 이름은 12개**다. 탭 닫기가 넷, 탭 이름이
// 저마다 둘씩. 두뇌가 탭 닫기 눌러라고 해도 **어느 것인지 우리가 모른다.**
//
// 밖에서도 같은 문제를 같은 방법으로 푼다(Set-of-Mark, 원장 2026-08-21). 그림 위에 번호를
// 얹고 모델은 좌표가 아니라 번호를 고른다. 우리는 글 목록이니 목록에 번호를 붙인다.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { screenSense } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'assets', 'capture-screen.ps1');
const windows = process.platform === 'win32';

test('트리의 요소마다 번호가 붙는다', { skip: windows ? false : '윈도우에서만 잰다' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'companion-num-'));
  try {
    const stdout = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutPath', join(folder, 'screen.png')],
      { timeout: 60_000, windowsHide: true, encoding: 'utf8' },
    );
    const parsed = JSON.parse(/^TREE=(.*)$/m.exec(stdout)[1]);
    assert.ok(parsed.length > 0);
    const numbers = parsed.map((row) => row.i);
    for (const n of numbers) assert.equal(Number.isInteger(n), true, `번호가 없다: ${JSON.stringify(numbers)}`);
    assert.equal(new Set(numbers).size, numbers.length, '번호가 겹치면 집을 수가 없다');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('두뇌가 보는 글에 번호가 앞에 온다. 같은 이름이 여럿이어도 집을 수 있게', async () => {
  const eye = screenSense({
    everyMs: 3_600_000,
    capture: async () => ({
      title: '어떤 창',
      elements: [
        { i: 1, k: 'Button', n: '탭 닫기', r: [10, 20, 60, 30], p: ['Invoke'] },
        { i: 2, k: 'Button', n: '탭 닫기', r: [80, 20, 60, 30], p: ['Invoke'] },
      ],
    }),
  });
  const seen = await eye.seeing();
  assert.match(seen.text, /\[1\][^\n]*탭 닫기/);
  assert.match(seen.text, /\[2\][^\n]*탭 닫기/);
});
