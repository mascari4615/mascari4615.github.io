/**
 * 실제 사이트에 「있어야 하는 것」이 있는가 (TASK-KL-089)
 *
 * 왜 있나: 하루에 두 번, 내 작업이 **조용히 사라졌다.** 여러 세션이 같은 저장소를 쓰다 보니
 * 갈래가 다시 쓰이면서 파일 몇 개가 예전 내용으로 되돌아갔다. 커밋은 남아 있는데 내용이 없다.
 * 그런데 그때도 검사는 전부 초록이었다 — 검사들이 **내 컴퓨터의 파일**을 보고 있었기 때문이다.
 *
 * 그래서 이 검사만은 실제 주소에서, 사람이 보게 되는 결과로 확인한다:
 * 「마크업이 나갔나」 뿐 아니라 「그 모양을 만드는 스타일도 함께 나갔나」까지 본다
 * (실제로 칸은 나가고 스타일만 빠져서, 맨몸으로 떠 있던 적이 있다).
 *
 * 여기 적는 것은 **없어지면 사람이 바로 손해를 보는 것들**로 한정한다 — 목록이 길어지면
 * 아무도 안 고치는 빨간불이 된다.
 *
 * 사용: BASE=https://blog.mascari4615.com node scripts/audit-live-essentials.mjs
 */
const BASE = process.env.BASE || 'https://blog.mascari4615.com';

if (!BASE.startsWith('https://')) {
  /* ★ **건너뛴 것은 초록이 아니다** (2026-08-14). 0 으로 끝내면 게이트 화면에 ✓ 로 찍혀
     「실사이트 필수 요소가 다 있다」로 읽힌다 — 실제로는 **한 번도 안 봤다**.
     이 저장소는 2 를 「못 돌림」으로 읽는다(`run-gates.mjs`). 그렇게 말한다. */
  console.log(`[audit-live-essentials] CANNOT-RUN — 실제 사이트가 아니다 (BASE=${BASE}). 이 검사는 배포된 주소에서만 뜻이 있다.`);
  process.exit(2);
}

const problems = [];
const notes = [];

async function get(pathname) {
  const res = await fetch(BASE + pathname);
  return { status: res.status, text: await res.text() };
}

/** 있어야 하는 것 — [무엇, 어디서, 찾을 것, 없으면 사람이 겪는 일] */
import { WANT } from './lib/live-essentials.mjs';


for (const [what, where, re, hurt] of WANT) {
  let got;
  try {
    got = await get(where);
  } catch (e) {
    problems.push(`${what}: ${where} 를 못 받았다 (${String(e.message).slice(0, 40)})`);
    continue;
  }
  // 「없는 주소」 자리는 404 가 정상이다 — 상태가 아니라 내용으로 본다.
  if (got.status >= 500) {
    problems.push(`${what}: ${where} 가 http ${got.status}`);
    continue;
  }
  if (!re.test(got.text)) problems.push(`${what} 이(가) 실제 사이트에 없다 — ${hurt} (${where})`);
  else notes.push(what);
}

if (problems.length) {
  console.error(`[audit-live-essentials] 실제 사이트에서 빠진 것 ${problems.length}건 / ${WANT.length}`);
  problems.forEach((p) => console.error('  - ' + p));
  console.error('  → 내 컴퓨터 파일과 원격을 견줘 봐라: `git diff origin/master -- <파일>`. 갈래가 다시 쓰이며 되돌아간 적이 있다.');
  process.exit(1);
}
console.log(`[audit-live-essentials] 실제 사이트에 ${notes.length}가지 다 있다 — 마크업뿐 아니라 그 모양을 만드는 스타일까지`);
