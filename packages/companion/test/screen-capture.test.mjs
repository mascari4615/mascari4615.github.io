// 화면을 진짜 크기로 찍는가.
//
// 98회차 실사용에서 화면 파악이 ⠂ F만 띄워져 있네가 전부였다. 원인을 재 보니
// 두뇌가 못 읽은 게 아니라 **못 읽을 그림을 줬다**. 찍는 과정이 DPI 를 모르는 채로 돌아
// 1920x1080 화면이 1097x617 로 찍히고 있었다(면적의 33%. 175% 배율 기준).
// 그 크기에서 창 안의 글자는 뭉개진다.
//
// 그래서 여기서 재는 것은 찍히나가 아니라 **진짜 화면 폭만큼 찍히나**다.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const script = join(here, '..', 'assets', 'capture-screen.ps1');
const windows = process.platform === 'win32';

/** PNG 머리(IHDR)에서 가로, 세로. 라이브러리 없이 읽는다. */
function pngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG', 'PNG 이 아니다');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** DPI 를 아는 채로 물어본 진짜 화면 크기. */
function realScreen() {
  const ps = [
    'Add-Type -TypeDefinition \'using System;using System.Runtime.InteropServices;public class D{[DllImport("user32.dll")]public static extern bool SetProcessDPIAware();[DllImport("user32.dll")]public static extern int GetSystemMetrics(int i);}\'',
    '[void][D]::SetProcessDPIAware()',
    'Write-Output ([D]::GetSystemMetrics(0).ToString() + "x" + [D]::GetSystemMetrics(1).ToString())',
  ].join('; ');
  const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true,
  });
  const match = /(\d+)x(\d+)/.exec(out);
  assert.ok(match, `화면 크기를 못 읽었다: ${out}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

test('화면을 진짜 폭으로 찍는다 (DPI 배율에 깎이지 않는다)', { skip: windows ? false : '윈도우에서만 잰다' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'companion-shot-test-'));
  const out = join(folder, 'screen.png');
  try {
    const real = realScreen();
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutPath', out], {
      timeout: 60_000,
      windowsHide: true,
      encoding: 'utf8',
    });
    const shot = pngSize(out);
    const cap = 1568; // 그림을 읽는 쪽이 이 언저리로 줄인다. 그보다 크게 들고 다닐 이유가 없다.
    const want = Math.min(real.width, cap);
    assert.equal(
      shot.width,
      want,
      `화면은 ${real.width}px 인데 ${shot.width}px 로 찍혔다. 글자가 뭉개진다`,
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('찍은 그림과 함께 지금 창 제목이 온다', { skip: windows ? false : '윈도우에서만 잰다' }, () => {
  const folder = mkdtempSync(join(tmpdir(), 'companion-shot-test-'));
  const out = join(folder, 'screen.png');
  try {
    const stdout = execFileSync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-OutPath', out],
      { timeout: 60_000, windowsHide: true, encoding: 'utf8' },
    );
    assert.match(stdout, /TITLE=/, '창 제목 줄이 없다');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
