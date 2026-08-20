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
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SOURCE_ONLY } from './lib/gate-sets.mjs';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
/* 목록은 `lib/gate-sets.mjs` 한 곳 — 여기 또 적으면 언젠가 갈라진다(오늘 하루 세 번 당한 병이다). */

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
/* 앱이 `file:` 로 무는 꾸러미는 **지어야 형태가 생긴다**. dist 가 없으면 「모듈을 못 찾겠다」가
   무더기로 나는데 그건 커밋 잘못이 아니라 **내 자리가 덜 갖춰진 것**이다 — 실측 2026-08-13:
   옆 세션이 `packages/` 를 통째로 지웠다 되살리는 사이, 멀쩡한 push 가 이 게이트에 막혔다.
   못 재는 것은 빨강이 아니다. */
for (const pkg of ['karmolab-ai', 'badapple']) {
  if (!existsSync(join(repoRoot, 'packages', pkg, 'dist'))) {
    cannotRun(`packages/${pkg}/dist 가 없다 — 그 꾸러미를 아직 안 지었다 (npm ci && npm run build)`);
  }
}

const tmp = mkdtempSync(join(tmpdir(), 'kl-tc-'));
const work = join(tmp, 'w');
try {
  /* ★ **딴 작업폴더(worktree) 대신 「그 커밋을 그냥 풀어 놓는다」** (2026-08-13 교정).
     처음엔 `git worktree add` + `sparse-checkout` 을 썼는데, 그 명령은 저장소 **공용 설정**에
     `extensions.worktreeConfig` 를 켠다 — 여러 세션이 한 나무를 쓰는 이곳에서 남의 자리에
     영향이 갈 수 있는 자국이다(실제로 `packages/` 가 두 번 사라진 뒤 이 자국을 발견했다).
     `git archive` 는 아무 설정도 안 건드리고 **읽기만** 한다. 값도 더 싸다. */
  mkdirSync(work, { recursive: true });
  const tar = spawnSync('tar', ['-x', '-C', work], {
    /* ★ 뿌리의 `scripts` 도 같이 푼다 (2026-08-15). 검사 몇은 **검사를 부르는 자리**를 세는데,
       그 자리 하나가 뿌리 `scripts/verify.mjs` 다. 안 풀면 거기서만 부르는 검사(`audit:pages`)가
       갑자기 「아무도 안 돌린다」로 보여 **멀쩡한 커밋이 막힌다** — 오늘 실제로 그랬다.
       여기서 만드는 세상이 반쪽이면 그 안의 판정도 반쪽이다. */
    input: execFileSync('git', ['archive', sha, 'apps/karmolab', 'packages', '.github', 'scripts'], {
      cwd: repoRoot,
      env,
      maxBuffer: 512 * 1024 * 1024,
      encoding: 'buffer'
    }),
    env,
    encoding: 'buffer'
  });
  if (tar.status !== 0) cannotRun('그 커밋을 풀어 놓지 못했다 (tar)');

  const app = join(work, 'apps/karmolab');
  if (!existsSync(join(app, 'tsconfig.json'))) cannotRun('꺼낸 커밋에 apps/karmolab/tsconfig.json 이 없다');
  /* 의존은 원래 자리를 가리킨다 — 커밋이 바꾸는 것은 소스지 의존이 아니다. */
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
  const fast = runIn('node', ['scripts/run-gates.mjs', ...SOURCE_ONLY]);
  if (fast.status !== 0) failed.push(['빠른 게이트', `${fast.stdout || ''}${fast.stderr || ''}`.trim()]);

  /* ★ **원래도 빨갰나** (2026-08-13). 여기서 빨강이 나도 그게 **이 push 탓**이 아닐 수 있다 —
     남이 올린 미완성이 이미 master 를 빨갛게 해 둔 상태면, 내가 뭘 밀든 같은 빨강이 난다.
     그걸 막으면 고치러 가는 길까지 막힌다(오늘 실측: 글 도구 17개 명부 누락으로 전 세션 빨강).
     그래서 같은 검사를 **origin/master 에서도** 한 번 돌려, 거기서도 빨간 것은 그냥 알린다. */
  if (failed.length) {
    let baseRed = null;
    try {
      const baseDir = join(tmp, 'base');
      mkdirSync(baseDir, { recursive: true });
      const t2 = spawnSync('tar', ['-x', '-C', baseDir], {
        input: execFileSync('git', ['archive', 'origin/master', 'apps/karmolab', 'packages', '.github'], {
          cwd: repoRoot, env, maxBuffer: 512 * 1024 * 1024, encoding: 'buffer'
        }),
        env, encoding: 'buffer'
      });
      if (t2.status === 0) {
        const baseApp = join(baseDir, 'apps/karmolab');
        symlinkSync(nodeModules, join(baseApp, 'node_modules'), 'junction');
        const r = spawnSync(win && 'node' !== 'node' ? 'node.cmd' : 'node', ['scripts/run-gates.mjs', ...SOURCE_ONLY], {
          cwd: baseApp, env, encoding: 'utf8', shell: win
        });
        baseRed = r.status !== 0;
      }
    } catch { /* 못 재면 모른다 — 아래에서 「모름」으로 둔다 */ }
    if (baseRed === true) {
      console.error(`[typecheck-pushed] ⚠ ${sha.slice(0, 8)} 에서 빨강이 나지만 **origin/master 도 같은 자리에서 빨갛다**.`);
      console.error('  내 push 가 만든 것이 아니다 — 막지 않는다. 올린 세션에 알려라.');
      for (const [what, out] of failed) {
        console.error(`  [${what}]`);
        for (const line of linesToShow(out)) console.error(`    ${line}`);
      }
      process.exit(0);
    }
  }

/**
 * 사람에게 보여 줄 줄을 고른다 — **끝 몇 줄이 아니라 「빨강 요약부터 끝까지」.**
 *
 * 왜 (2026-08-15 실측): 여기가 끝 열네 줄만 보여 줬다. `run-gates` 의 판정 요약은 맨 끝에 있고
 * 각 검사의 **사유는 그 훨씬 위**에 있어서, push 가 `audit:orphans` 로 막혔는데 화면에는
 * 「빨강 1개」만 남고 **왜인지 한 줄도 안 나왔다**. 사유 없는 빨강은 게이트가 아니라 벽이다.
 * (`run-gates` 도 같은 날 고쳤다 — 이제 빨간 검사의 제 말을 요약 아래 다시 붙인다.)
 */
function linesToShow(out) {
  const lines = out.split(String.fromCharCode(10)).filter(Boolean);
  const mark = lines.findIndex((l) => l.includes('[gates] 빨강'));
  return mark >= 0 ? lines.slice(mark) : lines.slice(-20);
}

  if (!failed.length) {
    console.log(`[typecheck-pushed] OK — ${sha.slice(0, 8)} 커밋 그대로 타입검사 + 빠른 게이트 통과`);
    process.exit(0);
  }
  for (const [what, out] of failed) {
    console.error(`[typecheck-pushed] ${sha.slice(0, 8)} **커밋 상태**에서 ${what}이(가) 선다:`);
    for (const line of linesToShow(out)) console.error(`  ${line}`);
  }
  console.error('  내 폴더에서는 초록일 수 있다 — 남이 아직 안 올린 파일에 기대고 있으면 그렇다.');
  process.exit(1);
} finally {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch { /* 지워지면 좋고 — tmp 다 */ }
}
