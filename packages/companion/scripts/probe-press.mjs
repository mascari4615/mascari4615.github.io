#!/usr/bin/env node
/**
 * 누르기를 **끝까지** 굴려 보는 자리 (TASK-KAR-241).
 *
 * 단위 검사는 손의 말과 인자만 잰다. 「진짜로 눌리나」는 창이 있어야 알 수 있고, 121회차까지
 * 그걸 못 봤다. 118회차에 한 번 시도했다가 두 번 막혔는데 둘 다 여기 적어 둔다:
 *
 * 1. **자기 프로세스 안에서 제 창을 보면 UI Automation 이 아무것도 안 내놓는다.** 창은 반드시
 *    딴 프로세스로 띄운다.
 * 2. **WinForms 는 애초에 패턴이 없다**(측정: 단추 하나에 지원 패턴 0개). 그래서 「Invoke 가
 *    없다」는 결론을 냈었는데 그건 그 창 얘기였다. **WPF 는 UIA 네이티브**라 단추가 Invoke 를
 *    그대로 내놓는다(측정: `Invoke,SynchronizedInput`).
 *
 * 그리고 **하네스가 제 창의 수명을 쥔다** — 118회차에 띄운 창이 조수님 화면에 그대로 남아
 * 있었다(119회차에 손으로 닫았다). 끝나면 무조건 닫는다.
 *
 * 쓰는 법: node scripts/probe-press.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', 'assets');
const folder = mkdtempSync(join(tmpdir(), 'companion-press-'));
const windowScript = join(folder, 'probe-window.ps1');

/* ASCII only — PS 5.1 은 BOM 없는 파일을 콘솔 코드페이지로 읽어서, 한글이 있으면 통째로
   파싱 오류가 난다(118회차에 여기서 한 번 막혔다). */
writeFileSync(windowScript, `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase
$window = New-Object System.Windows.Window
$window.Title = 'PressProbe'
$window.Width = 320
$window.Height = 170
$window.Topmost = $true
$panel = New-Object System.Windows.Controls.StackPanel
$label = New-Object System.Windows.Controls.TextBlock
$label.Text = 'before'
$button = New-Object System.Windows.Controls.Button
$button.Content = 'PressMe'
$button.Width = 140
$button.Add_Click({ $label.Text = 'after'; $window.Title = 'PressProbe-after' })
$panel.Children.Add($label) | Out-Null
$panel.Children.Add($button) | Out-Null
$window.Content = $panel
# The capture reads the FOREGROUND window, so this one has to actually come up
# front. Without this the harness measures the terminal it was launched from
# (measured 128회차: 18 elements, none of them ours).
$window.Add_Loaded({ $window.Activate() | Out-Null })
$window.ShowDialog() | Out-Null
`, 'utf8');

const ps = (script, args) => execFileSync(
  'powershell',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
  { encoding: 'utf8', timeout: 60_000, windowsHide: true },
);

const child = spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', windowScript], {
  /* 창을 숨기면 전면으로 못 온다 — 그러면 화면 읽기가 이 터미널을 잰다. */
  windowsHide: false,
  stdio: 'ignore',
  detached: false,
});

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
let ok = false;
try {
  await sleep(3000);

  // 화면을 읽어 그 단추의 **번호**를 찾는다 — 우리 두뇌가 보는 것과 같은 목록이다.
  const shot = ps(join(assets, 'capture-screen.ps1'), ['-OutPath', join(folder, 'screen.png')]);
  const tree = JSON.parse(/^TREE=(.*)$/m.exec(shot)?.[1] ?? '[]');
  const target = tree.find((row) => row.n === 'PressMe');
  if (target === undefined) {
    console.log(`[누르기] 그 단추를 화면 목록에서 못 찾았다 (요소 ${tree.length}개)`);
  } else {
    console.log(`[누르기] 찾았다 — [${target.i}] ${target.k} 「${target.n}」 할 수 있는 것: ${(target.p ?? []).join(',') || '없음'}`);
    const pressed = ps(join(assets, 'press-element.ps1'), ['-Number', String(target.i), '-ExpectName', 'PressMe']);
    console.log(`[누르기] ${pressed.trim()}`);

    await sleep(800);
    const after = ps(join(assets, 'capture-screen.ps1'), ['-OutPath', join(folder, 'after.png')]);
    const title = /^TITLE=(.*)$/m.exec(after)?.[1]?.trim() ?? '';
    console.log(`[누르기] 누른 뒤 창 이름: 「${title}」`);
    ok = title.includes('after');
    console.log(ok
      ? '[누르기] ✔ 진짜로 눌렸다 — 창이 스스로 이름을 바꿨다.'
      : '[누르기] ✘ 안 눌렸다 (창 이름이 그대로다)');
  }
} finally {
  /* **창을 반드시 닫는다.** 118회차에 남겨 둔 창이 조수님 화면에 그대로 떠 있었다. */
  try { child.kill(); } catch { /* 이미 죽었으면 그만 */ }
  rmSync(folder, { recursive: true, force: true });
}

process.exit(ok ? 0 : 1);
