/**
 * 유령 타자 대결이 실제로 대결이 되는지 (TASK-KL-131)
 *
 * 다른 검사로는 못 잡는다 — 「값을 넣으면 반응하는지」는 한 칸에 글자를 넣고 화면이 달라지는지만
 * 본다. 이 도구의 존재 이유는 **친 기록이 주소가 되고, 그 주소를 열면 유령이 달리는 것**이라
 * 그 한 바퀴를 직접 돌려 봐야 한다. 화면이 뜨는지 보는 검사는 유령이 통째로 죽어도 통과한다.
 *
 * 한 바퀴:
 *   ① 글을 끝까지 친다 → 결과와 **주소**가 나온다
 *   ② 그 주소를 새로 연다 → 유령 이름이 뜨고, 치는 동안 유령이 **앞으로 나아간다**
 *   ③ 아주 빠르게 치면 이기고, 느리게 치면 진다 (판정이 한쪽으로 굳어 있지 않다)
 *   ④ 타수는 자소 단위다 — 「값」 한 글자가 4타로 세어져야 한다
 *
 * 사용: node scripts/smoke-ghosttype.mjs
 *       BASE=http://127.0.0.1:8801/apps/blog node scripts/smoke-ghosttype.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitHydrated } from './lib/hydrated.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
void root;
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const URL_TOOL = `${BASE}/karmolab/t/ghosttype/`;

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name} — ${detail}`);
};

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => failures.push(`페이지 오류: ${e.message}`));

/* 도구가 만드는 주소는 실제 사이트 기준(주소 뿌리 + /karmolab/t/...)이다.
 * 로컬 사본은 뿌리가 한 칸 더 들어가 있으므로, 검사에서는 해시만 떼어 붙인다. */
function withGhost(url) {
  const i = url.indexOf('#');
  return i < 0 ? URL_TOOL : URL_TOOL + url.slice(i);
}

async function open(url) {
  // 빈 쪽을 거쳐 간다 — 주소만 바뀌면 도구가 스스로 새로 열기 때문에(같은 문서 안 이동 대응),
  // 곧바로 옮겨 가면 검사가 그 새로 열림과 겹쳐 치던 글자를 잃는다.
  await page.goto('about:blank');
  const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (res && res.status() === 404) throw new Error(`페이지가 아직 없다 (${BASE} 에 배포되기 전)`);
  // 보인다고 손이 달린 것은 아니다 — 미리 그린 그림과 진짜 화면 사이 틈 (TASK-KL-135)
  await waitHydrated(page, '#gtInput');
}

/** 지금 화면의 글을 한 글자씩 친다. perChar 를 크게 주면 느리게 친 판이 된다. */
async function typeAll(perChar) {
  /* ★ 칠 글은 **치기 직전에** 읽는다 (2026-08-12). 위젯이 말 묶음을 받아 온 뒤 화면을 다시
   *   그리면서 글이 바뀌는 순간이 있다 — 먼저 읽어 둔 옛 글을 치면 끝까지 쳐도 「다 쳤다」가
   *   안 되고, 검사는 `#gtUrl` 을 20초 기다리다 죽는다(실주소에서 그렇게 빨갰다).
   *   한 글자 칠 때마다 지금 글과 견주고, 글이 바뀌면 그 자리에서 다시 시작한다. */
  let target = await page.evaluate(() => document.querySelector('#gtText')?.textContent || '');
  if (!target) throw new Error('칠 글이 화면에 없다');
  for (let i = 0; i < target.length; i += 1) {
    const now = await page.evaluate(() => document.querySelector('#gtText')?.textContent || '');
    if (now !== target) { target = now; i = -1; await page.fill('#gtInput', ''); continue; }
    await page.fill('#gtInput', target.slice(0, i + 1));
    if (perChar > 0) await page.waitForTimeout(perChar);
  }
  await page.waitForSelector('#gtUrl', { timeout: 20000 });
  return page.evaluate(() => ({
    url: document.querySelector('#gtUrl')?.value || '',
    verdict: document.querySelector('.gt-verdict')?.textContent || '',
    score: document.querySelector('.gt-score')?.textContent || ''
  }));
}

try {
  // ① 한 판 치면 주소가 나온다 (느리게 쳐서, 뒤에 올 사람이 이길 수 있게)
  await open(URL_TOOL);
  const first = await typeAll(30);
  check('첫 판 주소', /#g=/.test(first.url), `주소: ${first.url.slice(0, 60)}`);
  check('첫 판 결과', /기록 완료/.test(first.verdict), `판정: ${first.verdict}`);
  check('타수 표기', /\d+타/.test(first.score), `점수: ${first.score}`);

  // ② 그 주소를 열면 유령이 기다리고, 치는 동안 앞으로 나아간다
  await open(withGhost(first.url));
  const banner = await page.evaluate(() => {
    const b = document.querySelector('#gtBanner');
    return { shown: !!b && b.style.display !== 'none', name: document.querySelector('#gtGhostName')?.textContent || '' };
  });
  check('유령 안내', banner.shown, '유령이 있는 주소인데 안내가 안 보인다');
  check('유령 이름', banner.name.length > 0, '유령 이름이 비어 있다');

  const before = await page.evaluate(() => document.querySelector('#gtGhost')?.style.left || '');
  await page.fill('#gtInput', '아');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => document.querySelector('#gtGhost')?.style.left || '');
  check('유령이 달린다', before !== after, `유령 위치가 그대로다 (${before} → ${after})`);

  // ③ 아주 빠르게 치면 이긴다 — 판정이 한쪽으로 굳어 있지 않은지
  await open(withGhost(first.url));
  const fast = await typeAll(0);
  check('빠르면 이긴다', /이겼다/.test(fast.verdict), `판정: ${fast.verdict}`);

  // ④ 느리게 치면 진다
  await open(withGhost(fast.url));
  const slow = await typeAll(60);
  check('느리면 진다', /졌다/.test(slow.verdict), `판정: ${slow.verdict}`);

  // ⑤ 타수는 자소 단위 — 「값」 한 글자를 4타로 세는가
  await open(URL_TOOL);
  const jamo = await page.evaluate(() => {
    const own = document.querySelector('#gtOwn');
    document.querySelector('#gtOwnToggle').click();
    own.value = '값값값값값값값값값값';
    document.querySelector('#gtOwnApply').click();
    return document.querySelector('#gtText')?.textContent || '';
  });
  check('내 글로 바꾸기', jamo === '값값값값값값값값값값', `바뀐 글: ${jamo}`);
  const own = await typeAll(0);
  check('자소 단위 타건', /40타건/.test(own.score), `점수: ${own.score} (10글자 × 4타 = 40이어야 한다)`);
  check('내 글이 주소에 담김', /#g=/.test(own.url) && own.url.length > 60, `주소: ${own.url.slice(0, 60)}`);
} catch (e) {
  failures.push(`검사가 끝까지 못 갔다: ${e.message}`);
} finally {
  await browser.close();
}

if (failures.length > 0) {
  console.log(`[smoke-ghosttype] 실패 ${failures.length}건`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('[smoke-ghosttype] 대결 한 바퀴 확인 — 주소 생성 · 유령 재생 · 이김/짐 양쪽 · 자소 타수 · 내 글');
