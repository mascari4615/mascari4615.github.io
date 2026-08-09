/**
 * 도구가 **사람이 쓰는 말로** 찾아지나 (TASK-KL-201 곁가지).
 *
 * 왜 있나: 새 도구를 만들고 별칭을 잊으면, 사람은 그 도구를 영영 못 찾는다. 실측으로 그랬다 —
 * 「기기 안 AI」를 만들어 놓고 **「번역」이라고 치면 0건**이었다. 넓혀 보니 「북마크」·「게시판」·
 * 「통계」·「도움말」·「제비뽑기」·「말동무」도 전부 0건이었다.
 *
 * 사람은 도구 이름이 아니라 **하려는 일**로 찾는다. 이름에 그 낱말이 없으면 만들어 둔 것이
 * 없는 것과 같다. 그래서 「별칭 없는 도구」를 세고, 지금보다 늘면 세운다.
 *
 * 0 으로 잠그지 않는 이유: 이름 자체가 이미 찾는 말인 도구가 있다(「글자수 세기」를 「글자수」로
 * 찾는다). 그런 것까지 별칭을 강요하면 의미 없는 줄만 는다. **늘어나는 것**만 막는다.
 *
 * 사용: node scripts/audit-tool-aliases.mjs [--update]   (npm run audit:aliases)
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const METAS = path.join(root, 'js/widgets-lazy-meta.js');
const ALIASES = path.join(root, 'data/tool-aliases.json');
const BASELINE = path.join(root, 'data/alias-baseline.json');
const UPDATE = process.argv.includes('--update');

if (!fs.existsSync(METAS)) {
  console.log('[aliases] 못 돌림 — js/widgets-lazy-meta.js 가 없다 (`node build.mjs` 먼저)');
  process.exit(0);
}

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(METAS, 'utf8'), sandbox);
const widgets = (sandbox.window.KARMOLAB_LAZY_META || []).filter((w) => !w.hidden);
const aliases = JSON.parse(fs.readFileSync(ALIASES, 'utf8')).aliases || {};

if (!widgets.length) {
  console.error('[aliases] 위젯 목록을 못 읽었다 — 이건 통과가 아니다.');
  process.exit(1);
}

const missing = widgets.filter((w) => !aliases[w.id]);
console.log(`[aliases] 도구 ${widgets.length}개 · 별칭 있는 것 ${widgets.length - missing.length}개 · 없는 것 ${missing.length}개`);

if (UPDATE) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      { note: '별칭 없는 도구 수. audit-tool-aliases.mjs --update 로만 갱신한다.', at: new Date().toISOString(), missing: missing.length },
      null,
      1
    ) + '\n',
    'utf8'
  );
  console.log('[aliases] 기준선 갱신');
  process.exit(0);
}

if (!fs.existsSync(BASELINE)) {
  console.log('[aliases] 기준선 없음 — 이건 통과가 아니라 **못 돌림**이다 (`--update` 로 한 번 박아라)');
  process.exit(0);
}

const was = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).missing ?? 0;
if (missing.length > was) {
  console.error(`[aliases] FAIL — 별칭 없는 도구가 ${was} → ${missing.length} 로 늘었다`);
  for (const w of missing.slice(0, 10)) console.error(`  - ${w.id} (${w.title})`);
  console.error('  `data/tool-aliases.json` 에 「사람이 칠 법한 말」을 적어라 — 도구 이름이 아니라 하려는 일로.');
  console.error('  정말 이름만으로 충분하면 `npm run audit:aliases -- --update` 로 기준선을 옮겨라(커밋에 남는다).');
  process.exit(1);
}
console.log(`[aliases] OK — 기준선 ${was} 이하`);
