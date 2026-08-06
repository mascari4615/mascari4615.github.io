/**
 * 지킴이 — 동반자를 계속 살려둔다.
 *
 * 「내가 실행하는 프로그램」과 「그냥 거기 있는 존재」를 가르는 건 이것 하나다.
 * 컴퓨터를 켜면 알아서 뜨고, 어느 한쪽이 죽으면 혼자 되살아난다.
 *
 *   node scripts/live.mjs            지킴이 시작
 *   node scripts/live.mjs --install  로그인할 때 자동으로 뜨게 등록
 *   node scripts/live.mjs --remove   자동 실행 해제
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
const windowExe = process.env.COMPANION_WINDOW_EXE
  ?? join(repoRoot, 'apps', 'karmolab-tauri', 'target', 'debug', 'companion-window.exe');

const TASK_NAME = 'Companion';

if (process.argv.includes('--install')) {
  installAutoStart();
} else if (process.argv.includes('--remove')) {
  removeAutoStart();
} else {
  supervise();
}

// ── 지킴이 ────────────────────────────────────────────────────────────────

function supervise() {
  console.log('지킴이 시작 — 동반자를 계속 살려둔다. 멈추려면 Ctrl+C.');
  const face = keepAlive('동반자', process.execPath, [join(root, 'demo', 'face.mjs')], {
    cwd: root,
    // 창은 아래에서 따로 띄운다. 브라우저는 열지 않는다 — 안 그러면 되살아날 때마다
    // 브라우저 창이 하나씩 쌓인다.
    env: { ...process.env, COMPANION_DESKTOP: '0', COMPANION_OPEN: '0' },
  });

  let window = null;
  if (existsSync(windowExe)) {
    // 서버가 먼저 서야 창이 붙는다.
    setTimeout(() => {
      window = keepAlive('창', windowExe, [], { cwd: dirname(windowExe) });
    }, 3000);
  } else {
    console.log(`창 프로그램이 없다 (${windowExe}) — 화면은 브라우저로 열면 된다.`);
  }

  const stop = () => {
    face.stop();
    window?.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

/**
 * 죽으면 다시 띄운다. 계속 죽으면 간격을 늘린다 — 망가진 걸 초당 수십 번
 * 되살리는 건 살려두는 게 아니라 두들기는 것이다.
 */
function keepAlive(label, command, args, options) {
  let child = null;
  let stopped = false;
  let backoffMs = 1000;
  let lastStart = 0;

  const start = () => {
    if (stopped) return;
    lastStart = Date.now();
    child = spawn(command, args, { ...options, stdio: 'inherit', windowsHide: true });
    child.on('exit', (code) => {
      if (stopped) return;
      // 오래 살아 있었으면 일시적인 사고로 보고 간격을 되돌린다.
      backoffMs = Date.now() - lastStart > 60_000 ? 1000 : Math.min(backoffMs * 2, 60_000);
      console.log(`${label}이(가) 멈췄다 (코드 ${code}) — ${Math.round(backoffMs / 1000)}초 뒤 다시 띄운다`);
      setTimeout(start, backoffMs);
    });
  };

  start();
  return {
    stop() {
      stopped = true;
      child?.kill();
    },
  };
}

// ── 자동 실행 등록 ─────────────────────────────────────────────────────────

function installAutoStart() {
  if (process.platform !== 'win32') {
    console.error('지금은 Windows 만 등록할 수 있다.');
    process.exit(1);
  }
  // 로그인한 내 자리에서 돌아야 한다 — 시스템 계정으로 돌리면 화면도 소리도 없다.
  const command =
    `$action = New-ScheduledTaskAction -Execute '${process.execPath}' ` +
    `-Argument '"${join(root, 'scripts', 'live.mjs')}"' -WorkingDirectory '${root}'; ` +
    `$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME; ` +
    `$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries ` +
    `-DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1); ` +
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $action -Trigger $trigger ` +
    `-Settings $settings -RunLevel Limited -Force | Out-Null; ` +
    `Write-Output 'OK'`;
  run(command, '이제 로그인하면 동반자가 알아서 뜬다.');
}

function removeAutoStart() {
  run(
    `Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false; Write-Output 'OK'`,
    '자동 실행을 껐다.',
  );
}

function run(command, doneMessage) {
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'pipe', encoding: 'utf8' });
    console.log(doneMessage);
  } catch (e) {
    console.error(`실패: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
    process.exit(1);
  }
}
