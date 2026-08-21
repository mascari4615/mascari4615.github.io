/**
 * 지킴이 — 동반자를 계속 살려둔다.
 *
 * 「내가 실행하는 프로그램」과 「그냥 거기 있는 존재」를 가르는 건 이것 하나다.
 * 컴퓨터를 켜면 알아서 뜨고, 어느 한쪽이 죽으면 혼자 되살아난다.
 *
 *   node scripts/live.mjs             지킴이 시작 (이 터미널에 매여 있다)
 *   node scripts/live.mjs --background 창 없이 뒤에서 — 나가는 말은 로그 파일로
 *   node scripts/live.mjs --install   로그인할 때 자동으로 뜨게 등록 (창 없이)
 *   node scripts/live.mjs --remove    자동 실행 해제
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
const tauriRoot = join(repoRoot, 'apps', 'karmolab-tauri');
const targetRoot = join(tauriRoot, 'target');
/* 구운 자리는 릴리스 → 개발 순으로 본다 (`web.ts` 의 ownWindowExe 와 같은 순서).
   여태 개발 자리만 봐서, 릴리스로 구워 두면 창이 있는데도 없다고 했다. */
const manualExe = process.env.COMPANION_WINDOW_EXE ?? null;
function findBuiltWindow() {
  if (manualExe !== null) return existsSync(manualExe) ? manualExe : null;
  for (const slot of ['release', 'debug']) {
    const exe = join(targetRoot, slot, 'companion-window.exe');
    if (existsSync(exe)) return exe;
  }
  return null;
}

const TASK_NAME = 'Companion';
const logPath = join(homedir(), '.companion', '지킴이.log');

if (process.argv.includes('--install')) {
  installAutoStart();
} else if (process.argv.includes('--remove')) {
  removeAutoStart();
} else if (process.argv.includes('--background')) {
  fromEnd();
} else {
  supervise();
}

/**
 * **창 없이 뒤에서 돈다.**
 *
 * 지킴이는 늘 켜 두는 것인데, 여태 제 터미널 창을 하나 차지하고 앉아 있었다 — 화면에
 * 검은 창이 남고, 그 창을 닫으면 얘도 같이 죽는다. 「그냥 거기 있는 존재」인데 창 하나를
 * 붙들고 있는 셈이다(조수님 실측 2026-08-19: 「터미널 보이는건 어떻게 안 되나」).
 *
 * 그렇다고 말을 버리지는 않는다. 이 저장소에서 제일 비싼 고장은 **조용한 실패**다
 * (오늘만 해도 흉내 목소리가 `stdio:'ignore'` 라 왜 죽었는지 아무 데도 안 남았다).
 * 그래서 창만 없애고 나가는 말은 전부 로그 파일로 받는다.
 */
function fromEnd() {
  mkdirSync(dirname(logPath), { recursive: true });
  // 이어 붙인다 — 다시 띄울 때마다 지난 판이 사라지면 「어제 왜 죽었나」를 못 본다.
  const receiver = openSync(logPath, 'a');
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: root,
    detached: true,
    stdio: ['ignore', receiver, receiver],
    windowsHide: true,
  });
  child.unref();
  console.log(`지킴이를 뒤에서 띄웠다 (pid ${child.pid}) — 창은 없다.`);
  console.log(`  하는 말: ${logPath}`);
  console.log('  끄려면: node scripts/live.mjs --remove (자동 실행) 또는 작업 관리자에서 node 종료');
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
  const openWindow = (exe) => {
    // 서버가 먼저 서야 창이 붙는다.
    setTimeout(() => {
      window = keepAlive('창', exe, [], { cwd: dirname(exe) }, () => {
        // 창을 닫으면 뒤에서 도는 것도 같이 정리한다 — 보이지 않는 것만 남겨두지 않는다.
        face.stop();
        process.exit(0);
      });
    }, 3000);
  };

  const built = findBuiltWindow();
  if (built !== null) {
    openWindow(built);
  } else if (manualExe !== null) {
    console.log(`알려준 자리에 창이 없다 (${manualExe}) — 브라우저로 연다.`);
    openInBrowser();
  } else {
    /* **창이 없으면 스스로 굽는다.**
     *
     * 여태는 「없다」고 찍고 끝이었다. 그런데 굽는 단계가 어디에도 없어서(package.json
     * 에도, postinstall 에도) 사람이 손으로 치기 전엔 영영 안 생겼다 — 게다가
     * `src-tauri-companion` 이 워크스페이스 멤버가 아니라 그 손도 안 먹혔다.
     * 결과는 「켜면 있다」가 아니라 「켜도 아무것도 없다」였다(2026-08-19 실측).
     *
     * target 은 git 에 안 올라가므로 이건 이 컴퓨터만의 사고가 아니다 — 새 컴퓨터·새
     * 워크트리마다 똑같이 없다. 그래서 고칠 자리는 「한 번 구워 두기」가 아니라
     * **없으면 알아서 굽기**다.
     *
     * 굽는 동안은 브라우저로 연다. 처음 굽기는 몇 분 걸리는데 그동안 얘가 화면에서
     * 사라져 있으면 그게 곧 「안 뜬다」로 읽힌다. */
    /* **묻지도 않고 굽지는 않는다** (조수님 결정 2026-08-19: 「무조건 설치하지는 말고」).
     *
     * 굽기는 몇 분짜리 일이고 디스크를 크게 문다. 켤 때마다 말없이 그걸 시작하는 건
     * 도와주는 게 아니라 남의 컴퓨터를 쓰는 일이다. 그래서 기본은 **알려 주기**다 —
     * 깔 자리는 KarmoLab 데스크톱 앱의 「설치」다.
     *
     * 손을 안 대고 켜자마자 굽길 원하면 COMPANION_AUTOBUILD=1. */
    openInBrowser();
    if (process.env.COMPANION_AUTOBUILD === '1') {
      build().then((exe) => {
        if (exe === null || window !== null) return;
        console.log('창을 다 구웠다 — 붙인다. (다음부터는 바로 이 창으로 뜬다)');
        openWindow(exe);
      });
    } else {
      console.log('창 프로그램이 없다 — KarmoLab 데스크톱 앱 「설치」에서 「동반자 창」을 깔면 다음부터 그 창으로 뜬다.');
      console.log('  (여기서 바로 굽고 싶으면 COMPANION_AUTOBUILD=1 로 켜라)');
    }
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
 * 창 프로그램을 굽는다. 없으면 null 을 돌려준다 — 굽기 실패가 곧 동반자 죽음은 아니다.
 *
 * 굽는 자리를 `--target-dir` 로 못 박는다. 환경에 `CARGO_TARGET_DIR` 이 잡혀 있으면
 * (격리 빌드용 `target-claude` 등) 엉뚱한 데 구워 놓고 「없다」고 하게 된다.
 */
function build() {
  return new Promise((resolve) => {
    const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo';
    console.log('창 프로그램이 없다 — 지금 굽는다. 처음이면 몇 분 걸린다 (그동안은 브라우저 창으로 지낸다).');
    const child = spawn(cargo, ['build', '--bin', 'companion-window', '--target-dir', targetRoot], {
      cwd: tauriRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.on('error', (e) => {
      console.log(`창을 못 굽는다 (${e.code === 'ENOENT' ? 'cargo 가 없다 — https://rustup.rs' : e.message}) — 브라우저 창으로 지낸다.`);
      resolve(null);
    });
    child.on('exit', (code) => {
      if (code !== 0) {
        console.log(`창 굽기가 실패했다 (코드 ${code}) — 브라우저 창으로 지낸다.`);
        resolve(null);
        return;
      }
      resolve(findBuiltWindow());
    });
  });
}

/** 창이 없을 때 화면을 여는 유일한 길. 지킴이가 사는 동안 딱 한 번만 연다. */
let browserOpened = false;
function openInBrowser() {
  if (browserOpened) return;
  browserOpened = true;
  const url = `http://localhost:${process.env.COMPANION_PORT ?? 4620}`;
  // 서버가 서기 전에 열면 빈 화면이 뜬다.
  setTimeout(() => {
    const [command, args] = process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
    try {
      spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      console.log(`화면을 브라우저로 열었다 — ${url}`);
    } catch {
      console.log(`화면은 브라우저로 열면 된다 — ${url}`);
    }
  }, 3000);
}

/**
 * 죽으면 다시 띄운다. 계속 죽으면 간격을 늘린다 — 망가진 걸 초당 수십 번
 * 되살리는 건 살려두는 게 아니라 두들기는 것이다.
 */
function keepAlive(label, command, args, options, onCleanExit) {
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
      // 사람이 닫기 단추를 누른 것과 프로그램이 죽은 것은 다르다. 깨끗하게 끝났으면
      // 되살리지 않는다 — 안 그러면 닫아도 곧바로 다시 떠서 「안 꺼진다」가 된다.
      if (code === 0 && onCleanExit !== undefined) {
        console.log(`${label}을(를) 조수님이 닫았다 — 다시 띄우지 않는다`);
        onCleanExit();
        return;
      }
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
  /* 로그인한 내 자리에서 돌아야 한다 — 시스템 계정으로 돌리면 화면도 소리도 없다.
     `--background` 로 등록한다: 로그인할 때 검은 창이 뜨면 그건 매일 아침 치워야 하는
     쓰레기다. 그 판은 곧바로 빠지고, 창 없는 진짜 지킴이만 남는다. */
  const command =
    `$action = New-ScheduledTaskAction -Execute '${process.execPath}' ` +
    `-Argument '"${join(root, 'scripts', 'live.mjs')}" --background' -WorkingDirectory '${root}'; ` +
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
