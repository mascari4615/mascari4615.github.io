/**
 * 알맹이를 Node 가 읽을 수 있는 모양으로 찍어 낸다 (TASK-KL-205 / S1 P3)
 *
 * 알맹이(`apps/karmolab/src/core/*.ts`)는 화면 쪽 저장소에 있고 TypeScript 다. Node 는 그걸
 * 그대로 못 읽으므로 여기서 한 벌 묶어 `dist/` 에 놓는다. **베끼는 게 아니라 찍어 내는 것**이다 —
 * 원본은 한 곳뿐이고, 여기 것은 매번 새로 만들어진다(그래서 dist 는 커밋하지 않는다).
 *
 * 목록을 손으로 안 적는다: `core/` 에 있는 것 중 `spec` 을 내놓는 파일이 곧 대상이다.
 * 새 도구를 알맹이로 옮기면 **여기 손댈 필요 없이** MCP 에도 자동으로 생긴다.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, '../../apps/karmolab/src/core');

/**
 * esbuild 를 **화면 쪽 저장소 것으로** 빌려 쓴다.
 * 여기에 따로 설치하면 같은 도구가 두 벌이 되고, 이 저장소는 `npm ci` 가 링크를 따라가
 * 원본을 지운 사고 이력이 있다 — 설치를 늘릴수록 그 지뢰밭이 넓어진다. 빌드에만 쓰는 도구라
 * 빌려 쓰는 편이 짐이 적다. 없으면 「어디서 설치하라」까지 말해 준다.
 */
const requireFromApp = createRequire(pathToFileURL(path.resolve(here, '../../apps/karmolab/package.json')).href);
let esbuild;
try {
  esbuild = await import(pathToFileURL(requireFromApp.resolve('esbuild')).href);
} catch {
  console.error('[karmolab-mcp] esbuild 를 못 찾았다 — `cd apps/karmolab && npm install` 먼저');
  process.exit(1);
}
const outDir = path.join(here, 'dist');

if (fs.existsSync(coreDir) === false) {
  console.error(`[karmolab-mcp] 알맹이 폴더가 없다: ${coreDir}`);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// `spec` 을 내놓는 파일만 도구다. types.ts·sha3.ts 같은 **부품**은 도구가 아니다.
const entries = fs
  .readdirSync(coreDir)
  .filter((f) => f.endsWith('.ts'))
  .filter((f) => /export const spec\b/.test(fs.readFileSync(path.join(coreDir, f), 'utf8')))
  .map((f) => path.join(coreDir, f));

if (entries.length === 0) {
  console.error('[karmolab-mcp] spec 을 내놓는 알맹이가 하나도 없다 — 빌드할 게 없다');
  process.exit(1);
}

await esbuild.build({
  entryPoints: entries,
  outdir: outDir,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node20'],
  logLevel: 'error'
});

// 무엇이 들어 있는지 적어 둔다 — 서버가 이걸 읽어 도구를 올린다(손으로 적은 목록 없음).
const manifest = entries.map((f) => path.basename(f, '.ts'));
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ tools: manifest }, null, 2) + '\n');

let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim();
} catch {
  /* git 없이도 빌드는 된다 */
}
fs.writeFileSync(path.join(outDir, 'build.json'), JSON.stringify({ commit, at: new Date().toISOString() }, null, 2) + '\n');

/*
 * README 에 적힌 도구 개수가 실제와 갈리지 않게 못을 박는다.
 *
 * 이 숫자는 README 에 세 군데 손으로 적혀 있다(첫 줄 · 「## Tools (N)」 · 한국어 단락). 도구를
 * 하나 넣을 때마다 세 곳을 다 고쳐야 하는데, 하나 빠뜨려도 **아무 것도 안 깨진다** — 발행된
 * 뒤에야 남이 세어 보고 안 맞는 걸 발견한다. 그래서 여기서 센다. 여기가 진짜 개수를 아는 자리다.
 */
let opCount = 0;
for (const name of manifest) {
  const mod = await import(pathToFileURL(path.join(outDir, `${name}.mjs`)).href);
  opCount += Object.keys(mod.spec.ops).length;
}

const readmePath = path.join(here, 'README.md');
const readme = fs.readFileSync(readmePath, 'utf8');
const claimed = [...readme.matchAll(/(\d+)\s*tools|## Tools \((\d+)\)|도구 (\d+)개/g)].map((m) =>
  Number(m[1] ?? m[2] ?? m[3])
);
const wrong = claimed.filter((n) => n !== opCount);
if (claimed.length === 0) {
  console.error('[karmolab-mcp] README 에 도구 개수가 안 적혀 있다 — 세는 자리를 잃었다');
  process.exit(1);
}
if (wrong.length > 0) {
  console.error(
    `[karmolab-mcp] README 의 도구 개수가 실제와 다르다: 적힌 값 ${claimed.join('·')} / 실제 ${opCount}`
  );
  process.exit(1);
}

/*
 * 공식 레지스트리(registry.modelcontextprotocol.io)에 올릴 `server.json` 은 버전을 **또 적는다**
 * (세 곳: 최상위 `version` · `packages[0].version` · npm 이름). 손으로 적는 곳이 늘면 갈린다 —
 * 레지스트리가 「0.1.0 을 받아라」라고 말하는데 npm 에는 0.2.0 만 있으면, 설치가 조용히 실패한다.
 */
const serverJsonPath = path.join(here, 'server.json');
if (fs.existsSync(serverJsonPath)) {
  const reg = JSON.parse(fs.readFileSync(serverJsonPath, 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(here, 'package.json'), 'utf8'));
  const pkgVersion = pkg.version;
  const pkgName = pkg.name;
  const mismatches = [];
  if (reg.version !== pkgVersion) mismatches.push(`version ${reg.version} ≠ ${pkgVersion}`);
  for (const entry of reg.packages ?? []) {
    if (entry.version !== pkgVersion) mismatches.push(`packages[].version ${entry.version} ≠ ${pkgVersion}`);
    if (entry.identifier !== pkgName) mismatches.push(`packages[].identifier ${entry.identifier} ≠ ${pkgName}`);
  }
  /*
   * 레지스트리는 설명문을 **100자까지만** 받는다 (2026-08-10, 등재가 여기서 422 로 튕겼다).
   * npm 쪽 설명문은 더 길어도 되므로 둘은 같을 수 없다 — 그래서 여기서 길이를 지킨다.
   * 발행 워크플로 끝까지 갔다가 마지막 한 줄로 튕기는 것보다, 빌드에서 미리 멈추는 게 싸다.
   */
  /*
   * 네임스페이스는 **소문자만** 받는다 (2026-08-10, 등재가 403 으로 튕겼다 —
   * 「You have permission to publish: io.github.mascari4615/*」 인데 우리는 대문자 M 으로 적었다).
   * 깃허브 계정 이름은 대소문자를 보존해서 보여 주므로, 그대로 옮겨 적으면 이 함정에 빠진다.
   */
  if (reg.name !== reg.name.toLowerCase()) {
    mismatches.push(`name 에 대문자가 있다 (${reg.name}) — 레지스트리 네임스페이스는 소문자만`);
  }

  if ((reg.description ?? '').length > 100) {
    mismatches.push(`description 이 ${reg.description.length}자 — 레지스트리 상한은 100자`);
  }

  if (mismatches.length > 0) {
    console.error(`[karmolab-mcp] server.json 이 package.json 과 갈렸다: ${mismatches.join(' · ')}`);
    process.exit(1);
  }
}

console.log(`[karmolab-mcp] 알맹이 ${manifest.length}개 · 도구 ${opCount}개 찍음: ${manifest.join(' · ')}`);
