/**
 * Emit browser scripts from src/ into js/ (mirrors paths under src/), and src/world → ../world/ (wiki loaders).
 * - Most entries: bundle + iife (type-only imports resolve).
 * - mdd.ts / gemini.ts / toolbox.ts: bundle false + esm so top-level globals stay visible (no extra IIFE).
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { discoverEntryPoints } from './scripts/entry-points.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

await esbuild.build({
  entryPoints: [join(root, 'src/mdd.ts')],
  outfile: join(root, 'js/mdd.js'),
  bundle: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

await esbuild.build({
  entryPoints: [join(root, 'src/gemini.ts')],
  outfile: join(root, 'js/gemini.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info',
  // Entry has no exports; tree-shaking can strip the Gemini/ImageDB IIFEs after adding an import.
  treeShaking: false
});

await esbuild.build({
  entryPoints: [join(root, 'src/toolbox.ts')],
  outfile: join(root, 'js/toolbox.js'),
  bundle: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});




// Service Worker + 갱신 안내 (TASK-KL-088).
// 캐시 이름에 빌드 스탬프를 박아야 새 배포가 옛 캐시를 버린다 → sw 는 소스가 아니라 빌드 산출물.
const buildStamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
await esbuild.build({
  entryPoints: [join(root, 'src/sw.ts')],
  outfile: join(root, 'sw.js'),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  define: { __KARMOLAB_BUILD__: JSON.stringify(buildStamp) },
  logLevel: 'info'
});



// 빌드할 목록은 **손으로 적지 않는다.**
// 예전에는 여기에 200여 줄이 있었는데, 여러 세션이 같은 파일을 고치다 다른 작업이 이 파일을
// 통째로 다시 쓰면서 줄이 조용히 사라졌다 — 충돌 표시도 없이. 소스도 검사도 배포도 멀쩡한데
// 실서비스의 로그인이 죽어 있었다. 없는 줄은 사라질 수 없으므로, 목록을 없앴다.
// 대신 **화면이 실제로 부르는 곳**에서 뽑는다 (scripts/entry-points.mjs 의 주석 참고).
// 형식이 다른 넷은 위에서 직접 다뤘으므로 뺀다.
const SPECIAL = new Set(['src/mdd.ts', 'src/gemini.ts', 'src/toolbox.ts', 'src/sw.ts']);
const { entryPoints, missing } = discoverEntryPoints(root, SPECIAL);
if (missing.length) {
  // 부르는데 소스가 없다 = 그 화면은 반드시 죽는다. 여기서 세우는 편이 배포 뒤 404 보다 낫다.
  console.error('[build] 부르는데 소스가 없는 파일:\n  - ' + missing.join('\n  - '));
  process.exit(1);
}
console.log(`[build] 자동으로 찾은 묶음 대상 ${entryPoints.length}개`);

for (const rel of entryPoints) {
  const outfile = rel.replace(/^src\//, 'js/').replace(/\.ts$/, '.js');
  await esbuild.build({
    entryPoints: [join(root, rel)],
    outfile: join(root, outfile),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    logLevel: 'info'
  });
}

const worldEntryPoints = [
  'src/world/world.ts',
  'src/world/parse-md.ts',
  'src/world/load-characters-from-wiki.ts',
  'src/world/load-adventures-from-wiki.ts'
];
for (const rel of worldEntryPoints) {
  const outfile = rel.replace(/^src\/world\//, 'world/').replace(/\.ts$/, '.js');
  await esbuild.build({
    entryPoints: [join(root, rel)],
    outfile: join(root, outfile),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    logLevel: 'info'
  });
}
