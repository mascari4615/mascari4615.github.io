/**
 * 아직 안 빼낸 한국어 감시 — **더 늘지 않게 잠근다** (TASK-KL-203 S5)
 *
 * 사정: 화면에 나가는 글 21만 자가 코드 안에 한국어로 박혀 있다(300 파일). 이걸 한 번에 다
 * 빼내는 건 몇 주짜리 일이고, 그동안에도 새 위젯은 계속 늘어난다. 그러면 **빼내는 속도보다
 * 박히는 속도가 빨라져 영영 안 끝난다** — 다국어가 실패하는 가장 흔한 방식이다.
 *
 * 그래서 총량을 세고 **기준선을 박아 둔다**. 규칙은 하나: *어떤 파일도 기준선보다 늘 수 없다.*
 * 줄이는 건 언제든 환영이고(그때 기준선을 다시 박는다), 새 파일에 한국어 글을 박으면 그 자리에서
 * 멈춘다. 「지금 0으로 만들어라」가 아니라 「여기서부터는 늘지 마라」 — 그래야 사람이 검사를
 * 안 끄고, 숫자가 실제로 내려간다.
 *
 * 세는 것 = **글자열 안의 한국어만**. 주석·설명은 세지 않는다(이 레포는 주석을 한국어로 길게
 * 쓰는 것이 규약이고, 그건 화면에 안 나간다). 그래서 먼저 주석을 걷어 내고 문자열만 본다.
 *
 * 사용:
 *   node scripts/audit-i18n-source.mjs            검사 (기준선 초과면 실패)
 *   node scripts/audit-i18n-source.mjs --baseline 지금 상태를 새 기준선으로 (줄인 뒤에만)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, 'src');
const BASELINE = path.join(root, 'i18n/.source-baseline.json');
const REBASE = process.argv.includes('--baseline');
const KO = /[가-힣]/;

/**
 * 주석을 걷어 낸다.
 *
 * 정확한 파서를 쓰지 않는 이유: 우리가 알아야 하는 건 「한국어 글자열이 몇 개인가」라는 **추세**지
 * 정확한 구문 트리가 아니다. 다만 **문자열 안에 든 `//`** 를 주석으로 오해하면 뒷부분이 통째로
 * 사라져 숫자가 실제보다 작게 나온다 — 그러면 잠금이 헐거워진다. 그래서 문자열을 먼저 만나면
 * 그 문자열을 통째로 건너뛴다.
 */
function countKoreanLiterals(code) {
  let n = 0;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end < 0 ? code.length : end + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      const start = ++i;
      while (i < code.length) {
        if (code[i] === '\\') {
          i += 2;
          continue;
        }
        if (code[i] === quote) break;
        i++;
      }
      /* 한 벌로 훑으며 문자열을 그 자리에서 판정한다. 정규식으로 문자열을 다시 찾으면
         길고 여러 줄인 템플릿 글자열에서 되짚기가 폭발해 검사가 몇 분씩 걸린다(실측). */
      if (KO.test(code.slice(start, i))) n++;
      continue;
    }
  }
  return n;
}

const counts = {};
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules') continue;
      walk(f);
    } else if (e.name.endsWith('.ts')) {
      const n = countKoreanLiterals(fs.readFileSync(f, 'utf8'));
      if (n) counts[path.relative(root, f).split(path.sep).join('/')] = n;
    }
  }
})(SRC);

const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (REBASE) {
  fs.writeFileSync(BASELINE, JSON.stringify({ total, files: counts }, null, 2) + '\n', 'utf8');
  console.log(`[i18n-source] 기준선 새로 박음 — 파일 ${Object.keys(counts).length}개 · 한국어 글자열 ${total}개`);
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.error('[i18n-source] 기준선이 없다 — `node scripts/audit-i18n-source.mjs --baseline` 먼저');
  process.exit(1);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
const grew = [];
for (const [f, n] of Object.entries(counts)) {
  const was = base.files[f] ?? 0;
  if (n > was) grew.push(`${f}: ${was} → ${n}`);
}

if (grew.length) {
  console.error('[i18n-source] 코드에 박힌 한국어 글이 늘었다 — 화면 글은 i18n/ 묶음으로 빼야 한다:');
  for (const g of grew) console.error('  ' + g);
  console.error('  (정말 늘려야 하는 경우에만 `--baseline` 으로 다시 박는다)');
  process.exit(1);
}

const shrunk = base.total - total;
console.log(
  `[i18n-source] 코드 안 한국어 글자열 ${total}개 (기준선 ${base.total})` +
    (shrunk > 0 ? ` — ${shrunk}개 줄었다. \`--baseline\` 으로 잠금을 조여라` : '')
);
