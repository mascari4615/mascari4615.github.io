/**
 * 공개되는 숫자가 로봇을 거르는지 (TASK-KL-113)
 *
 * 왜 있나: 화면에 내놓은 수는 **정확도가 곧 신뢰**다. 그런데 세는 자리마다 봇 거르기를
 * 손으로 붙이다 보니 빠진 데가 생겼고, 빠진 줄을 아무도 몰랐다. 하루에 두 곳이 나왔다.
 *
 *  ① 도구 열림 — 우리 점검이 한 바퀴 돌 때마다 도구 138개가 통째로 +1. 실제로 도구
 *     130개가 똑같이 48번씩 열린 것으로 찍혀 있었고, 그 순위가 첫 화면에 공개됐다.
 *  ② 글 조회수 — 검색봇이 훑고 간 것이 「사람이 읽었다」로 글쓴이에게 보였다.
 *
 * 둘 다 화면은 멀쩡했다. 숫자가 그럴듯해서 아무도 의심하지 않는 것이 이 고장의 성질이다.
 *
 * 보는 것: 세는 함수를 부르는 자리마다 그 근처에서 방문자 종류를 가려내는지. 안 가려내면
 * 빨강. 새로 세는 것을 만들면 여기서 걸리므로 「깜빡했다」가 구조적으로 어려워진다.
 *
 * 파일만 읽는다 — 서버도 브라우저도 필요 없다.
 *
 * 사용: node scripts/audit-public-counters.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, 'src/bot/karmolab-api.ts');

/** 부르면 공개되는 수가 올라가는 함수들. 새로 만들면 여기에 한 줄 늘린다. */
const COUNTERS = ['recordToolOpen', 'recordVisit', 'recordPostView', 'touchPresence'];

/** 가려내는 판단이 이 근처에 있어야 한다 — 몇 줄까지 봐 줄지. */
const LOOKBACK = 14;

const src = fs.readFileSync(target, 'utf8');
const lines = src.split('\n');
const problems = [];

for (let i = 0; i < lines.length; i += 1) {
  const line = lines[i];
  const hit = COUNTERS.find((name) => line.includes(`${name}(`));
  if (!hit) continue;
  // 정의부(그 함수를 만드는 곳)가 아니라 부르는 곳만 본다.
  if (/\b(function|async)\b/.test(line)) continue;

  const from = Math.max(0, i - LOOKBACK);
  const near = lines.slice(from, i + 2).join('\n');
  if (!/classifyVisitor\s*\(/.test(near)) {
    problems.push(`${hit} — ${i + 1}번째 줄에서 세는데 근처에 방문자 가려내기가 없다`);
  }
}

/* 가려내는 잣대 자체가 사라지지 않았는지도 본다 — 목록이 비면 위 검사는 전부 통과해 버린다. */
const kindFile = path.join(root, 'src/services/karmolab-visitor-kind.ts');
if (!fs.existsSync(kindFile)) {
  problems.push('방문자를 가려내는 파일이 없어졌다 — 위 검사 전체가 무의미해진다');
} else {
  const kind = fs.readFileSync(kindFile, 'utf8');
  for (const mark of ['headlesschrome', 'playwright', 'googlebot', 'python-requests']) {
    if (!kind.includes(mark)) problems.push(`가려내는 목록에서 「${mark}」 가 사라졌다`);
  }
}

if (problems.length) {
  console.error(`[audit-public-counters] 문제 ${problems.length}건 — 공개되는 수에 로봇이 섞인다`);
  problems.forEach((p) => console.error('  - ' + p));
  process.exit(1);
}
console.log(`[audit-public-counters] 공개 집계 ${COUNTERS.length}종 모두 사람만 센다`);
