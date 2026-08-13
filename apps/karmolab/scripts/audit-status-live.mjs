/**
 * 상태 줄이 **읽히는 자리**로 표시돼 있는가 (TASK-KL-291).
 *
 * 「다 됐습니다」·「이 파일은 못 엽니다」는 화면이 안 바뀐 채 글자만 갈린다 — `aria-live` 가 없으면
 * 화면낭독기는 **아무 말도 안 한다**(누른 뒤 무반응과 같다). 실측 시작점은 **2/126** 이었다.
 *
 * 빨간 조건 = 도구에 `tool-status` 자리가 있는데 `statusLine(`·`markLive(`·`aria-live` 중
 * 아무것도 없음. 셋 중 하나만 있으면 초록 — **막는 게 목적이 아니라 안 읽히는 걸 막는 게 목적**이다.
 *
 * 사용: node scripts/audit-status-live.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'src', 'widgets', 'tools');

const bad = [];
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(dir, name), 'utf8');
  if (!/class="tool-status"/.test(src)) continue;
  if (/statusLine\(|markLive\(|aria-live/.test(src)) continue;
  bad.push(name);
}

if (bad.length) {
  console.error(`[audit-status-live] 상태 줄이 안 읽히는 도구 ${bad.length}개 — 눌러도 낭독기엔 아무 말이 없습니다:`);
  bad.forEach((f) => console.error(`  - ${f}`));
  console.error("  고치는 법: 그 자리를 만들 때 `statusLine(status)` 를 쓰거나, 이미 쓰는 곳이면 `markLive(status)` 한 줄.");
  process.exit(1);
}
console.log('[audit-status-live] 상태 줄이 있는 도구는 전부 읽히는 자리로 표시돼 있습니다');
