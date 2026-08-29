/**
 * 기기 안에서만 돈다는 말이 **아직 참인지** 잰다 (TASK-KL-352).
 *
 * 왜 있나: 도구 장 바닥에 입력한 내용은 브라우저 안에서만 처리되며 어디에도 저장, 전송되지
 * 않습니다가 조건 없이 찍히고 있었다. 그때 이미 `imageedit` 는 그림을 Google Gemini 로,
 * `apitest` 는 사람이 적은 주소로 요청을 보내고 있었다. 약속을 **글로만** 적으면 코드가
 * 바뀌는 순간 조용히 거짓말이 된다. 그래서 재는 자리를 만든다.
 *
 * 무엇을 막나:
 *   ① 명부에 있는 도구가 바깥을 부르는데 `data/tool-privacy.json` 에 판정이 없다 → 막는다
 *   ② 판정이 `local` 인데 바깥 호출이 있다 → 막는다 (가장 위험한 짝)
 *   ③ 판정은 있는데 코드에서 바깥 호출이 사라졌다 → 알린다 (낡은 판정, 막지는 않는다)
 *
 * 판정 자체는 사람이 적는다. 같은 `fetch` 라도 우리 정적 파일 받기와 남의 서버로 그림 보내기는
 * 뜻이 정반대라, 기계가 지으면 그럴듯한 거짓말이 된다.
 *
 * 사용: node scripts/audit-tool-privacy.mjs [--json]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRoster, scanTool, readVerdicts } from './lib/tool-network-scan.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const asJson = process.argv.includes('--json');

const verdicts = readVerdicts(root);
const declared = verdicts.tools || {};
const roster = readRoster(root);

const missing = [];
const contradicts = [];
const stale = [];
let touched = 0;

for (const tool of roster) {
  const scan = scanTool(root, tool);
  /* 주소가 **글에 박혀 있는 것**은 나감이 아니다. 링크 모음(`favorites`, `linktree`)은 남의
     주소를 수십 개 들고 있지만 누르기 전엔 아무것도 안 부른다. 부르는 자리가 있어야 센다. */
  const reaches = scan.calls > 0 || scan.ai > 0;
  const verdict = declared[tool.id];
  if (reaches) touched++;
  if (reaches && !verdict) missing.push({ id: tool.id, hosts: scan.hosts, calls: scan.calls, ai: scan.ai });
  else if (reaches && verdict.where === 'local' && !verdict.whyLocal) contradicts.push({ id: tool.id, hosts: scan.hosts });
  else if (!reaches && verdict) stale.push({ id: tool.id, where: verdict.where });
}

if (asJson) {
  console.log(JSON.stringify({ touched, missing, contradicts, stale }, null, 2));
} else {
  console.log(`도구 ${roster.length}개 중 바깥을 부르는 것 ${touched}개, 판정 적힌 것 ${Object.keys(declared).length}개`);
  for (const m of missing) {
    console.log(`  ✗ ${m.id}. 바깥을 부르는데 판정이 없다 (호출 ${m.calls}, AI ${m.ai})${m.hosts.length ? ` → ${m.hosts.join(' ')}` : ''}`);
  }
  for (const c of contradicts) {
    console.log(`  ✗ ${c.id}. 기기 안에서만이라 적혔는데 바깥 호출이 있다 → ${c.hosts.join(' ') || '(주소는 변수)'}`);
  }
  for (const s of stale) {
    console.log(`  ⚠ ${s.id}. 판정(${s.where})은 있는데 코드에 바깥 호출이 없다 (낡았을 수 있다)`);
  }
  if (!missing.length && !contradicts.length) console.log('  ✓ 빠진 판정 없음');
}

process.exit(missing.length || contradicts.length ? 1 : 0);
