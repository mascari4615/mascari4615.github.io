/**
 * 표를 새로 받은 직후, 그 변화가 **자동으로 넘겨도 되는 크기**인지 본다 (TASK-KAR-202).
 *
 *   node scripts/check-refresh-delta.mjs
 *
 * 왜 필요한가: 항목 수가 바뀌면 그날 이후의 정답 순서가 통째로 다시 섞인다
 * (순열이 항목 수를 씨앗으로 쓴다). 새 챔피언 하나가 늘어난 것이라면 자정 직후에
 * 넘겨도 아무도 안 다친다. 하지만 원본이 반쪽만 답해서 절반이 사라진 것이라면,
 * 그걸 그대로 커밋하는 순간 표가 망가진 채로 배포된다.
 *
 * 그래서 「조금 바뀌었다」와 「이상하게 바뀌었다」를 가른다. 이상하면 0 이 아닌 값으로 끝나고,
 * 부르는 쪽(주간 갱신 워크플로)이 커밋을 접는다.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(app, 'data');

/** 커밋되어 있는(= 지금 배포된) 표. 없으면 새 주제라 비교할 게 없다. */
function committed(file) {
  try {
    const raw = execFileSync('git', ['show', `HEAD:apps/daily/data/${file}`], {
      cwd: join(app, '../..'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// 늘어나는 건 정상이다(새 챔피언·새 캐릭터). 줄어드는 건 원본이 반쪽만 답했다는 신호에 가깝다.
const MAX_GROW = 0.15;
const MAX_SHRINK = 0.03;

let bad = 0;
let changed = 0;

for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
  const now = JSON.parse(readFileSync(join(dataDir, file), 'utf8'));
  const was = committed(file);
  if (!was) {
    console.log(`${file}: 새 표 (${now.items.length}개) — 비교할 게 없다`);
    changed += 1;
    continue;
  }
  const delta = now.items.length - was.items.length;
  if (delta === 0) {
    console.log(`${file}: ${now.items.length}개 그대로`);
    continue;
  }
  changed += 1;
  const ratio = delta / was.items.length;
  const limit = delta > 0 ? MAX_GROW : MAX_SHRINK;
  const over = Math.abs(ratio) > limit;
  const how = `${was.items.length} → ${now.items.length} (${delta > 0 ? '+' : ''}${delta}, ${(ratio * 100).toFixed(1)}%)`;
  if (over) {
    bad += 1;
    console.error(`${file}: ⛔ ${how} — 자동으로 넘기기엔 너무 크다. 원본이 반쪽만 답했는지 사람이 봐야 한다.`);
  } else {
    console.log(`${file}: ${how} — 넘겨도 되는 크기`);
  }
}

if (bad) {
  console.error(`\n표 ${bad}개가 이상하게 바뀌었다 — 커밋하지 않는다.`);
  process.exit(1);
}
console.log(`\n바뀐 표 ${changed}개 — 전부 넘겨도 되는 크기다.`);
