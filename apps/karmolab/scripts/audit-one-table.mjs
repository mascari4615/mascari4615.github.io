/**
 * 한글 타수 세는 법이 **한 벌뿐인지** 본다 (데일리 ⓐ 곁가지)
 *
 * 같은 셈을 두 군데 두면 언젠가 한쪽만 고쳐진다. 그러면 **같은 글인데 화면마다 타수가 다르게**
 * 나온다 — 오늘의 타자에서는 480타인데 유령 대결에서는 512타인 식이다. 그 어긋남은 아무도
 * 오류로 안 보고 「내 기록이 이상한데」로만 느끼고 지나간다.
 *
 * 실제로 그랬다: `core/hangultype.ts` 를 만들 때 `ghosttype.ts` 안에 이미 같은 표가 있었다.
 *
 * 무엇을 세나: 겹모음 표(`ㅘ: 2`)가 소스에 몇 번 적혀 있는지. 이 표가 곧 그 규칙이다.
 *
 * 사용: node scripts/audit-one-keystroke-table.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/*
 * 「이 표는 여기 하나뿐」 목록. 표가 곧 규칙이라, 두 벌이 되는 순간 규칙이 두 개가 된다.
 * 실제로 둘 다 두 벌이었다 — 타수는 ghosttype 에, 자모는 charconv·morse 에 손으로 적혀 있었다.
 */
const TABLES = [
  { what: '타수 세는 표', mark: 'ㅘ: 2', home: 'src/core/hangultype.ts' },
  { what: '자모 표', mark: "'ㄱ','ㄲ','ㄴ'", home: 'src/core/jamo.ts' }
];

const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(at);
      continue;
    }
    if (e.name.endsWith('.ts') === false) continue;
    files.push({
      rel: path.relative(appRoot, at).split(String.fromCharCode(92)).join(String.fromCharCode(47)),
      text: fs.readFileSync(at, 'utf8')
    });
  }
};
walk(path.join(appRoot, 'src'));

let bad = 0;
for (const t of TABLES) {
  const found = files.filter((f) => f.text.includes(t.mark)).map((f) => f.rel);
  if (found.length === 1 && found[0] === t.home) continue;
  bad++;
  console.error(`[one-table] ${t.what}가 ${found.length}군데 있다 (있어야 할 곳: ${t.home}):`);
  for (const f of found) console.error('  - ' + f);
  console.error(`  한 벌만 남기고 나머지는 ${t.home} 에서 가져다 써라.`);
}
if (bad > 0) process.exit(1);
console.log(`[one-table] 표 ${TABLES.length}종 전부 제자리에 한 벌씩만 있다`);
