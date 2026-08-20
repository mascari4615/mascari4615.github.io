#!/usr/bin/env node
/**
 * **깨끗한 사본에서 굽는다** (2026-08-14 — 하루에 세 번 당하고 만듦)
 *
 * 왜 있나: 이 작업 폴더는 세션 여럿이 함께 쓴다. 「커밋본이 곧 서비스본」인 파생물
 * (공유 카드·월드컵 표·llms.txt …)을 여기서 구우면 **남의 미커밋 글자가 섞여 든다.**
 * 오늘 실측 세 번:
 *   · 월드컵 표를 여기서 굽자 멀쩡한 도구 일곱이 표에서 빠졌다.
 *   · 공유 카드를 여기서 굽고 「187장 모두 맞다」를 봤는데, 올라간 커밋 기준으로는 둘이 옛 문구였다.
 *     (두 시간 뒤 같은 검사가 또 빨갰다 — 그제야 원인을 알았다.)
 *   · llms.txt 도 같은 함정 앞에서 멈췄다.
 * 고치는 법은 늘 같았다: **origin 을 깨끗한 사본에 펼치고 거기서 짓고 거기서 굽는다.**
 * 그 열 단계를 손으로 밟으니 매번 십 분이 든다. 한 줄로 만든다.
 *
 * 사용: node scripts/bake-clean.mjs <npm 스크립트> [더…]
 *   예) node scripts/bake-clean.mjs gen:og
 *       node scripts/bake-clean.mjs gen:llms gen:worldcup-tools
 *
 * 하는 일: origin/master 얕은 사본 → `node_modules` 를 이 자리 것으로 이어 붙임 →
 *          (필요하면) 짓기 → 준 스크립트 실행 → **바뀐 산출물만** 이 작업 폴더로 옮겨 놓고 이름을 적는다.
 *          이 작업 폴더의 다른 파일은 건드리지 않는다.
 *
 * exit: 0 = 구웠다(바뀐 것이 있으면 이름을 적는다) · 2 = 못 돌림(사본을 못 만들었다 등)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(appRoot));
const scripts = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const win = process.platform === 'win32';

if (!scripts.length) {
  console.error('사용: node scripts/bake-clean.mjs <npm 스크립트> [더…]');
  process.exit(2);
}

const couldNotRun = (why) => {
  console.log(`[bake-clean] CANNOT-RUN — ${why}`);
  process.exit(2);
};

/* 굽는 놈이 무엇을 내놓는지는 파생물 표 한 곳이 안다 — 여기 또 적지 않는다. */
const { generated } = await import('./lib/generated-artifacts.mjs');
const artifacts = scripts.flatMap((n) => generated.find((x) => x.npm === n)?.outputs ?? []);

const remote = (() => {
  try {
    return execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();
if (!remote) couldNotRun('origin 주소를 못 읽었다');
if (!existsSync(join(appRoot, 'node_modules'))) couldNotRun('apps/karmolab/node_modules 가 없다 (npm ci 먼저)');

const tmp = mkdtempSync(join(tmpdir(), 'kl-bake-'));
try {
  console.log('[bake-clean] 깨끗한 사본을 뜬다 (origin, 얕게)…');
  const clone = spawnSync('git', ['-c', 'core.longpaths=true', 'clone', '--depth', '3', '-q', remote, tmp], {
    encoding: 'utf8'
  });
  if (clone.status !== 0) couldNotRun(`사본을 못 만들었다: ${(clone.stderr || '').trim().split('\n').pop()}`);

  const copiedApp = join(tmp, 'apps/karmolab');
  if (!existsSync(copiedApp)) couldNotRun('사본에 apps/karmolab 이 없다');
  symlinkSync(join(appRoot, 'node_modules'), join(copiedApp, 'node_modules'), 'junction');

  const runOne = (bin, args) =>
    spawnSync(win && bin !== 'node' ? `${bin}.cmd` : bin, args, {
      cwd: copiedApp,
      encoding: 'utf8',
      shell: win,
      stdio: 'inherit'
    });

  /* 굽는 놈 대부분은 **지어 놓은 것**을 읽는다(`js/widgets-lazy-meta.js` 등). 사본은 갓 떴으니 짓는다. */
  console.log('[bake-clean] 사본에서 짓는다 (말 묶음 + build.mjs)…');
  if (runOne('npm', ['run', '--silent', 'build:i18n']).status !== 0) couldNotRun('사본에서 말 묶음을 못 지었다');
  if (runOne('node', ['build.mjs']).status !== 0) couldNotRun('사본에서 build.mjs 가 죽었다');

  for (const n of scripts) {
    console.log(`[bake-clean] 굽는다: ${n}`);
    const code = runOne('npm', ['run', '--silent', n]).status;
    if (code === 2) {
      /* 2 = 「못 돌렸다」 — 이 저장소 규약. 죽은 것이 아니다. */
      console.log(`[bake-clean] ${n} — 사본에서 「못 돌렸다」고 한다 (빨강 아님)`);
      continue;
    }
    if (code !== 0) {
      console.error(`[bake-clean] ${n} 이(가) 사본에서 죽었다 — 여기서 멈춘다`);
      process.exit(1);
    }
  }

  if (!artifacts.length) {
    console.log('[bake-clean] 이 스크립트의 산출물이 파생물 표에 없다 — 옮길 것을 모른다.');
    console.log(`  사본은 여기 있다(지우기 전에 보라): ${tmp}`);
    console.log('  표에 한 줄 넣어 두면 다음부터 알아서 옮긴다: scripts/lib/generated-artifacts.mjs');
    process.exit(0);
  }

  const changed = [];
  for (const rel of artifacts) {
    const fresh = join(copiedApp, rel);
    const here = join(appRoot, rel);
    if (!existsSync(fresh)) continue;
    /* 폴더째 나오는 것도 있다(공유 카드 `img/og`) — 그때는 통째로 옮기고 몇 개인지만 적는다. */
    if (statSync(fresh).isDirectory()) {
      cpSync(fresh, here, { recursive: true });
      changed.push(`${rel}/ (폴더째)`);
      continue;
    }
    const a = existsSync(here) ? readFileSync(here) : null;
    const b = readFileSync(fresh);
    if (a && a.equals(b)) continue;
    cpSync(fresh, here);
    changed.push(`${rel} (${(statSync(here).size / 1024).toFixed(1)}KB)`);
  }

  if (!changed.length) {
    console.log('[bake-clean] 다시 구웠는데 그대로다 — 커밋본이 이미 지금 소스와 같다.');
    process.exit(0);
  }
  console.log(`[bake-clean] 바뀐 산출물 ${changed.length}개를 이 자리로 옮겼다:`);
  changed.forEach((x) => console.log('  - ' + x));
  console.log('  ※ 이것만 커밋해라 — 이 작업 폴더의 다른 변경은 남의 것일 수 있다.');
} finally {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch { /* tmp 다 */ }
}
