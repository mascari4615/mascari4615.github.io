/**
 * 표를 저장하는 한 곳 (TASK-KAR-202).
 *
 * 표 갱신에는 조용한 사고가 하나 있다: **항목 수가 바뀌면 그날 이후의 정답 순서가 통째로
 * 다시 섞인다** (순열이 항목 수를 씨앗으로 쓴다). 낮에 갈아끼우면 이미 두던 사람의 답이 바뀐다.
 *
 * 그 규칙이 README 에만 적혀 있어서 사람이 기억해야 했다. 여기서 기계가 말한다.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** 지금이 한국 시각으로 몇 시인가 — 갱신하기 좋은 때인지 판단하는 데 쓴다. */
function kstHour() {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCHours();
}

export function saveTable(outPath, topic) {
  const before = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : null;
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(topic)}\n`);

  const label = `${topic.title} ${topic.items.length}개`;
  if (!before) {
    console.log(`${label} → 새 표`);
    return;
  }

  const was = before.items.length;
  if (was === topic.items.length) {
    console.log(`${label} (항목 수 그대로 — 그날 정답 순서는 안 흔들린다)`);
    return;
  }

  const hour = kstHour();
  console.log(`${label} — ⚠ 항목이 ${was} → ${topic.items.length} 로 바뀌었다.`);
  console.log('   그날 이후의 정답 순서가 통째로 다시 섞인다 (순열이 항목 수를 씨앗으로 쓴다).');
  if (hour >= 1) {
    console.log(`   지금 한국 시각 ${hour}시다 — 오늘 이미 두던 사람의 정답이 바뀐다.`);
    console.log('   되돌리려면 이 파일을 git 으로 원복하고, 자정 직후에 다시 돌려라.');
  } else {
    console.log('   지금은 자정 직후라 영향받는 사람이 거의 없다 — 갱신하기 좋은 때다.');
  }
}
