/**
 * audit-wm-page: WM 페이지가 **등록되어 있는지** 빌드에서 못 박는다 (TASK-KL-158)
 *
 * 왜 이 검사가 생겼나: 2026-08-08, 여러 세션이 같은 파일 끝에 붙이다가 되감기(rebase)가
 * `widgets-lazy-meta.ts` 의 WM 줄 하나를 **조용히 먹었다**. 위젯 파일도 데이터도 멀쩡하고
 * 타입 검사도 초록이었는데, 화면에는 WM 페이지가 아예 없었다(주소로 들어가도 첫 화면).
 * 배선 한 줄이 빠진 것은 어떤 게이트도 안 잡는다 — 그래서 이 검사가 따로 있다.
 *
 * 무엇을 보나 (전부 「없으면 배포를 세운다」):
 *   ① 위젯 등록 줄(lazyScriptPaths 에 wm/wm)
 *   ② 위젯 소스와 구워진 묶음
 *   ③ 도감·소식·보드 데이터가 비어 있지 않은지
 *
 * 사용: node scripts/audit-wm-page.mjs
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// ① 등록 줄
const meta = read('src/widgets-lazy-meta.ts');
if (meta === null) problems.push('src/widgets-lazy-meta.ts 가 없다');
else if (!meta.includes("'wm/wm'")) problems.push("widgets-lazy-meta.ts 에 WM 페이지 등록(lazyScriptPaths: ['wm/wm'])이 없다 — 주소로 들어가도 첫 화면이 뜬다");

// ② 소스와 묶음
if (read('src/widgets/wm/wm.ts') === null) problems.push('src/widgets/wm/wm.ts 가 없다');
const bundle = read('js/widgets/wm/wm.js');
if (bundle === null) problems.push('js/widgets/wm/wm.js 가 없다 (build.mjs 가 안 돌았거나 등록이 빠졌다)');
const builtMeta = read('js/widgets-lazy-meta.js');
if (builtMeta !== null && !builtMeta.includes('wm/wm')) {
  problems.push('구워진 js/widgets-lazy-meta.js 에 WM 등록이 없다 — 소스만 고치고 다시 안 구웠다');
}

// ③ 데이터
for (const [rel, key, what] of [
  ['data/worldbook.json', 'docs', '세계 도감'],
  ['data/devlog.json', 'days', '소식'],
  ['data/wm-tasks.json', 'groups', '만드는 중'],
]) {
  const raw = read(rel);
  if (raw === null) { problems.push(`${rel} 이 없다 — ${what} 이 백지가 된다`); continue; }
  try {
    const json = JSON.parse(raw);
    if (!Array.isArray(json[key]) || json[key].length === 0) {
      problems.push(`${rel} 의 ${key} 가 비었다 — ${what} 이 백지가 된다`);
    }
  } catch (err) {
    problems.push(`${rel} 을 못 읽는다: ${err.message}`);
  }
}

if (problems.length > 0) {
  console.error('[wm-page] ❌ WM 페이지 배선이 끊겼다:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('[wm-page] OK — 등록·묶음·데이터 셋 다 있다');
