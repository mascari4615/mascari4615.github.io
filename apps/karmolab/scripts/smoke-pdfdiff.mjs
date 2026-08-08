/**
 * 판본 대조가 실제로 바뀐 자리를 잡는지 (TASK-KL-130)
 *
 * 다른 검사로는 못 잡는다 — 「값을 넣으면 반응하는지」 보는 검사는 입력칸 하나에 글자를 넣는
 * 방식이라 **파일 두 개**를 받는 도구를 다루지 못한다. 화면이 뜨는지 보는 검사는 뜨기만 하면
 * 통과한다. 이 도구는 「달라진 곳을 찾는 것」이 존재 이유라, 찾는지를 직접 봐야 한다.
 *
 * 양방향으로 본다:
 *   ① 서로 다른 두 판본 → 「달라졌다」 + 사라진 줄·들어온 줄이 실제로 그 줄이어야 한다
 *   ② 같은 파일 두 번   → 「같습니다」 (아무 차이나 만들어 내면 도구가 거짓말을 하는 것이다)
 *   ③ 글자만 모드       → 그림 없이도 줄 차이는 그대로 잡혀야 한다
 *   ④ 그림만 모드       → 글자층이 없어도(스캔본) 달라진 자리를 잡아야 한다
 *
 * 사용: node scripts/smoke-pdfdiff.mjs
 *       BASE=http://127.0.0.1:8801/apps/blog node scripts/smoke-pdfdiff.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitHydrated } from './lib/hydrated.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const V1 = path.join(root, 'data/samples/sample-v1.pdf');
const V2 = path.join(root, 'data/samples/sample-v2.pdf');

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => failures.push(`페이지 오류: ${e.message}`));

/** 두 파일을 넣고 대조를 눌러, 상태줄이 결론을 말할 때까지 기다린다. */
async function compare(a, b, mode) {
  const res = await page.goto(`${BASE}/karmolab/t/pdfdiff/`, { waitUntil: 'domcontentloaded' });
  // 아직 안 올라간 것과 망가진 것은 고칠 곳이 다르다 — 섞어 적으면 없는 버그를 쫓게 된다.
  if (res && res.status() === 404) throw new Error(`페이지가 아직 없다 (${BASE} 에 배포되기 전) — 배포 후 다시 보라`);
  // 보인다고 손이 달린 것은 아니다 — 미리 그린 그림과 진짜 화면 사이 틈 (TASK-KL-135)
  await waitHydrated(page, '#pdRun');
  await page.setInputFiles('#pdFileA', a);
  await page.setInputFiles('#pdFileB', b);
  await page.selectOption('#pdMode', mode);
  await page.click('#pdRun');
  // 「…중」 으로 끝나는 말은 아직 도는 중이다 — 결론이 나올 때까지 기다린다
  await page.waitForFunction(
    () => {
      const s = document.querySelector('#pdStatus');
      return !!s && /같습니다|달라졌습니다|못했어요|넣어 주세요/.test(s.textContent || '');
    },
    { timeout: 90000 }
  );
  return page.evaluate(() => ({
    status: document.querySelector('#pdStatus')?.textContent || '',
    lines: [...document.querySelectorAll('.pd-line')].map((e) => e.textContent || ''),
    canvases: document.querySelectorAll('.pd-pane canvas').length,
    badges: [...document.querySelectorAll('.pd-badge')].map((e) => e.textContent || '')
  }));
}

function check(name, cond, detail) {
  if (cond) return;
  failures.push(`${name} — ${detail}`);
}

try {
  // ① 다른 판본 — 바뀐 줄을 짚어야 한다
  const diff = await compare(V1, V2, 'both');
  check('다른 판본', /달라졌습니다/.test(diff.status), `상태줄: ${diff.status}`);
  check('사라진 줄', diff.lines.some((l) => l.startsWith('−') && l.includes('1000')), `줄: ${diff.lines.join(' | ')}`);
  check('들어온 줄', diff.lines.some((l) => l.startsWith('+') && l.includes('2000')), `줄: ${diff.lines.join(' | ')}`);
  check('그림 두 장', diff.canvases === 2, `캔버스 ${diff.canvases}장`);
  check('바뀐 자리 표시', diff.badges.some((b) => /달라진 자리/.test(b)), `표: ${diff.badges.join(' | ')}`);

  // ② 같은 파일 — 차이를 만들어 내면 안 된다
  const same = await compare(V1, V1, 'both');
  check('같은 파일', /같습니다/.test(same.status), `상태줄: ${same.status}`);
  check('같은 파일 · 줄 없음', same.lines.length === 0, `줄 ${same.lines.length}개가 나왔다`);

  // ③ 글자만 — 그림 없이도 줄 차이는 잡힌다
  const textOnly = await compare(V1, V2, 'text');
  check('글자만 모드', /달라졌습니다/.test(textOnly.status), `상태줄: ${textOnly.status}`);
  check('글자만 · 그림 없음', textOnly.canvases === 0, `캔버스 ${textOnly.canvases}장이 그려졌다`);

  // ④ 그림만 — 글자층을 끄고도 잡혀야 한다. 이 줄이 없으면 그림 대조가 통째로 죽어도
  //    앞의 검사들이 글자 쪽만 보고 초록이 된다(스캔본 사용자에게는 도구가 죽은 것과 같다).
  const pixelOnly = await compare(V1, V2, 'pixel');
  check('그림만 모드', /달라졌습니다/.test(pixelOnly.status), `상태줄: ${pixelOnly.status}`);
  check('그림만 · 줄 없음', pixelOnly.lines.length === 0, `줄 ${pixelOnly.lines.length}개가 나왔다`);
  const pixelSame = await compare(V1, V1, 'pixel');
  check('그림만 · 같은 파일', /같습니다/.test(pixelSame.status), `상태줄: ${pixelSame.status}`);
} catch (e) {
  failures.push(`검사가 끝까지 못 갔다: ${e.message}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.log(`[smoke-pdfdiff] 실패 ${failures.length}건`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('[smoke-pdfdiff] 판본 대조 4가지 확인 — 다른 판본 · 같은 파일 · 글자만 · 그림만');
