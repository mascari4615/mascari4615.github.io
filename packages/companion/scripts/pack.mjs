/**
 * 동반자를 **소스 없이 쓸 수 있는 꾸러미**로 묶는다 (TASK-KAR-227).
 *
 * 왜: 지금 동반자는 저장소 안에서만 돈다 — 프로그램만 깐 사람에게는 깔 대상도 방법도 없다.
 * 그런데 실제로 필요한 것은 몇 MB 뿐이었다(실측: 제 코드 1MB + 꼭 필요한 꾸러미 ~1MB).
 * 1.2GB 는 **뜻 기억(transformers+onnxruntime) 하나가 85%**였고 그건 없어도 말하고 듣는다.
 *
 * 그래서 여기서 하는 일은 「빼는 것」이다:
 * - Node 런타임은 **안 넣는다.** 게임의 필수 구성 요소처럼 사람이 깐다 (조수님 결정)
 * - 뜻 기억·3D 몸은 **안 넣는다.** 나중에 「설치」 화면에서 고르는 선택물이다
 * - 개발용(typescript·playwright)은 **안 넣는다**
 *
 *   node scripts/pack.mjs [나갈자리]
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = process.argv[2] ?? join(root, 'pack');

/** 꼭 있어야 도는 것만. 여기 없는 것은 안 들어간다 — 넣는 목록이지 빼는 목록이 아니다. */
const CODE = ['dist', 'demo', 'characters', 'package.json', 'README.md'];

/** 실행에 쓰는 곁딸린 파일. 3D 몸 동작(6.4MB)은 선택물이라 뺀다. */
const ASSET_SKIP = new Set(['anim']);

/**
 * 런타임에 진짜 부르는 꾸러미. **여기 적은 것은 뿌리일 뿐이고, 그것들이 부르는 것은
 * 기계가 따라간다.**
 *
 * 처음엔 이 목록만 복사했다가 저장소 밖에서 바로 죽었다 — `msedge-tts` 가 `axios` 를
 * 부르는데 그건 이 목록에 없었다(2026-08-19 실측). 사람이 「무엇이 무엇을 부르나」를
 * 손으로 세면 반드시 하나 빠지고, 빠진 것은 **남의 컴퓨터에서만** 드러난다.
 */
const ROOT_DEPS = ['fflate', 'msedge-tts', '@karmo/ai', 'ws'];

/** 안 넣을 것 — 선택물(있으면 좋고 없어도 도는 것)과 개발용. */
const OPTIONAL = new Set(['@huggingface/transformers', 'three', 'onnxruntime-node', 'onnxruntime-web', 'sharp', '@img']);

/** 뿌리에서 시작해 `dependencies` 를 따라가며 실제로 필요한 꾸러미를 모은다. */
function collectDeps(nodeModules, roots) {
  const need = new Set();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift();
    if (need.has(name) || OPTIONAL.has(name)) continue;
    const dir = join(nodeModules, name);
    if (!existsSync(dir)) continue;
    need.add(name);
    try {
      const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      for (const dep of Object.keys(meta.dependencies ?? {})) queue.push(dep);
      // optionalDependencies 는 없어도 도는 것이라 안 따라간다.
    } catch {
      /* package.json 이 없는 꾸러미도 있다 — 그건 그 자체로 끝이다 */
    }
  }
  return [...need];
}

function size(dir) {
  let total = 0;
  const walk = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, name.name);
      if (name.isDirectory()) walk(full);
      else total += statSync(full).size;
    }
  };
  if (existsSync(dir)) walk(dir);
  return total;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)}MB`;

if (existsSync(join(root, 'dist')) === false) {
  console.error('먼저 구워라: npm run build');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const rel of CODE) {
  const from = join(root, rel);
  if (!existsSync(from)) continue;
  cpSync(from, join(out, rel), { recursive: true });
}

// assets — 선택물 빼고
mkdirSync(join(out, 'assets'), { recursive: true });
for (const name of readdirSync(join(root, 'assets'), { withFileTypes: true })) {
  if (ASSET_SKIP.has(name.name)) continue;
  cpSync(join(root, 'assets', name.name), join(out, 'assets', name.name), { recursive: true });
}

/* 꾸러미는 **중첩 사본 없이** 얹는다. 실측에서 `@karmo/ai` 가 25.5MB 였는데 제 코드는
   0.2MB 였다 — 나머지는 제 안에 또 담긴 사본이었다. 그걸 그대로 복사하면 없어도 되는
   19MB(sharp)까지 따라온다. */
const nm = join(out, 'node_modules');
mkdirSync(nm, { recursive: true });
const KEEP_DEPS = collectDeps(join(root, 'node_modules'), ROOT_DEPS);
const skipped = [];
for (const dep of KEEP_DEPS) {
  const from = join(root, 'node_modules', dep);
  if (!existsSync(from)) {
    skipped.push(dep);
    continue;
  }
  cpSync(from, join(nm, dep), {
    recursive: true,
    filter: (src) => !relative(from, src).split(/[\\/]/).includes('node_modules'),
  });
}

// 꾸러미 표는 배포판 것으로 다시 적는다 — 선택물이 「필수」로 남아 있으면 설치가 1GB 를 끌어온다.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    {
      name: pkg.name,
      version: pkg.version,
      private: true,
      type: pkg.type,
      main: pkg.main,
      description: pkg.description,
      dependencies: Object.fromEntries(ROOT_DEPS.filter((d) => pkg.dependencies?.[d]).map((d) => [d, pkg.dependencies[d]])),
      optionalDependencies: {
        '@huggingface/transformers': pkg.dependencies?.['@huggingface/transformers'] ?? '*',
        three: pkg.dependencies?.three ?? '*',
      },
      scripts: { start: 'node demo/face.mjs', live: 'node scripts/live.mjs' },
    },
    null,
    2,
  ) + String.fromCharCode(10),
  'utf8',
);

cpSync(join(root, 'scripts', 'live.mjs'), join(out, 'scripts', 'live.mjs'), { recursive: true });
cpSync(join(root, 'scripts', 'get-voice.mjs'), join(out, 'scripts', 'get-voice.mjs'), { recursive: true });
cpSync(join(root, 'scripts', 'start.cmd'), join(out, 'scripts', 'start.cmd'), { recursive: true });
cpSync(join(root, 'scripts', 'check-node.mjs'), join(out, 'scripts', 'check-node.mjs'), { recursive: true });

/* **받은 사람이 처음 보는 글.** 저장소 README 는 만드는 사람 것이라 여기선 쓸모가 없다 —
   「어디에 뭐가 있나」가 아니라 「무엇을 누르면 되나」가 필요하다. */
writeFileSync(
  join(out, '읽어주세요.txt'),
  [
    '동반자 — 곁에 있는 존재',
    '',
    '1. Node 가 필요하다 (20 이상). 없으면: https://nodejs.org 에서 LTS',
    '   게임의 「필수 구성 요소」와 같은 자리다. 이 꾸러미에는 안 들어 있다.',
    '',
    '2. scripts\\start.cmd 를 두 번 누른다.',
    '   Node 가 없으면 그 창이 어디서 받는지 알려 준다.',
    '',
    '3. 화면은 http://localhost:4620 에서 열린다.',
    '   companion-window.exe 가 같이 있으면 창틀 없는 창으로 뜬다.',
    '',
    '없어도 도는 것들 (있으면 더 좋다):',
    '  · 내 컴퓨터 목소리 · 흉내 낸 목소리 · 받아쓰기 · 3D 몸 · 뜻 기억',
    '  없으면 인터넷 목소리로 말하고, 나머지는 조용히 물러선다.',
    '',
    '두뇌는 claude CLI 를 쓴다. 없으면 COMPANION_BRAIN=echo 로 움직임만 볼 수 있다.',
  ].join(String.fromCharCode(10)) + String.fromCharCode(10),
  'utf8',
);

console.log(`[pack] 나갈 자리: ${out}`);
for (const part of ['dist', 'demo', 'assets', 'node_modules', 'scripts', 'characters']) {
  console.log(`  ${part.padEnd(14)} ${mb(size(join(out, part)))}`);
}
console.log(`  ${'합계'.padEnd(13)} ${mb(size(out))}`);
if (skipped.length) console.log(`[pack] 못 찾은 꾸러미: ${skipped.join(', ')} (npm i 먼저)`);
console.log('[pack] Node 런타임은 안 들어 있다 — 쓰는 쪽에서 깐다 (필수 구성 요소).');
