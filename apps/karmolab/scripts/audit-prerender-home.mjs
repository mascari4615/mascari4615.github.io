/**
 * 미리 박은 첫 화면이 **「브라우저가 처음 만들 그것」인가** (TASK-KL-201, 2026-08-10)
 *
 * 왜 생겼나: 첫 화면을 미리 그려 박았더니 실사이트 밀림이 **되레 커졌다**(0.033 → 0.044).
 * 다 가라앉은 뒤를 떠서, 갈아 끼우는 순간 브라우저가 처음 만드는 것과 어긋난 탓이다:
 *   · 나중에 붙는 꾸미기 단추(`.hp-open`)가 박혀 있었다 → 갈아 끼우면 31px 가 사라진다
 *   · 나중에 채워질 칸에 예약 표가 없었다 → 0px 였다가 23px 로 뛴다
 *
 * 둘 다 **파일만 보면 안다**. 브라우저를 띄울 필요가 없으니 배포 길목에서 값싸게 지킨다.
 * 미리 그리기가 아예 없으면(로컬·미배포) **못 돌림**이라고 말하고 빠진다 — 통과로 세지 않는다.
 *
 * 사용: node scripts/audit-prerender-home.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILE = path.join(root, '../blog/karmolab/index.html');
const MARK = '<!-- KARMOLAB_HOME_PRERENDERED -->';

/** 나중에 채워지는 칸 — 미리 박을 때 **예약 표**를 달고 있어야 한다. */
const LIVE_IDS = ['homeToday', 'homePulse'];
/** 나중에 붙는 것 — 미리 박은 것에 있으면 안 된다. */
const LATE_CLASSES = ['hp-open', 'hp-panel'];

if (!fs.existsSync(FILE)) {
  console.log('[prerender-home 검사] 못 돌림 — 찍힌 첫 화면이 없다 (배포가 만든다). 통과로 안 센다.');
  process.exit(0);
}
const html = fs.readFileSync(FILE, 'utf8');
if (!html.includes(MARK)) {
  console.log('[prerender-home 검사] 못 돌림 — 아직 미리 그리기 전이다. 통과로 안 센다.');
  process.exit(0);
}

const bad = [];

for (const cls of LATE_CLASSES) {
  if (new RegExp(`class="[^"]*\\b${cls}\\b`).test(html)) {
    bad.push(`나중에 붙는 것(${cls})이 박혀 있다 — 갈아 끼울 때 그만큼 사라지며 화면이 튄다`);
  }
}

for (const id of LIVE_IDS) {
  const m = new RegExp(`<[^>]*id="${id}"[^>]*>`).exec(html);
  if (!m) {
    bad.push(`${id} 칸이 미리 박은 것에 없다 — 자리를 안 잡아 두면 값이 올 때 아래가 밀린다`);
    continue;
  }
  if (!m[0].includes('data-reserving')) {
    bad.push(`${id} 에 예약 표가 없다 — 0px 였다가 값이 오면 뛴다`);
  }
  const after = html.slice(m.index + m[0].length, m.index + m[0].length + 400);
  if (after.trim() && !after.trimStart().startsWith('<')) {
    /* 값이 구워져 있으면 어제 숫자가 먼저 보인다. 빈 칸이어야 한다. */
    bad.push(`${id} 에 빌드 때 값이 구워져 있다 — 어제 숫자가 먼저 보인다`);
  }
}

if (bad.length) {
  console.error('[prerender-home 검사] FAIL — 미리 박은 첫 화면이 「처음 만들 그것」과 다르다:');
  for (const b of bad) console.error(`  - ${b}`);
  console.error('  고칠 곳: scripts/prerender-home.mjs (가라앉은 뒤가 아니라 이른 상태를 떠라)');
  process.exit(1);
}
console.log(`[prerender-home 검사] OK — 나중에 붙는 것 없음 · 예약 표 ${LIVE_IDS.length}개 확인`);
