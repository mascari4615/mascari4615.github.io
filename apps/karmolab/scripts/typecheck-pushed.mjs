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
/** 갓 꺼낸 커밋에서 **소스만 읽고** 판정할 수 있는 검사들 (지어 놓은 것을 읽는 것은 뺐다).
 *  `test:tools`·`test:tool-url` 은 `js/`·말 묶음 같은 **빌드 산출물**을 읽는데 새 체크아웃엔 없다 —
 *  넣었더니 「없는 것을 보고 빨강」이 셋 났다(2026-08-13). 이 게이트는 push 를 막으므로,
 *  없는 것을 빨강으로 세면 멀쩡한 커밋이 막힌다. 그 둘은 작업 폴더 쪽 게이트와 CI 몫이다. */
const SOURCE_ONLY_GATES = [
  'test:ink',
  'audit:jpegbg',
  'audit:hidden',
  'audit:saylive',
  'audit:iconbtn',
  'audit:aliases',
  'audit:scripts',
  'test:i18n:keys',
  'test:karmograph',
  'audit:wf-prereq',
  'audit:orphans'
];

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
/* 의존이 **비어 있는 순간**이 실제로 있다 — 옆 세션이 `npm ci` 를 도는 중이면 그렇다.
   그 상태로 재면 「tsc 가 없다」가 나오고, 이 게이트는 push 를 막으므로 **멀쩡한 커밋이
   막힌다**. 못 재는 것은 빨강이 아니다 — 그렇게 말하고 지나간다. */
if (!existsSync(nodeModules) || !existsSync(join(nodeModules, 'typescript'))) {
  cannotRun('apps/karmolab/node_modules 가 없거나 비었다 (옆 세션이 npm ci 를 도는 중일 수 있다)');
}

const tmp = mkdtempSync(join(tmpdir(), 'kl-tc-'));
const work = join(tmp, 'w');
let added = false;
try {
  /* 통째로 꺼내면 느리다 — 이 앱만 꺼낸다 */
  git(['worktree', 'add', '--no-checkout', '--detach', work, sha]);
  added = true;
  /* `.github` 도 꺼낸다 — 빠른 게이트 하나가 워크플로 전제를 읽는다(없으면 못 돈다고 한다) */
  git(['sparse-checkout', 'set', '--cone', 'apps/karmolab', '.github', 'packages'], work);
  git(['checkout'], work);

  const app = join(work, 'apps/karmolab');
  if (!existsSync(join(app, 'tsconfig.json'))) cannotRun('꺼낸 커밋에 apps/karmolab/tsconfig.json 이 없다');
  /* 의존은 원래 자리를 가리킨다 — 커밋이 바꾸는 것은 소스지 의존이 아니다.
     (`npm ci` 를 여기서 또 하면 1분이 아니라 5분짜리 게이트가 된다.) */
  symlinkSync(nodeModules, join(app, 'node_modules'), 'junction');

  const win = process.platform === 'win32';
  /* `node` 는 `.cmd` 가 없다 — `npx`·`npm` 만 그렇다. 붙였더니 「node.cmd 를 찾을 수 없다」로 죽었다. */
  const runIn = (bin, args) =>
    spawnSync(win && bin !== 'node' ? `${bin}.cmd` : bin, args, { cwd: app, env, encoding: 'utf8', shell: win });

  const failed = [];
  const tc = runIn('npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']);
  if (tc.status !== 0) failed.push(['타입검사', `${tc.stdout || ''}${tc.stderr || ''}`.trim()]);

  /* ★ **빠른 게이트도 여기서 돈다** (2026-08-13). 그것들도 작업 폴더를 읽고 있었다 —
     남이 만들다 만 것 때문에 헛빨강이 나서 「막지 말고 알리기만」 하는 반쪽 게이트로 살았다.
     커밋을 펼쳐 놓은 이 자리에서 돌리면 판정이 정확해지고, 그러면 **막아도 된다**. */
  /* `verify:prepush` 가 아니라 **소스만 읽는 열하나**(`verify:pushed`)를 돌린다.
     `test:tools`·`test:tool-url` 은 **지어 놓은 것**(js/·말 묶음)을 읽는데 갓 꺼낸 커밋엔 그게 없다 —
     넣었더니 「없는 것을 보고 빨강」이었다(2026-08-13 실측 3건). 없는 것을 빨강으로 세면
     이 게이트가 막는 게이트라서 **멀쩡한 push 가 막힌다**. 그 둘은 작업 폴더 쪽 게이트와 CI 몫이다. */
  /* 목록을 **여기** 둔다 — 꺼낸 커밋의 `package.json` 에 있는 이름을 부르면, 오늘 그 이름을
     막 만든 판에서는 「그런 스크립트 없다」로 죽는다(닭과 달걀). 게이트는 부르는 쪽이 들고 있는다. */
  const fast = runIn('node', ['scripts/run-gates.mjs', ...SOURCE_ONLY_GATES]);
  if (fast.status !== 0) failed.push(['빠른 게이트', `${fast.stdout || ''}${fast.stderr || ''}`.trim()]);

  if (!failed.length) {
    console.log(`[typecheck-pushed] OK — ${sha.slice(0, 8)} 커밋 그대로 타입검사 + 빠른 게이트 통과`);
    process.exit(0);
  }
  for (const [what, out] of failed) {
    console.error(`[typecheck-pushed] ${sha.slice(0, 8)} **커밋 상태**에서 ${what}이(가) 선다:`);
    for (const line of out.split(String.fromCharCode(10)).filter(Boolean).slice(-14)) console.error(`  ${line}`);
  }
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
