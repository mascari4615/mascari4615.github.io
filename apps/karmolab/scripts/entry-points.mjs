/**
 * 빌드할 파일 목록을 **부르는 곳에서 뽑는다** (TASK-KL-098).
 *
 * 왜 있나: 예전에는 `build.mjs` 안에 손으로 적은 목록 200여 줄이 있었다. 여러 세션이 같은
 * 파일을 동시에 고치다 보니, 다른 작업이 이 파일을 통째로 다시 쓰면서 **내 줄이 조용히
 * 사라졌다** — 충돌 표시도 안 났다(git 입장에선 정상적인 삭제였다). 소스는 멀쩡하고
 * 검사도 배포도 초록인데 실서비스의 로그인이 죽어 있었다.
 *
 * 그래서 목록을 없앴다. 없는 줄은 사라질 수 없다.
 * 대신 **화면이 실제로 부르는 것**에서 뽑는다:
 *   ① HTML 의 `<script src="/apps/karmolab/js/…">`
 *   ② 위젯 부트 목록 (`widgets-manifest.ts`)
 *   ③ 지연 위젯의 스크립트 경로 (`widgets-lazy-meta.ts` 의 lazyScriptPaths)
 *
 * 새 위젯을 넣으면 그 둘 중 하나에는 반드시 등록해야 화면에 나온다 — 그러니 등록만 하면
 * 빌드도 따라온다. 「빌드에 넣는 걸 깜빡」이라는 사고 자체가 없어진다.
 *
 * 여기서 안 뽑는 것 = 형식이 다른 몇 개(`mdd`/`gemini`/`toolbox` 는 묶지 않는 esm,
 * `sw` 는 빌드 스탬프를 박는다)와 `src/world/` (다른 폴더로 나간다). 그건 build.mjs 가 직접 다룬다.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * HTML 안에서 우리 js 를 가리키는 주소.
 * `<script src>` 만 보면 안 된다 — 알람 화면은 태그가 아니라 코드로 넣는다
 * (`s.src = '/apps/karmolab/js/alarm-fire.js'`). 그래서 주소 모양만 본다.
 */
const SCRIPT_RE = /["']\/apps\/karmolab\/js\/([^"']+)\.js["']/g;

function htmlPages(root) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 2) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'js' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith('.html')) found.push(full);
    }
  };
  walk(root, 0);
  return found;
}

/**
 * 위젯 등록 파일 두 개에서 경로를 뽑는다.
 * 두 파일 다 TypeScript 지만 우리가 필요한 건 문자열 목록뿐이라, 실행하지 않고 읽어서 뽑는다
 * (빌드 전이라 아직 js 가 없을 수 있다 — 실행에 기대면 첫 빌드가 깨진다).
 */
function widgetPathsFrom(root) {
  const paths = new Set();

  const manifest = path.join(root, 'src/widgets-manifest.ts');
  if (fs.existsSync(manifest)) {
    const body = fs.readFileSync(manifest, 'utf8');
    const boot = /KARMOLAB_WIDGETS_BOOT\s*=\s*\[([\s\S]*?)\]/.exec(body);
    if (boot) for (const m of boot[1].matchAll(/'([^']+)'/g)) paths.add(m[1]);
  }

  const lazy = path.join(root, 'src/widgets-lazy-meta.ts');
  if (fs.existsSync(lazy)) {
    const body = fs.readFileSync(lazy, 'utf8');
    for (const block of body.matchAll(/lazyScriptPaths:\s*\[([\s\S]*?)\]/g)) {
      for (const m of block[1].matchAll(/'([^']+)'/g)) paths.add(m[1]);
    }
  }

  return paths;
}

/** `src/` 아래 모든 TypeScript (world 제외 — 그쪽은 build.mjs 가 따로 다룬다). */
function allSources(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (rel !== 'src/world') walk(rel);
      } else if (entry.name.endsWith('.ts')) found.push(rel);
    }
  };
  walk('src');
  return found;
}

/**
 * 묶어서 iife 로 내보낼 소스 목록 (`src/…` 상대경로, 정렬됨).
 * @param {string} root apps/karmolab 절대경로
 * @param {Set<string>} skip 형식이 달라 build.mjs 가 직접 다루는 것 (`src/mdd.ts` 등)
 */
export function discoverEntryPoints(root, skip = new Set()) {
  const rels = new Set();

  for (const page of htmlPages(root)) {
    const html = fs.readFileSync(page, 'utf8');
    for (const match of html.matchAll(SCRIPT_RE)) {
      // `js/vendor/…` 는 남이 만든 것을 그대로 두는 자리다 — 우리 소스가 아니다.
      if (match[1].startsWith('vendor/')) continue;
      rels.add(`src/${match[1]}.ts`);
    }
  }

  for (const rel of widgetPathsFrom(root)) {
    // toolbox.ts 의 `resolveScriptPath` 와 같은 규약으로 푼다 (한쪽만 바뀌면 빌드가 어긋난다).
    if (rel.startsWith('world/')) continue; // build.mjs 의 world 묶음이 따로 다룬다
    if (rel.startsWith('vendor/')) continue; // 남이 만든 것 — 우리 소스가 아니다
    if (rel.startsWith('root/')) rels.add(`src/${rel.slice('root/'.length)}.ts`);
    else rels.add(`src/widgets/${rel}.ts`);
  }

  /* 셸이 **실행 중에 뿌리 파일을 데려오는** 경우 — `ensureScript('root/home-scene')` (KL-128 ①-c).
   * 화면에 `<script>` 로 안 적혀 있으니 위 규칙으로는 안 잡힌다. 안 잡히면 그 파일이 아예
   * 안 만들어지고, 그런데 화면은 멀쩡히 뜬다 — 그 기능만 조용히 사라진다(장식이 안 뜬다). */
  for (const file of allSources(root)) {
    const body = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of body.matchAll(/ensureScript\(\s*['"]root\/([A-Za-z0-9_-]+)['"]/g)) {
      rels.add(`src/${match[1]}.ts`);
    }
  }

  // 위젯이 **실행 중에 형제 파일을 부르는** 경우 (tierlist·imageconvert 가 그렇게 한다:
  // `base + 'ui.js'`). 그 형제도 따로 만들어져야 하는데, 부르는 곳이 코드 안이라
  // 위 두 규칙으로는 안 잡힌다. 같은 폴더에 같은 이름의 소스가 있으면 그것이 답이다.
  for (const file of allSources(root)) {
    const dir = path.dirname(file);
    const body = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of body.matchAll(/['"`]([A-Za-z0-9_-]+)\.js['"`]/g)) {
      const sibling = `${dir}/${match[1]}.ts`;
      if (fs.existsSync(path.join(root, sibling))) rels.add(sibling);
    }
  }

  /* 빌드가 **만들어 내는** 파일은 소스가 없는 게 정상이다 (TASK-KL-128).
   * `widgets-index.js` 는 `build.mjs` 가 `widgets-lazy-meta.js` 에서 아이콘·설명을 빼서 만든다.
   * 이 예외가 없으면 「부르는데 소스가 없다」로 빌드가 선다 — 그런데 그건 진짜 사고가 아니다. */
  const GENERATED = new Set(['src/widgets-index.ts']);

  const found = [];
  const missing = [];
  for (const rel of [...rels].sort()) {
    if (skip.has(rel) || GENERATED.has(rel)) continue;
    if (fs.existsSync(path.join(root, rel))) found.push(rel);
    else missing.push(rel);
  }

  return { entryPoints: found, missing };
}
