/**
 * **「또는」으로 이어 붙인 통과 조건**을 센다 (TASK-KL-304)
 *
 * 검사 한 줄의 통과 조건에 `||` 를 넣으면 **느슨한 쪽이 늘 이긴다** — 조건을 더할수록 검사가
 * 약해진다(막으려던 것과 정반대). 손으로 훑다가 실제로 둘을 잡았다:
 *
 *   - `smoke-handoff-bundle`: 「판이 펴졌거나 **또는** 상태 글씨에 0:00 이 있으면 통과」 →
 *     그 글씨는 아무것도 안 받았을 때도 있어서, **안 받아도 초록**이었다([[TASK-KL-278]]).
 *   - `test-soundscape-core`: 「없거나 **또는** 값이 1이면 통과」 → 있으면 값이 1일 테니
 *     **고장 난 경우를 그대로 통과**시켰다. 조이니 진짜 버그가 나왔다([[TASK-KL-279]]).
 *
 * 손으로 훑는 건 한 번뿐이라 다음 검사가 또 그렇게 짜인다. 그래서 기계에 맡긴다
 * (`rules/quality.md § 자동화 가능 룰은 코드로`).
 *
 * ## 무엇을 빨갛다고 하나
 *
 * `check(...)` 의 **판정 자리**(첫 인자, 또는 이름이 앞에 오는 판이면 둘째)에 최상위 `||` 가 있는 줄.
 * 괄호 안에 든 `||` 는 세지 않는다 — `(a || b) === c` 처럼 **값을 고르는** 쓰임이라 판정이 안 느슨해진다.
 * 문자열·정규식 안의 `||` 도 뺀다.
 *
 * **톱니**: 지금 있는 것들은 기준선에 적어 두고 통과시킨다. 새로 생기면 막고, 고친 것이
 * 기준선에 남아 있어도 막는다(줄기만 한다). 남의 슬롯 파일까지 이 판에 다 고칠 수는 없으니까.
 *
 * 사용: node scripts/audit-loose-checks.mjs [--update]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'scripts');
const BASELINE = path.join(root, 'data/loose-checks.json');

/** 문자열·정규식 안을 공백으로 지운다 — 그 안의 `||` 는 판정이 아니다. */
function blankLiterals(line) {
  let out = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    const prev = line[i - 1];
    if (quote) {
      out += c === quote && prev !== '\\' ? ((quote = null), c) : ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      out += c;
      continue;
    }
    out += c;
  }
  return out;
}

/**
 * `check(` 뒤 판정 자리에 **괄호 밖** `||` 가 있나.
 * 이름이 앞에 오는 판(`check('이름', 조건, '왜')`)도 있어서, 첫 인자가 문자열이면 둘째를 본다.
 */
function looseArg(text) {
  let depth = 0;
  let arg = 0;
  let buf = '';
  const args = [];
  for (const c of text) {
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break;
      depth -= 1;
    } else if (c === ',' && depth === 0) {
      args.push(buf);
      buf = '';
      arg += 1;
      if (arg > 2) break;
      continue;
    }
    buf += c;
  }
  if (buf) args.push(buf);
  if (!args.length) return false;
  /* 첫 인자가 통째로 따옴표로 시작하면 그건 이름 — 판정은 둘째다 */
  const judge = /^\s*['"`]/.test(args[0]) ? args[1] : args[0];
  if (!judge) return false;
  let d = 0;
  for (let i = 0; i < judge.length; i += 1) {
    const c = judge[i];
    if (c === '(' || c === '[') d += 1;
    else if (c === ')' || c === ']') d -= 1;
    else if (d === 0 && c === '|' && judge[i + 1] === '|') return true;
  }
  return false;
}

const found = [];
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.mjs')) continue;
  const src = fs.readFileSync(path.join(dir, name), 'utf8');
  src.split('\n').forEach((raw, i) => {
    const line = blankLiterals(raw);
    const at = line.indexOf('check(');
    if (at < 0) return;
    if (/function check|const check|=>/.test(line.slice(0, at))) return; // 정의부는 뺀다
    if (looseArg(line.slice(at + 'check('.length))) found.push(`${name}:${i + 1}`);
  });
}
found.sort();

if (process.argv.includes('--update')) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        설명: '통과 조건에 「또는」이 든 검사 — 줄기만 한다. 느슨한 쪽이 늘 이긴다 (audit-loose-checks.mjs)',
        갱신: new Date().toISOString().slice(0, 10),
        목록: found
      },
      null,
      2
    ) + '\n'
  );
  console.log(`[audit-loose-checks] 기준선 갱신 — ${found.length}곳`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).목록;
/** 줄 번호는 남의 편집으로 밀린다 — 파일 단위로 견준다(그래야 오탐으로 안 막힌다). */
const fileOf = (s) => s.split(':')[0];
const baseFiles = new Set(base.map(fileOf));
const added = found.filter((k) => !baseFiles.has(fileOf(k)));
const gone = [...baseFiles].filter((f) => !found.some((k) => fileOf(k) === f));

if (added.length) {
  console.log(`[audit-loose-checks] 통과 조건에 「또는」이 든 새 검사 ${added.length}곳`);
  for (const a of added) console.log(`  - ${a}`);
  console.log('  느슨한 쪽이 늘 이긴다 — 조건을 **하나**로 조여라. 그리고 한 번 망가뜨려 봐라.');
  process.exit(1);
}
if (gone.length) {
  console.log(`[audit-loose-checks] 이제 고친 파일이 기준선에 남아 있다: ${gone.join(', ')}`);
  console.log('  `npm run audit:loose -- --update` 로 기준선을 줄여라 (톱니는 되감기지 않는다)');
  process.exit(1);
}
console.log(`[audit-loose-checks] 「또는」이 든 자리 ${found.length}곳 (기준선과 같음 — 늘지 않았다)`);
