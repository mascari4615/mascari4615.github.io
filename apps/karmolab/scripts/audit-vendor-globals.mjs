/**
 * 남의 라이브러리를 쓰면서 **안 부르는** 도구를 찾는다 (TASK-KL-104)
 *
 * 왜 있나: 예전에는 셸이 무거운 라이브러리 몇 개를 **늘 먼저** 받아 뒀다. 그래서 도구들은
 * `CryptoJS` 같은 이름을 그냥 있는 셈 치고 썼다. 속도를 위해 그 eager 로드를 빼면서,
 * 자기 것을 스스로 부르지 않는 도구가 남았다.
 *
 * 이 고장은 **앱 안에서는 안 보인다**. 그 도구가 묶음의 탭이면 묶음이 대신 받아 주기 때문이다.
 * 오직 그 도구의 제 주소(`/karmolab/t/<id>/`)로 들어온 사람에게만 「라이브러리를 불러오지
 * 못했어요」가 뜬다 — 검색으로 들어오는 사람이 정확히 그 경로다.
 *
 * 보는 것: 도구 소스가 쓰는 라이브러리 이름마다, 그 도구가 자기 목록(lazyScriptPaths)에서
 * 그 파일을 부르는지. 안 부르면 빨강.
 *
 * 파일만 읽는다 — 0.2초. 배포 전에 끝난다.
 *
 * 사용: node scripts/audit-vendor-globals.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 전역 이름 → 그것을 담고 있는 스크립트 경로(앞머리 규약 그대로).
 * 새 라이브러리를 셸에서 뺄 때 여기에 한 줄 늘리면 그때부터 지켜진다.
 */
const VENDOR_GLOBALS = {
  CryptoJS: 'vendor/crypto-js.min',
  JSZip: 'vendor/jszip.min',
  marked: 'vendor/marked.min',
  Gemini: 'root/gemini',
};

/** lazy-meta 에서 도구별 목록을 뽑는다 (실행하지 않고 읽어서 — 빌드 전에도 돌아야 한다). */
function toolsFromMeta() {
  const body = fs.readFileSync(path.join(root, 'src/widgets-lazy-meta.ts'), 'utf8');
  const out = [];
  for (const block of body.split(/\n\s*\{\s*\n/)) {
    const id = /id:\s*'([^']+)'/.exec(block);
    if (!id) continue;
    const paths = [];
    const lp = /lazyScriptPaths:\s*\[([\s\S]*?)\]/.exec(block);
    if (lp) for (const m of lp[1].matchAll(/'([^']+)'/g)) paths.push(m[1]);
    out.push({ id: id[1], paths });
  }
  return out;
}

/** 셸이 아직 먼저 받아 주는 것은 검사 대상이 아니다 — 그건 없어도 도니까. */
function eagerInShell() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  return Object.entries(VENDOR_GLOBALS)
    .filter(([, p]) => html.includes(p.replace(/^vendor\//, 'js/vendor/').replace(/^root\//, 'js/')))
    .map(([g]) => g);
}

const eager = eagerInShell();
const problems = [];

for (const tool of toolsFromMeta()) {
  // 그 도구가 실제로 쓰는 소스 파일들 (제 목록에 적힌 것 중 우리 코드)
  const sources = tool.paths
    .filter((p) => !p.startsWith('vendor/') && !p.startsWith('world/'))
    .map((p) => (p.startsWith('root/') ? `src/${p.slice(5)}.ts` : `src/widgets/${p}.ts`))
    .filter((f) => fs.existsSync(path.join(root, f)));
  if (!sources.length) continue;

  const body = sources.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');

  for (const [globalName, scriptPath] of Object.entries(VENDOR_GLOBALS)) {
    if (eager.includes(globalName)) continue;
    /* 「쓴다」의 기준은 **이름이 나온다** 가 아니다. 그렇게 봤더니 `const marked = …` 같은
     * 제 변수 이름이 라이브러리로 오인돼 멀쩡한 도구 둘이 빨갛게 나왔다.
     * 라이브러리를 쓰는 모양은 셋뿐이다: 점 찍어 부르기 · new 로 만들기 · 있는지 확인하기.
     * 그리고 같은 이름을 **자기가 선언한** 파일은 제외한다 (그건 남의 라이브러리가 아니다). */
    const code = body.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    const declaresOwn = new RegExp(`(?:const|let|var|function)\\s+${globalName}\\b`).test(code);
    if (declaresOwn) continue;
    const uses = new RegExp(
      `\\b${globalName}\\s*\\.|new\\s+${globalName}\\b|typeof\\s+${globalName}\\b|window\\.${globalName}\\b`
    ).test(code);
    if (!uses) continue;
    // 「부른다」 = 제 목록에 그 파일이 있거나, 코드가 직접 받아 온다.
    const declared = tool.paths.includes(scriptPath);
    // `ensureScript?.(…)` 도 부르는 것이다. 물음표를 빼먹었더니 제대로 부르는 도구 열 개가
    // 몽땅 빨갛게 나왔다 — 검사가 틀리면 진짜 한 건이 그 속에 묻힌다.
    const esc = scriptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const fetchesItself = new RegExp(`ensureScript\\??\\.?\\([^)]*${esc}`).test(body);
    if (!declared && !fetchesItself) {
      problems.push(`${tool.id}: 「${globalName}」 를 쓰는데 아무도 안 부른다 — 제 주소로 들어오면 죽는다 (목록에 '${scriptPath}' 를 넣거나 코드에서 직접 받아라)`);
    }
  }
}

if (problems.length) {
  console.error(`[audit-vendor-globals] 문제 ${problems.length}건 — 앱 안에서는 묶음이 대신 받아 줘서 안 보인다`);
  problems.forEach((x) => console.error('  - ' + x));
  process.exit(1);
}
console.log(`[audit-vendor-globals] 라이브러리 ${Object.keys(VENDOR_GLOBALS).length}종 · 안 부르고 쓰는 도구 0`);
