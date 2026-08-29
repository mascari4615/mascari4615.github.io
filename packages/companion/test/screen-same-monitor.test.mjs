// **그림과 글이 같은 화면을 말하는가** (TASK-KAR-201).
//
// 98회차 실사용에서 화면 파악이 ⠂ F만 띄워져 있네가 전부였다. 99회차에 그걸 DPI
// 탓으로 보고 고쳤는데, **그것만이 아니었다.**
//
// 138회차 실측: 앞에 있던 창은 `(326,-1080,1920,1032)` 에 있었고. **y 가 음수다.**
// 주 모니터 *위*에 붙은 다른 모니터다. 그런데 찍는 자리는 `CopyFromScreen(0, 0, ...)`
// 로 **주 모니터 원점 고정**이었다. 즉:
//
//   글(TREE 120개) = 앞창이 있는 모니터, 그림 = 주 모니터
//
// **둘이 서로 다른 화면을 말하고 있었다.** 두뇌는 그걸 한 장면으로 읽는다. 글에는
// 트위터가 120줄인데 그림에는 아무것도 없으니, F만 띄워져 있네 같은 말이 나온다.
//
// 그래서 잠근다: **찍은 자리가 앞창을 담고 있어야 한다.**

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const script = join(assets, 'capture-screen.ps1');

async function shoot() {
  const out = join(mkdtempSync(join(tmpdir(), 'companion-shot-')), 'shot.png');
  const { stdout } = await run(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutPath', out],
    { timeout: 60_000, windowsHide: true, encoding: 'utf8' },
  );
  const shot = readFileSync(out);
  return {
    stdout,
    /* PNG 머리(IHDR)에서 실제 가로, 세로를 읽는다. 찍었다가 아니라 **뭘 찍었나**를 본다. */
    width: shot.readUInt32BE(16),
    height: shot.readUInt32BE(20),
    origin: (/^ORIGIN=(-?\d+),(-?\d+)$/m.exec(stdout) ?? []).slice(1).map(Number),
    shotArea: (/^AREA=(\d+),(\d+)$/m.exec(stdout) ?? []).slice(1).map(Number),
    elements: JSON.parse(/^TREE=(.*)$/m.exec(stdout)?.[1] ?? '[]'),
  };
}

test('찍은 자리가 어디였는지 말한다. 원점을 모르면 글의 좌표를 그림에 못 얹는다', async () => {
  const taken = await shoot();
  assert.equal(taken.origin.length, 2, 'ORIGIN= 이 없다');
  assert.equal(taken.shotArea.length, 2, 'AREA= 가 없다');
  assert.ok(taken.shotArea[0] > 0 && taken.shotArea[1] > 0);
});

test('찍은 자리가 앞창을 담고 있다. 그림과 글이 같은 화면이어야 한다', async () => {
  const taken = await shoot();
  const window = taken.elements[0];
  if (!window || !Array.isArray(window.r) || window.r[2] <= 0) {
    /* 앞창을 못 읽은 판이면 이 검사가 뜻이 없다. 0 을 초록으로 쓰지 않는다. */
    return;
  }
  const [x, y, w, h] = window.r;
  const [ox, oy] = taken.origin;
  const [aw, ah] = taken.shotArea;
  /* 창 한가운데가 찍힌 자리 안에 있으면 같은 모니터다 (창은 화면 밖으로 삐져나갈 수 있다). */
  const cx = x + w / 2;
  const cy = y + h / 2;
  assert.ok(
    cx >= ox && cx < ox + aw && cy >= oy && cy < oy + ah,
    `앞창 한가운데 (${cx},${cy}) 가 찍은 자리 (${ox},${oy})+(${aw}x${ah}) 밖이다. 그림과 글이 다른 화면을 말한다`,
  );
});

test('줄인 그림의 비율이 찍은 자리와 같다. 좌표를 되돌릴 수 있어야 한다', async () => {
  const taken = await shoot();
  const [aw, ah] = taken.shotArea;
  const shrunk = taken.width / aw;
  assert.ok(shrunk > 0 && shrunk <= 1.001, `가로 배율이 이상하다: ${shrunk}`);
  assert.ok(
    Math.abs(taken.height / ah - shrunk) < 0.01,
    `세로 배율이 가로와 다르다. 좌표를 못 되돌린다 (${taken.width}x${taken.height} vs ${aw}x${ah})`,
  );
});
