/**
 * 부품 하나를 굽고 **도장을 찍는다** (TASK-KL-330).
 *
 * 「깔렸나」를 exe 존재로만 보면 두 가지를 못 본다: 언제 구운 것인지, 어느 소스로 구운
 * 것인지. 설치 위젯은 저장소 안 파일만 읽을 수 있으므로(repofile_read) 결과를 작은 JSON
 * 한 장에 적어 둔다 — 22MB 짜리 exe 를 창이 읽을 일이 없어진다.
 *
 *   node scripts/install-part.mjs companion-window
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const tauriRoot = join(here, '..');
const repoRoot = join(tauriRoot, '..', '..');
const targetRoot = join(tauriRoot, 'target');
const stampPath = join(targetRoot, 'install.json');

/** 부품마다 「어떻게 굽나」. 카탈로그(보여 주는 쪽)와 달리 여기는 실제 명령이다. */
const RECIPES = {
  'companion-window': {
    artifact: join(targetRoot, 'debug', 'companion-window.exe'),
    // 셸을 안 거친다 — 인자가 그대로 넘어간다. 윈도우는 확장자까지 적어야 찾는다.
    program: process.platform === 'win32' ? 'cargo.exe' : 'cargo',
    /* `--target-dir` 을 못 박는다 — 환경에 CARGO_TARGET_DIR 이 잡혀 있으면(격리 빌드용
       target-claude 등) 엉뚱한 데 구워 놓고 「없다」고 하게 된다. */
    args: ['build', '--bin', 'companion-window', '--target-dir', targetRoot],
  },
};

const id = process.argv[2];
const recipe = RECIPES[id];
if (recipe === undefined) {
  console.error(`모르는 부품이다: ${id} (아는 것: ${Object.keys(RECIPES).join(', ')})`);
  process.exit(1);
}

/* **지금 돌고 있으면 못 덮어쓴다.**
 *
 * 윈도우는 돌고 있는 exe 를 잠근다. 이때 cargo 가 하는 말은 「액세스가 거부되었습니다
 * (os error 5)」뿐이라, 화면에서는 그냥 실패로 보이고 무엇을 하면 되는지가 안 적힌다
 * (2026-08-19 실측: 창이 떠 있는 채로 다시 굽다 여기서 멎었다).
 *
 * 자동으로 꺼 버리지는 않는다 — 지금 그 창에 대고 말하는 중일 수 있다. 무엇을 하면
 * 되는지만 정확히 말한다. */
if (existsSync(recipe.artifact)) {
  /* 이름 바꾸기로는 못 잡는다 — 윈도우는 **돌고 있는 exe 도 이름은 바꾸게 해 준다**
     (실측: 창이 떠 있는데 검사를 그냥 통과했다). 잠기는 건 쓰기다. */
  try {
    closeSync(openSync(recipe.artifact, 'r+'));
  } catch {
    console.error(`[설치] ${id} 가 지금 돌고 있어 덮어쓸 수 없다 — 먼저 닫고 다시 눌러라.`);
    console.error(`[설치]   (${recipe.artifact})`);
    process.exit(2);
  }
}

console.log(`[설치] ${id} 를 굽는다 — 처음이면 몇 분 걸린다.`);
const result = spawnSync(recipe.program, recipe.args, { cwd: tauriRoot, stdio: 'inherit' });
if (result.status !== 0) {
  console.error(`[설치] ${id} 굽기 실패 (코드 ${result.status}) — 도장을 안 찍는다.`);
  process.exit(result.status ?? 1);
}
if (existsSync(recipe.artifact) === false) {
  console.error(`[설치] 굽기는 끝났는데 결과물이 없다 (${recipe.artifact}) — 도장을 안 찍는다.`);
  process.exit(1);
}

// 「어느 소스로 구웠나」. git 이 없거나 저장소가 아니어도 굽기 자체는 성공이다.
let source = null;
try {
  source = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  source = null;
}

const stamps = existsSync(stampPath) ? JSON.parse(readFileSync(stampPath, 'utf8')) : {};
stamps[id] = {
  builtAt: new Date().toISOString(),
  bytes: statSync(recipe.artifact).size,
  source,
};
mkdirSync(targetRoot, { recursive: true });
writeFileSync(stampPath, `${JSON.stringify(stamps, null, 2)}\n`);
console.log(`[설치] ${id} 끝 — ${(stamps[id].bytes / 1024 / 1024).toFixed(1)}MB · 소스 ${source ?? '모름'}`);
