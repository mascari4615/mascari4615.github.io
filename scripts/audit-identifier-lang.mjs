#!/usr/bin/env node
/**
 * **식별자는 영문**. 한글 식별자가 늘어나는 것을 막는다 (2026-08-20)
 *
 * 왜 이 게이트가 있나: 룰이 문서에만 있으면 지켜지지 않는다. 실제로 그렇게 됐다 . 
 * 세션이 `scripts/audit-sitemap-lastmod.mjs` 에 검사 한 절을 붙이며 한글로 이름을 지었는데,
 * 그 파일에 이미 한글 식별자가 있어서 **주변 코드와 같은 관용을 따르라는 일반 지침을 따른
 * 결과** 위반했다. 사람이 매번 눈으로 잡을 수 없으니 기계가 막는다.
 * 룰 정본 = `memo/rules/code-style.md § 코드 방향성` (식별자는 영문).
 *
 * 왜 0 이면 통과가 아니라 래칫인가: 지금 존량이 수천 곳이다. 0 을 요구하면 오늘 당장 모든
 * 세션의 push 가 막힌다. 그래서 **늘면 빨강, 줄면 초록**으로 둔다. 존량을 비워 0 이 되면
 * 베이스라인도 0 이 되고, 그때부터는 그냥 하나라도 있으면 빨강이다.
 *
 * ⚠ **정규식으로 세지 마라.** 처음엔 주석, 문자열을 손으로 걷어내고 남은 한글을 셌는데,
 * 템플릿 문자열 안에서 상태가 어긋나면 그 뒤가 통째로 어긋난다. 실측으로 7,718곳이 나왔고
 * 표본을 열어 보니 대부분 **화면에 뿌리는 한국어 문구**였다(`apps/daily/app.mjs` 의 `그림 받는 중...`
 * 따위). 잘못된 잣대로 잠그면 잠근 것이 아니다. 그래서 TypeScript 의 파서로 **식별자 노드만**
 * 집는다. 문자열, 주석, JSX 글자는 애초에 식별자가 아니므로 걸리지 않는다.
 *
 * 무엇을 세나: 식별자 노드 + 속성 이름 중 한글이 든 것. 세는 단위는 **줄이 아니라 이름 한 개**다.
 * 주석, 로그 문구, 커밋 메시지의 한국어는 그대로 둔다. 이 룰은 식별자에만 걸린다.
 *
 * 씀: node scripts/audit-identifier-lang.mjs         . 잰다
 *     node scripts/audit-identifier-lang.mjs --list  . 파일별로 몇 개인지
 *     node scripts/audit-identifier-lang.mjs --update. 줄어든 만큼 베이스라인을 낮춘다
 * 나감값: 0 = 안 늘었다 / 1 = 늘었다 / 2 = 못 쟀다(CANNOT-RUN)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const baselineFile = path.join(root, 'data', 'identifier-lang-baseline.json');
const HANGUL = /[가-힣]/;
const EXTS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);

/* 생성물, 외부 코드는 세지 않는다. 사람이 이름을 짓는 자리가 아니다. */
const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)_site\//,
  /(^|\/)target\//,
  /(^|\/)assets\/js\/dist\//,
  /\.min\.(js|mjs)$/,
  /(^|\/)apps\/karmolab\/js\//, /* 빌드 산출물 */
];

/* 파서는 karmolab 이 이미 쓰는 것을 빌려 쓴다. 이 검사 하나 때문에 의존성을 늘리지 않는다. */
const require_ = createRequire(import.meta.url);
let ts;
try {
  ts = require_(path.join(root, 'apps/karmolab/node_modules/typescript/lib/typescript.js'));
} catch (e) {
  console.error(`[identifier-lang] CANNOT-RUN: TypeScript 파서를 못 찾았다. ${e.message}`);
  console.error('  → apps/karmolab 에서 `npm ci` 를 먼저 돌려라.');
  process.exit(2);
}

let files;
try {
  files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n')
    .filter((f) => f !== '')
    .filter((f) => EXTS.has(path.extname(f)))
    .filter((f) => !SKIP.some((re) => re.test(f)));
} catch (e) {
  console.error(`[identifier-lang] CANNOT-RUN: git ls-files 실패. ${e.message}`);
  process.exit(2);
}

/* 볼 파일이 하나도 없으면 전부 통과가 아니라 못 쟀다다. 걸러내기가 과했다는 뜻이다. */
if (files.length === 0) {
  console.error('[identifier-lang] CANNOT-RUN: 볼 파일이 0개다. SKIP 목록이 과하거나 저장소가 비었다.');
  process.exit(2);
}

const hits = [];
for (const rel of files) {
  let src;
  try {
    src = fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    continue;
  }
  if (!HANGUL.test(src)) continue; /* 대부분 여기서 끝난다. 파싱은 필요한 파일에만 */

  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, /* setParentNodes */ false, ts.ScriptKind.TSX);
  const visit = (node) => {
    /* 이름을 담는 노드만 본다. 문자열 리터럴로 쓴 속성 이름(`{'가': 1}`)은 자료로 보고 넘긴다 . 
       그건 이름을 지은 것이 아니라 값을 적은 것이다. */
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) {
      const text = node.escapedText?.toString() ?? node.text ?? '';
      if (HANGUL.test(text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        hits.push({ file: rel, line: line + 1, name: text });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}

const count = hits.length;
const byFile = new Map();
for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1);

if (process.argv.includes('--list')) {
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(5)}  ${file}`);
}

let baseline;
let baselineByFile = new Map();
if (fs.existsSync(baselineFile)) {
  const saved = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
  baseline = saved.count;
  baselineByFile = new Map(Object.entries(saved.byFile ?? {}));
} else if (process.argv.includes('--update')) {
  baseline = count;
} else {
  console.error(`[identifier-lang] CANNOT-RUN: 베이스라인이 없다. ${path.relative(root, baselineFile)}`);
  console.error('  → 처음 다는 것이면 `node scripts/audit-identifier-lang.mjs --update` 로 세워라.');
  process.exit(2);
}

if (process.argv.includes('--update')) {
  fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify(
      {
        note: '한글 식별자 개수. 늘면 빨강. 줄었으면 --update 로 낮춰라. 목표는 0.',
        count,
        files: byFile.size,
        /* 파일별로도 적어 둔다. 총계만 있으면 늘었다고만 알려 줄 뿐 **어디가** 늘었는지를 못 짚는다.
           그러면 사람이 남의 줄을 쫓는다(첫 판에서 실제로 그랬다). */
        byFile: Object.fromEntries([...byFile].sort((a, b) => (a[0] < b[0] ? -1 : 1))),
      },
      null,
      2
    )}\n`,
    'utf8'
  );
  console.log(`[identifier-lang] 베이스라인 ${baseline} → ${count} (파일 ${byFile.size}개)`);
  process.exit(0);
}

if (count > baseline) {
  console.error(`[identifier-lang] 한글 식별자가 늘었다. ${baseline} → ${count} (+${count - baseline})`);
  /* **늘어난 파일만** 보여 준다. 전체 목록을 뿌리면 남의 줄을 쫓게 된다. */
  const grown = [...byFile]
    .map(([file, n]) => [file, n - (baselineByFile.get(file) ?? 0)])
    .filter(([, delta]) => delta > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [file, delta] of grown.slice(0, 10)) {
    console.error(`  +${delta}  ${file}`);
    for (const h of hits.filter((x) => x.file === file).slice(0, 5)) console.error(`        ${h.line}: ${h.name}`);
  }
  if (grown.length > 10) console.error(`  ... 그 외 파일 ${grown.length - 10}개`);
  console.error('  → 식별자는 영문으로 지어라 (memo/rules/code-style.md § 코드 방향성).');
  console.error('  → 주석, 로그 문구의 한국어는 그대로 둬도 된다. 이 검사는 이름만 센다.');
  console.error('  → 어디인지 전부 보려면: node scripts/audit-identifier-lang.mjs --list');
  process.exit(1);
}

if (count < baseline) {
  console.log(`[identifier-lang] ${count}개 (베이스라인 ${baseline}. ${baseline - count}개 줄었다)`);
  console.log('  → 줄인 만큼 잠가라: node scripts/audit-identifier-lang.mjs --update');
  process.exit(0);
}

console.log(`[identifier-lang] ${count}개, 파일 ${byFile.size}개. 베이스라인 그대로`);
process.exit(0);
