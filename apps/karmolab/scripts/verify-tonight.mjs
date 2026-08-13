/**
 * 배포된 뒤 **최근에 생긴 도구**가 실제로 살아 있는지 한 번에 본다 (TASK-KL-088 / KL-312)
 *
 * 배포가 오래 막혀 열다섯 개가 한꺼번에 나간다. 그럴 때 하나씩 눌러 보는 건 놓치기 쉽다.
 * 페이지가 뜨는지(200)뿐 아니라 **화면이 실제로 그려지는지**까지 본다 — 200 인데 빈 화면이던
 * 사고가 이미 있었다.
 *
 * ★ 목록을 손으로 안 적는다 (2026-08-13, KL-312). 예전엔 도구 이름 23개가 여기 박혀 있었다.
 *   그건 「그날 밤」의 목록이라 다음 날부터 거짓이다 — 어제 만든 도구는 안 보고, 반년 전 도구를
 *   매번 다시 본다. 도구가 처음 등장한 날은 이미 `data/tools-seen.json` 이 들고 있다(목록에
 *   「새로 나옴」 표시를 그 값으로 붙인다). 그걸 읽어 **최근 N일 안에 생긴 것**만 본다.
 *
 * 사용:
 *   node scripts/verify-tonight.mjs           # 최근 7일 안에 생긴 도구
 *   node scripts/verify-tonight.mjs --days 30
 *   node scripts/verify-tonight.mjs qr pdf    # 이름을 대면 그것만 (예전 방식)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const daysAt = argv.indexOf('--days');
const DAYS = daysAt >= 0 ? Number(argv[daysAt + 1]) : 7;
const 이름들 = argv.filter((a, i) => a.startsWith('--') === false && i !== daysAt + 1);

function 최근도구(days) {
  const p = path.join(root, 'data/tools-seen.json');
  if (fs.existsSync(p) === false) return [];
  const seen = JSON.parse(fs.readFileSync(p, 'utf8')).seen || {};
  const 자른날 = Date.now() - days * 24 * 60 * 60 * 1000;
  return Object.entries(seen)
    .filter(([, date]) => Date.parse(date) >= 자른날)
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .map(([id]) => id);
}

const TOOLS = 이름들.length > 0 ? 이름들 : 최근도구(DAYS);

if (TOOLS.length === 0) {
  /* 「0개」는 통과가 아니라 **볼 것이 없었다**는 말이다 — 조용히 초록으로 끝내지 않는다. */
  console.log(`[verify-tonight] 최근 ${DAYS}일 안에 새로 생긴 도구가 없다 — 볼 것이 없다.`);
  console.log('[verify-tonight] 기간을 늘리려면: node scripts/verify-tonight.mjs --days 30');
  process.exit(0);
}

console.log(`[verify-tonight] 최근 ${DAYS}일 도구 ${TOOLS.length}개를 확인합니다 — ${TOOLS.join(', ')}`);
execFileSync('node', ['scripts/smoke-live-pages.mjs', ...TOOLS], { stdio: 'inherit', cwd: root });
console.log('[verify-tonight] 모두 살아 있습니다');
