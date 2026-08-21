// 화면에서 **누를 수 있는 것**이 보이나 (TASK-KAR-241 1단계).
//
// 104회차에 창 안을 글자로 읽게 됐지만, 읽은 것 중 무엇이 **눌리는 것**인지는 모른다.
// 밖의 길은 정해져 있다(원장 2026-08-21) — 좌표로 클릭하지 않고 컨트롤이 내놓은 동작
// (UI Automation 의 Invoke/Toggle/…)을 부른다. 창 위치·DPI 배율에 안 휘둘린다.
//
// 그러려면 먼저 **무슨 동작을 지원하는지**가 보여야 한다. 실측(117회차): 그 조회에 85ms.
// 이미 274ms 걸리는 트리 뽑기 옆에서 싸다.

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

test('트리에 「무슨 동작이 되나」가 실린다', { skip: windows ? false : '윈도우에서만 잰다' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'companion-act-'));
  try {
    const stdout = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutPath', join(folder, 'screen.png')],
      { timeout: 60_000, windowsHide: true, encoding: 'utf8' },
    );
    const parsed = JSON.parse(/^TREE=(.*)$/m.exec(stdout)[1]);
    assert.ok(parsed.length > 0);
    for (const row of parsed) {
      assert.ok(Array.isArray(row.p), `동작 칸이 없다: ${JSON.stringify(row)}`);
    }
    // 창이 있으면 누를 수 있는 것이 하나쯤은 있다 (단추·탭 닫기 같은 것).
    assert.ok(parsed.some((row) => row.p.length > 0), '아무 것도 못 누른다고 나오면 조작으로 못 넘어간다');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('두뇌가 보는 글에 「누를 수 있음」이 드러난다', async () => {
  const eye = screenSense({
    everyMs: 3_600_000,
    capture: async () => ({
      title: '어떤 창',
      elements: [
        { k: 'Button', n: '저장', r: [10, 20, 60, 30], p: ['Invoke'] },
        { k: 'Text', n: '그냥 글', r: [10, 60, 60, 30], p: [] },
      ],
    }),
  });
  const seen = await eye.seeing();
  assert.match(seen.text, /저장/);
  assert.match(seen.text, /Invoke|누를 수 있다/, '무엇을 누를 수 있는지 안 적히면 조작을 못 고른다');
});
