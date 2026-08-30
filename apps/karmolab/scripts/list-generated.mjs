#!/usr/bin/env node
/**
 * 파생물 표를 **워크플로가 읽을 수 있게** 뱉는다 (TASK-KL-312, 2026-08-14)
 *
 * 정본은 `lib/generated-artifacts.mjs` 하나다. 새벽 워크플로가 자기 안에 생성기 이름을
 * 또 적어 두면, 밤에 굽는다고 감사기가 약속한 파일이 실제로는 아무도 안 굽는 상태가
 * 조용히 생긴다. 그래서 워크플로는 목록을 여기서 받아 간다.
 *
 * 사용:
 *   node scripts/list-generated.mjs --nightly-scripts   # 굽는 명령, 한 줄에 하나
 *   node scripts/list-generated.mjs --nightly-outputs   # 굽는 파일(저장소 뿌리 기준), 한 줄에 하나
 */
import { nightlyBuilds } from './lib/generated-artifacts.mjs';

const what = process.argv[2];
if (what === '--nightly-scripts') {
  console.log(nightlyBuilds.map((x) => x.npm).join('\n'));
} else if (what === '--nightly-outputs') {
  console.log(nightlyBuilds.flatMap((x) => x.outputs).map((p) => `apps/karmolab/${p}`).join('\n'));
} else {
  console.error('사용: node scripts/list-generated.mjs --nightly-scripts | --nightly-outputs');
  process.exit(2);
}
