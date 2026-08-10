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
const MARK = 'ㅘ: 2';
const HOME = 'src/core/hangultype.ts';

const found = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(at);
      continue;
    }
    if (e.name.endsWith('.ts') === false) continue;
    if (fs.readFileSync(at, 'utf8').includes(MARK)) found.push(path.relative(appRoot, at).split(String.fromCharCode(92)).join(String.fromCharCode(47)));
  }
};
walk(path.join(appRoot, 'src'));

if (found.length !== 1 || found[0] !== HOME) {
  console.error(`[one-keystroke-table] 타수 세는 표가 ${found.length}군데 있다 (있어야 할 곳: ${HOME}):`);
  for (const f of found) console.error('  - ' + f);
  console.error(`  한 벌만 남기고 나머지는 \`import { 타건수 } from '…/core/hangultype'\` 로 바꿔라.`);
  process.exit(1);
}
console.log(`[one-keystroke-table] 타수 세는 표는 ${HOME} 한 곳뿐이다`);
