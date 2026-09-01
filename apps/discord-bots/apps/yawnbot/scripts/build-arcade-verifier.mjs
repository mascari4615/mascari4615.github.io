/**
 * 오락실 커널을 서버가 쓸 수 있게 한 덩이로 굽는다 (change.arcade-online)
 *
 * 커널은 브라우저 코드지만 화면도 그물망도 안 씀. 그래서 Node 에서 그대로 돔
 * (`test-arcade.mjs` 가 이미 그 길로 51종을 굴림). 같은 길을 서버로
 *
 * 굽는 것은 `verify-entry.ts` 하나. 서버가 붙잡을 표면을 좁게 두려고
 * 놀이 명부와 커널 전체 대신 `verifyTape` 하나만
 *
 * 나온 파일은 커밋 안 함. 소스에서 나오는 것이라 두 벌이 되면 언젠가 갈림
 * 욘봇이 빌드할 때 이 스크립트를 부름
 *
 * **karmolab 이 아니라 여기 사는 이유**: Node 는 `esbuild` 를 이 파일 자리에서 찾음.
 * karmolab 쪽에 두면 CI 가 못 찾는다. 러너는 `apps/discord-bots` 만 설치하기 때문
 * (2026-09-01 실측, 배포 두 판 빨감)
 *
 * `node scripts/build-arcade-verifier.mjs [--out <경로>]`
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** 이 꾸러미(yawnbot) */
const PKG = path.resolve(HERE, '..');
/** 커널이 사는 곳 */
const APP = path.resolve(PKG, '..', '..', '..', 'karmolab');
const args = process.argv.slice(2);
const at = args.indexOf('--out');
const OUT =
  at >= 0 && args[at + 1]
    ? path.resolve(args[at + 1])
    : path.resolve(PKG, 'data', 'arcade-verifier.cjs');

const res = await build({
  entryPoints: [path.join(APP, 'src/widgets/arcade/verify-entry.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  outfile: OUT,
  logLevel: 'silent',
  metafile: true
});

const bytes = Object.values(res.metafile.outputs)[0]?.bytes ?? 0;
console.log(`[verifier] 구웠다: ${path.relative(process.cwd(), OUT)} (${Math.round(bytes / 1024)}KB)`);

/* 진짜 부를 수 있는지 그 자리에서 본다. 못 부르는 파일을 구워 두면 서버가 조용히 안 쓴다 */
const { createRequire } = await import('node:module');
const req = createRequire(import.meta.url);
const mod = req(OUT);
if (typeof mod.verifyTape !== 'function') {
  console.error('[verifier] ❌ verifyTape 가 없다');
  process.exit(1);
}
const probe = mod.verifyTape({ game: 'nope', seed: 1, seats: [], moves: [] });
if (probe.ok) {
  console.error('[verifier] ❌ 빈 패보를 통과시켰다');
  process.exit(1);
}
console.log('[verifier] ✅ 부를 수 있다');
