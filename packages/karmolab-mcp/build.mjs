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

console.log(`[karmolab-mcp] 알맹이 ${manifest.length}개 찍음: ${manifest.join(' · ')}`);
