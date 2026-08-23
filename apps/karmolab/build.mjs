/**
 * Emit browser scripts from src/ into js/ (mirrors paths under src/), and src/lib/karmoworld → ../world/ (wiki loaders; 출력 주소는 그대로 /apps/karmolab/world/*.js).
 * - Most entries: bundle + iife (type-only imports resolve).
 * - mdd.ts / gemini.ts / toolbox.ts: bundle false + esm so top-level globals stay visible (no extra IIFE).
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { execFileSync } from 'node:child_process';
import { discoverEntryPoints } from './scripts/entry-points.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;

/**
 * 내보내는 코드를 줄인다 (TASK-KL-128).
 *
 * 그동안 하나도 안 줄이고 내보내고 있었다 — 주석과 들여쓰기까지 그대로 사용자 회선으로 갔다.
 * 위젯만 3.3MB, 셸 스크립트가 76KB 다. 압축이 걸려 있어도 푸는 시간과 해석하는 시간은 남는다.
 *
 * 다만 **이름까지 줄이면 안 되는 파일**이 있다: `toolbox.js`·`mdd.js`·`gemini.js` 는 묶지 않고
 * 내보내 화면이 `<script>` 로 그냥 읽는다. 그래서 맨 바깥에 선언한 이름(`Toolbox` 등)이 곧
 * 전역 이름이다 — 이걸 짧게 바꾸면 다른 파일이 그 이름을 못 찾는다. 그 셋은 **빈칸과 문법만**
 * 줄이고 이름은 그대로 둔다. 나머지는 IIFE 로 감싸 나가므로 바깥에서 이름을 볼 일이 없다.
 */
const SAFE_MINIFY = { minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false };
const FULL_MINIFY = { minify: true };

/* 구글 연동(플래너)용 클라이언트 id — **비밀이 아니다.** OAuth 클라이언트 id 는 브라우저가
 * 구글에 보내는 값이라 어차피 화면에서 보인다(비밀은 secret 쪽이고 우리는 그걸 안 쓴다).
 * 다만 사람마다 다른 값이라 코드에 박지 않고 빌드할 때 넣는다. 없으면 플래너가 연동 대신
 * 「환경 변수를 넣어라」 안내를 띄운다 — 빌드가 서지는 않는다 (TASK-KL-321). */
const googleClientId = process.env.GOOGLE_CLIENT_ID || '';

await esbuild.build({
  entryPoints: [join(root, 'src/mdd.ts')],
  outfile: join(root, 'js/mdd.js'),
  ...SAFE_MINIFY,
  bundle: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

await esbuild.build({
  entryPoints: [join(root, 'src/gemini.ts')],
  outfile: join(root, 'js/gemini.js'),
  ...SAFE_MINIFY,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info',
  // Entry has no exports; tree-shaking can strip the Gemini/ImageDB IIFEs after adding an import.
  treeShaking: false
});

// 이 판(배포)의 표식 — 위젯 묶음 주소에 붙여 「한 번 받은 것은 그대로」로 둘 수 있게 한다.
// 서비스 워커가 쓰는 값과 **같은 값**이어야 한다 (아래 sw 빌드와 같은 변수를 쓴다).
const buildStamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
// 이 판 표식을 파일로도 남긴다 — 도구 페이지 생성기가 **같은 값**으로 미리받기 주소를 만든다.
// (두 값이 어긋나면 같은 위젯을 두 번 받는다. 실측으로 그랬다.)
writeFileSync(join(root, '.build-stamp'), buildStamp, 'utf8');

/* 「올린 것이 진짜 사람 화면에 닿았나」를 기계가 물어볼 수 있게 표식을 **주소로** 내놓는다
 * (TASK-KL-124). 여태는 올렸다는 사실까지만 알았다 — 실제로 옛 판이 계속 서빙되는 걸
 * 한참 뒤에 눈으로 발견한 적이 있다. 이 파일이 있으면 배포 뒤에 한 번 물어보면 끝난다.
 * 시각 표식만으로는 「어느 커밋인지」를 알 수 없어 커밋도 같이 적는다. */
const buildCommit = (() => {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown'; // git 이 없는 곳에서 빌드해도 빌드는 계속돼야 한다
  }
})();
writeFileSync(
  join(root, 'build.json'),
  JSON.stringify({ stamp: buildStamp, commit: buildCommit, builtAt: new Date().toISOString() }, null, 2) + '\n',
  'utf8',
);

/* 첫 화면이 다 뜬 뒤에 하는 잔일(글꼴·방문 기록) — 인라인에서 밖으로 뺀 것.
   왜 밖인가 = `src/boot-late.ts` 머리말(자물쇠로 가는 길). */
await esbuild.build({
  entryPoints: [join(root, 'src/boot-late.ts')],
  outfile: join(root, 'js/boot-late.js'),
  ...SAFE_MINIFY,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});

await esbuild.build({
  entryPoints: [join(root, 'src/toolbox.ts')],
  outfile: join(root, 'js/toolbox.js'),
  // 커밋도 같이 박는다 — 머리띠의 판 표식 배지가 「지금 돌고 있는 코드가 어느 판인가」를
  // 서버에 묻지 않고 답하려면, 값이 **번들 안에** 있어야 한다 (KL 버전 표시).
  define: {
    __KARMOLAB_BUILD__: JSON.stringify(buildStamp),
    __KARMOLAB_COMMIT__: JSON.stringify(buildCommit),
  },
  ...SAFE_MINIFY,
  bundle: false,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  logLevel: 'info'
});




// Service Worker + 갱신 안내 (TASK-KL-088).
// 캐시 이름에 빌드 스탬프를 박아야 새 배포가 옛 캐시를 버린다 → sw 는 소스가 아니라 빌드 산출물.

// 셸 스타일을 「막는 것 / 뒤로 뺀 것」 두 벌로 뽑는다 (TASK-KL-128 ④-b).
// 정본(`css/toolbox.css`)은 읽기만 한다 — 누가 그걸 고쳐도 다음 빌드에 그대로 반영된다.
await import('./scripts/split-css.mjs');

await esbuild.build({
  entryPoints: [join(root, 'src/sw.ts')],
  outfile: join(root, 'sw.js'),
  ...FULL_MINIFY,
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
/* ★ `src/widgets-lazy-meta.ts` 는 **셸이 안 부르지만 반드시 지어야 한다** (2026-08-12).
 *   아래 메타 가르기가 그 산출물(`js/widgets-lazy-meta.js`)을 읽어 가벼운 목록과 아이콘·설명을
 *   따로 낸다. KL-220 이 셸에서 그 script 태그를 빼자 「화면이 부르는 곳」에서 사라져 컴파일
 *   대상에서 빠졌고, 새 체크아웃에서는 그 파일이 없어 **배포가 ENOENT 로 죽었다**
 *   (내 기계에는 옛 산출물이 남아 있어 초록이었다 — 전형적인 「내 기계에선 된다」).
 *   부르는 곳이 화면이 아니라 **빌드**인 파일은 이렇게 손으로 붙여 둔다. */
if (!entryPoints.includes('src/widgets-lazy-meta.ts')) entryPoints.push('src/widgets-lazy-meta.ts');
console.log(`[build] 자동으로 찾은 묶음 대상 ${entryPoints.length}개`);

for (const rel of entryPoints) {
  const outfile = rel.replace(/^src\//, 'js/').replace(/\.ts$/, '.js');
  await esbuild.build({
    entryPoints: [join(root, rel)],
    outfile: join(root, outfile),
    // 판 표식은 **모든 번들이 같은 값**을 봐야 한다 — 로더와 셸이 다른 주소를 만들면
    // 같은 위젯을 두 번 받는다(실측으로 그랬다).
    define: {
      __KARMOLAB_BUILD__: JSON.stringify(buildStamp),
      __KARMOLAB_COMMIT__: JSON.stringify(buildCommit),
      __KARMOLAB_GOOGLE_CLIENT_ID__: JSON.stringify(googleClientId),
    },
    ...FULL_MINIFY,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    logLevel: 'info'
  });
}


/**
 * 위젯 메타를 **가벼운 것 / 무거운 것** 두 벌로 낸다 (TASK-KL-128 ③).
 *
 * 도구 한 개짜리 화면도 위젯 169개 메타를 통째로 받는다 — 원본 93KB. 그런데 그 안에서
 * 아이콘 그림이 41KB, 설명이 8KB 다. 첫 그림에 필요한 것은 **이름·분류·어디서 불러올지**뿐이고,
 * 아이콘·설명은 옆줄·찾기창이 그려질 때 필요하다.
 *
 * 그래서 한 벌 더 낸다: `widgets-index.js` = 같은 배열에서 아이콘·설명만 뺀 것.
 * **손으로 적는 곳은 그대로 한 곳(`src/widgets-lazy-meta.ts`)** — 여기서 기계가 갈라낸다.
 */
{
  const NL = String.fromCharCode(10);
  const metaPath = join(root, 'js/widgets-lazy-meta.js');
  const src = readFileSync(metaPath, 'utf8');
  const sandbox = { window: {} };
  runInNewContext(src, sandbox);
  const full = sandbox.window.KARMOLAB_LAZY_META;
  if (!Array.isArray(full) || !full.length) {
    console.error('[build] 위젯 메타를 못 읽었다 — widgets-lazy-meta.js 모양 확인');
    process.exit(1);
  }
  const lite = full.map(({ icon, desc, ...rest }) => rest);
  writeFileSync(
    join(root, 'js/widgets-index.js'),
    '/* `build.mjs` 가 `widgets-lazy-meta.js` 에서 아이콘·설명만 빼서 만든다 — 손으로 고치지 마라 (TASK-KL-128). */' + NL +
      'window.KARMOLAB_LAZY_META=' + JSON.stringify(lite) + ';window.KARMOLAB_META_LITE=1;' + NL,
    'utf8'
  );
  /* 가벼운 것을 먼저 받은 화면이 **나머지만** 이어 받게 한다. 전체를 한 벌 더 받으면
     첫 그림은 빨라져도 전송량이 그만큼 늘어난다(실측 +31KB). 아이콘·설명만 담아 그걸 없앤다. */
  const rest = {};
  for (const item of full) {
    if (!item || !item.id) continue;
    const only = {};
    if (item.icon) only.icon = item.icon;
    if (item.desc) only.desc = item.desc;
    if (Object.keys(only).length) rest[item.id] = only;
  }
  writeFileSync(
    join(root, 'js/widgets-meta-rest.js'),
    '/* `build.mjs` 가 만든다 — 가벼운 목록(widgets-index.js)에서 빠진 아이콘·설명만. 손으로 고치지 마라. */' + NL +
      'window.KARMOLAB_META_REST=' + JSON.stringify(rest) + ';' + NL,
    'utf8'
  );
  const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + 'KB';
  console.log(`[build] 위젯 메타 ${full.length}개 — 전체 ${kb(src)} · 가벼운 것 ${kb(readFileSync(join(root, 'js/widgets-index.js'), 'utf8'))} · 나머지 ${kb(readFileSync(join(root, 'js/widgets-meta-rest.js'), 'utf8'))}`);
}

/*
 * ★ **묶어 쓰기용 알맹이는 도구마다 한 파일** (2026-08-13, TASK-KL-205 빚 갚기).
 *
 * 묶어 쓰기(chain)는 「도구를 이어서 돌리는」 화면이라 서른다섯 알맹이를 **부를 수 있어야**
 * 한다. 예전에는 정적 표를 들여 전부를 자기 묶음에 실었다 — 250KB(gzip 87.7KB)로 위젯
 * 천장 64KB 의 1.4배였다. 그런데 이 저장소의 위젯 묶음은 IIFE 라 `import()` 를 써도 쪼개지지
 * 않고 그대로 안에 눌러 담긴다(실측: 바꿔 봤더니 92.9KB 로 오히려 늘었다).
 *
 * 그래서 이 저장소가 원래 쓰는 방식대로 **파일을 나눈다**: 알맹이 하나가 파일 하나가 되고,
 * 화면은 자기가 적은 단계에 나오는 것만 그때 받아 붙인다. 두어 개면 몇 KB 다.
 */
{
  const coreDir = join(root, 'src/core');
  const skip = new Set(['types.ts', 'registry.generated.ts', 'registry-lazy.generated.ts']);
  /* `run` 을 내놓는 것만 알맹이다 — 표(han-table.generated 같은 자료)는 부를 수 있는 것이 아니다. */
  const coreFiles = existsSync(coreDir)
    ? readdirSync(coreDir)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && !skip.has(f))
        .filter((f) => /export\s+(async\s+)?function\s+run|export\s+const\s+run/.test(readFileSync(join(coreDir, f), 'utf8')))
    : [];
  for (const f of coreFiles) {
    const id = f.replace(/\.ts$/, '');
    await esbuild.build({
      stdin: {
        contents:
          `import { run } from './src/core/${id}';
` +
          `const w = window;
` +
          `w.__KARMO_CORES = w.__KARMO_CORES || {};
` +
          `w.__KARMO_CORES[${JSON.stringify(id)}] = { run };
`,
        resolveDir: root,
        loader: 'ts'
      },
      outfile: join(root, `core/${id}.js`),
      ...FULL_MINIFY,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      logLevel: 'silent'
    });
  }
  if (coreFiles.length) console.log(`[build] 알맹이 ${coreFiles.length}개 → core/*.js (묶어 쓰기가 그때 받는다)`);
}

/*
 * ★ **오락실 게임은 한 판 한 파일** (TASK-KL-242 쪼개기).
 *
 * 로비만 열어도 게임 51개가 통째로 딸려 왔다 — `arcade.js` gzip 94.5KB, 위젯 천장 64KB 의 1.5배.
 * 알맹이(`core/*.js`) 와 같은 수법을 쓴다: 게임 하나가 파일 하나가 되고, 로비는 명패만 들고
 * 있다가 **누른 게임 하나만** 그때 받아 붙인다(`Toolbox.ensureScript`).
 *
 * 표는 `catalog.ts` 에서 구워 온다(`scripts/gen-arcade-catalog.mjs`) — 이름을 여기 또 적으면
 * 갈라진다.
 */
{
  const tablePath = join(root, 'src/widgets/arcade/chunks.generated.json');
  const table = existsSync(tablePath) ? JSON.parse(readFileSync(tablePath, 'utf8')) : [];
  for (const g of table) {
    await esbuild.build({
      stdin: {
        contents:
          `import { ${g.defVar} } from './src/widgets/arcade/games/${g.chunk}';
` +
          `import { ${g.viewVar} } from './src/widgets/arcade/games/${g.view}';
` +
          `const w = window;
` +
          `w.__ARCADE_GAMES = w.__ARCADE_GAMES || {};
` +
          `w.__ARCADE_GAMES[${JSON.stringify(g.id)}] = { def: ${g.defVar}, view: ${g.viewVar} };
`,
        resolveDir: root,
        loader: 'ts'
      },
      outfile: join(root, `arcade/games/${g.chunk}.js`),
      ...FULL_MINIFY,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      logLevel: 'silent'
    });
  }
  if (table.length) console.log(`[build] 오락실 게임 ${table.length}판 → arcade/games/*.js (누를 때 하나만 받는다)`);

  /*
   * ★ **입체 화면은 따로 굽는다** — 같은 규칙, 다른 표현.
   *
   * 규칙(`def`)은 이미 위 조각에 들어 있다. 여기서 굽는 것은 **그리는 법 하나**뿐이라,
   * 2D 로 노는 사람은 이 파일을 영영 안 받는다(3D 로 바꿀 때만 받아 온다).
   * 명부는 `chunks.generated.json` 의 `d3` — 그 값은 `<chunk>-view3d.ts` 실재 여부다.
   */
  const table3d = table.filter((g) => g.d3);
  for (const g of table3d) {
    await esbuild.build({
      stdin: {
        contents:
          `import { view3d } from './src/widgets/arcade/games/${g.chunk}-view3d';\n` +
          `const w = window;\n` +
          `w.__ARCADE_VIEWS3D = w.__ARCADE_VIEWS3D || {};\n` +
          `w.__ARCADE_VIEWS3D[${JSON.stringify(g.id)}] = view3d;\n`,
        resolveDir: root,
        loader: 'ts'
      },
      outfile: join(root, `arcade/games3d/${g.chunk}.js`),
      ...FULL_MINIFY,
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      logLevel: 'silent'
    });
  }
  if (table3d.length) console.log(`[build] 입체 화면 ${table3d.length}판 → arcade/games3d/*.js (3D 로 볼 때만 받는다)`);
}

const worldEntryPoints = [
  'src/lib/karmoworld/world.ts',
  'src/lib/karmoworld/parse-md.ts',
  'src/lib/karmoworld/load-characters-from-wiki.ts',
  'src/lib/karmoworld/load-adventures-from-wiki.ts'
];
for (const rel of worldEntryPoints) {
  const outfile = rel.replace(/^src\/lib\/karmoworld\//, 'world/').replace(/\.ts$/, '.js');
  await esbuild.build({
    entryPoints: [join(root, rel)],
    outfile: join(root, outfile),
    ...FULL_MINIFY,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    logLevel: 'info'
  });
}
