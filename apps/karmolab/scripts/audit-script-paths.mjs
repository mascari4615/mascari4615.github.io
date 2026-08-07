/**
 * 부팅 때 받는 스크립트 주소가 실제 파일과 맞는지 (TASK-KL-103)
 *
 * 왜 있나: 같은 규칙(앞머리 `world/`·`vendor/`·`root/` 를 어디서 찾을지)이 **세 곳에**
 * 따로 적혀 있었다. 그중 로더만 앞머리를 몰라서 늘 `js/widgets/` 밑을 뒤졌고, 있지도 않은
 * 주소를 받으러 갔다. 실패해도 그냥 넘어가게 돼 있어서 **화면은 멀쩡했다** — 페이지는 200,
 * 요소도 그려지고, 버튼을 눌러야 죽었다. 실서비스에서 도구 셋(암호화·개발 도구·이미지 편집)이
 * 몇 주 동안 그 상태였고 아무 검사도 빨개지지 않았다.
 *
 * 지금은 로더가 앱의 해석기를 그대로 부르므로 규칙은 두 벌뿐이다(브라우저 쪽 하나, 페이지를
 * 찍는 쪽 하나). 이 검사가 그 둘이 어긋나는 날을 잡는다.
 *
 * 보는 것: 부팅 목록에 오르는 모든 항목에 대해
 *  - 페이지 생성기가 미리 받으려는 주소에 파일이 실제로 있나
 *  - 브라우저가 만들 주소도 같은 파일을 가리키나 (두 규칙이 같은 답을 내나)
 *
 * 그림도 서버도 필요 없다 — 파일만 본다. 배포 전에 끝난다.
 *
 * 사용: node scripts/audit-script-paths.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/** 페이지를 찍는 쪽 규칙 (gen-tool-pages.mjs 의 scriptFile 과 같아야 한다). */
function fromGenerator(p) {
  if (p.startsWith('world/')) return `world/${p.slice('world/'.length)}.js`;
  if (p.startsWith('vendor/')) return `js/vendor/${p.slice('vendor/'.length)}.js`;
  if (p.startsWith('root/')) return `js/${p.slice('root/'.length)}.js`;
  return `js/widgets/${p}.js`;
}

/**
 * 브라우저 쪽 규칙 (toolbox.ts 의 resolveScriptPath 와 같아야 한다).
 * 소스에서 **읽어서** 확인한다 — 여기에 손으로 한 벌 더 적으면 이 검사 자체가 세 번째 사본이 된다.
 */
function browserRuleMatches() {
  const src = fs.readFileSync(path.join(root, 'src/toolbox.ts'), 'utf8');
  const missing = [];
  if (!/startsWith\('world\/'\)[\s\S]{0,200}?getWorldScriptBase\(\)/.test(src)) missing.push('world/');
  if (!/startsWith\('vendor\/'\)[\s\S]{0,200}?getJsScriptBase\(\) \+ 'vendor\/'/.test(src)) missing.push('vendor/');
  if (!/startsWith\('root\/'\)[\s\S]{0,200}?getJsScriptBase\(\)/.test(src)) missing.push('root/');
  return missing;
}

/** 로더가 제 주소를 손으로 붙이고 있지 않은지 — 그게 이 사고의 원인이었다. */
function loaderDelegates() {
  const src = fs.readFileSync(path.join(root, 'src/widgets-loader.ts'), 'utf8');
  return /Toolbox\.resolveScriptPath/.test(src) && !/s\.src\s*=\s*base\s*\+/.test(src);
}

/** 부팅 목록에 오를 수 있는 모든 항목 = 셸 부트 + 도구별 lazyScriptPaths */
function allBootPaths() {
  const out = new Set();
  const manifest = fs.readFileSync(path.join(root, 'src/widgets-manifest.ts'), 'utf8');
  const boot = /KARMOLAB_WIDGETS_BOOT\s*=\s*\[([\s\S]*?)\]/.exec(manifest);
  if (boot) for (const m of boot[1].matchAll(/'([^']+)'/g)) out.add(m[1]);

  const lazy = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');
  for (const block of lazy.matchAll(/lazyScriptPaths:\s*\[([\s\S]*?)\]/g)) {
    for (const m of block[1].matchAll(/'([^']+)'/g)) out.add(m[1]);
  }
  return [...out];
}

const problems = [];

if (!loaderDelegates()) {
  problems.push('로더가 주소를 제 손으로 붙이고 있다 — 앞머리를 모르는 그 규칙이 사고의 원인이었다');
}
for (const p of browserRuleMatches()) {
  problems.push(`브라우저 해석기에서 「${p}」 규칙이 사라졌다 — 그 앞머리를 쓰는 도구가 조용히 404 를 받는다`);
}

const paths = allBootPaths();
for (const p of paths) {
  const rel = fromGenerator(p);
  if (!fs.existsSync(path.join(root, rel))) {
    problems.push(`「${p}」 가 가리키는 파일이 없다 — ${rel}`);
  }
}

if (problems.length) {
  console.error(`[audit-script-paths] 문제 ${problems.length}건 — 받아도 없는 주소는 조용히 넘어간다(화면은 멀쩡해 보인다)`);
  problems.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log(`[audit-script-paths] 부팅 대상 ${paths.length}개 주소 OK · 로더가 앱 해석기를 쓴다`);
