/**
 * **밀 커밋 그대로 타입검사** (2026-08-13)
 *
 * 왜: 이 저장소는 세션 여럿이 **한 작업 폴더**를 같이 쓴다. 그래서 내 폴더에서 초록인 것이
 * 올라간 커밋에서는 빨강일 수 있다 — 남이 아직 안 올린 파일에 기대고 있으면 그렇다.
 * 실제로 `sound.ts` 를 담다가 남의 껍데기 변경에 딸린 한 줄(`labels.notMine`)이 같이 올라가,
 * 그 이름을 아는 파일은 저장소에 없어 **CI 만** TS2353 으로 섰다(2026-08-13, 두 판).
 * 내 자리에서 `tsc` 를 아무리 돌려도 안 나온다 — 재는 대상이 폴더지 커밋이 아니기 때문이다.
 *
 * 그래서 **커밋을 따로 펼쳐 놓고** 잰다: 얕은 딴 작업폴더(sparse)로 그 커밋의 `apps/karmolab`
 * 만 꺼내고, 무거운 `node_modules` 는 원래 자리를 가리키게 이어 붙인 뒤 `tsc` 를 돌린다.
 *
 * 사용: KL_PUSH_SHA=<sha> node scripts/typecheck-pushed.mjs   (없으면 HEAD)
 * exit: 0 = 초록 / 1 = 그 커밋이 타입검사에서 선다 / 2 = 못 돌림(빨강 아님)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(appRoot));

/* 훅 안에서 물려받은 git 환경변수는 **다른 저장소를 가리킨다** — 지우고 시작한다
   (이 함정으로 예전에 「올라간 파일 0개」를 본 적이 있다). */
const env = { ...process.env };
for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
const git = (args, cwd = repoRoot) => execFileSync('git', args, { cwd, env, encoding: 'utf8' });

const cannotRun = (why) => {
  console.log(`[typecheck-pushed] CANNOT-RUN — ${why}`);
  console.log('  못 돈 것은 빨강이 아니다 — 그냥 지나간다.');
  process.exit(2);
};

let sha;
try {
  sha = git(['rev-parse', process.env.KL_PUSH_SHA || 'HEAD']).trim();
} catch (e) {
  cannotRun(`어느 커밋인지 못 알아냈다: ${String(e.message).split('\n')[0]}`);
}

/* 이 커밋이 karmolab 의 타입 있는 파일을 하나도 안 건드렸으면 잴 것이 없다 (대부분의 push) */
let touched = '';
try {
  touched = git(['diff', '--name-only', `origin/master..${sha}`, '--', 'apps/karmolab']).trim();
} catch { /* origin 을 모르면 그냥 잰다 */ }
if (touched && !/\.ts(\r?\n|$)/.test(touched + '\n')) {
  console.log('[typecheck-pushed] karmolab 타입 파일은 안 건드렸다 — 건너뛴다');
  process.exit(0);
}

const nodeModules = join(appRoot, 'node_modules');
if (!existsSync(nodeModules)) cannotRun('apps/karmolab/node_modules 가 없다');

const tmp = mkdtempSync(join(tmpdir(), 'kl-tc-'));
const work = join(tmp, 'w');
let added = false;
try {
  /* 통째로 꺼내면 느리다 — 이 앱만 꺼낸다 */
  git(['worktree', 'add', '--no-checkout', '--detach', work, sha]);
  added = true;
  git(['sparse-checkout', 'set', '--cone', 'apps/karmolab'], work);
  git(['checkout'], work);

  const app = join(work, 'apps/karmolab');
  if (!existsSync(join(app, 'tsconfig.json'))) cannotRun('꺼낸 커밋에 apps/karmolab/tsconfig.json 이 없다');
  /* 의존은 원래 자리를 가리킨다 — 커밋이 바꾸는 것은 소스지 의존이 아니다.
     (`npm ci` 를 여기서 또 하면 1분이 아니라 5분짜리 게이트가 된다.) */
  symlinkSync(nodeModules, join(app, 'node_modules'), 'junction');

  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json'], {
    cwd: app,
    env,
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.trim();
  if (r.status === 0) {
    console.log(`[typecheck-pushed] OK — ${sha.slice(0, 8)} 커밋 그대로 타입검사 통과`);
    process.exit(0);
  }
  console.error(`[typecheck-pushed] ${sha.slice(0, 8)} **커밋 상태**에서 타입검사가 선다:`);
  for (const line of out.split('\n').slice(0, 12)) console.error(`  ${line}`);
  console.error('  내 폴더에서는 초록일 수 있다 — 남이 아직 안 올린 파일에 기대고 있으면 그렇다.');
  process.exit(1);
} finally {
  if (added) {
    try {
      git(['worktree', 'remove', '--force', work]);
    } catch { /* 남아도 tmp 다 */ }
  }
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch { /* 지워지면 좋고 */ }
}
