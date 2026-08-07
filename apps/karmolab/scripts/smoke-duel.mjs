/**
 * 번개 대결이 진짜로 둘을 붙이는지 (TASK-KL-132)
 *
 * 이 도구에서 제일 위험한 조각은 미니게임이 아니라 **연결**이다. 화면이 뜨는지 보는 검사도,
 * 값을 넣으면 반응하는지 보는 검사도 전부 창 하나만 본다 — 둘이 안 붙어도 통과한다.
 * 그래서 창을 둘 띄워 한 판을 끝까지 돌린다.
 *
 * 보는 것:
 *   ① 방을 만들면 링크가 나온다
 *   ② 그 링크를 다른 창에서 열면 **서로 붙는다** (공개망을 거쳐, 우리 서버 없이)
 *   ③ 다섯 판이 끝까지 굴러 승부가 난다
 *   ④ 양쪽 점수판이 **서로 뒤집힌 값으로 일치한다** — 한쪽에서만 세면 승부가 갈리지 않는다
 *
 * **자동 묶음(audit:all)에는 일부러 안 넣었다.** 바깥 공개망(짝짓기)에 기대는 검사라 망이 막힌
 * 자리에서는 늘 빨갛다 — 늘 시끄러운 경보는 꺼진 경보와 같다. `npm run test:duel` 로 손수 돌린다
 * (연결 쪽을 건드렸으면 반드시).
 *
 * 바깥 공개망을 타므로 인터넷이 막힌 자리에서는 못 돈다. 그때는 「못 돌았다」(2)로 끝낸다 —
 * 통과도 실패도 아니다. 둘을 같은 글자로 적으면 게이트가 죽은 것을 아무도 모른다.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const TOOL = `${BASE}/karmolab/t/duel/`;
const CONNECT_MS = 60000; // 공개망을 거쳐 붙는 데 걸리는 시간은 들쭉날쭉하다
const MATCH_MS = 90000;

const failures = [];
const check = (name, cond, detail) => {
  if (!cond) failures.push(`${name} — ${detail}`);
};

const browser = await chromium.launch();
let cantRun = '';

/* 검사가 **정답을 푼다.** 아무거나 찍으면 둘 다 틀린 판이 나와 점수가 0:0 이 되고,
 * 그러면 판정이 통째로 고장 나도 통과한다 — 「이긴 판이 하나는 나온다」를 못 박으려면 풀어야 한다. */
const 팔레트 = { 빨강: '#e0483c', 파랑: '#3b74d8', 초록: '#33a06a', 노랑: '#d8a72a', 보라: '#8a5cd0' };

/** 지금 화면의 정답 자리. 못 풀면 -1. */
function solveInPage(팔레트) {
  const order = document.querySelector('#duOrder')?.textContent || '';
  const btns = [...document.querySelectorAll('.du-choice')];
  if (btns.length === 0) return -1;
  const texts = btns.map((b) => b.textContent || '');

  const 색 = order.match(/^(\S+) 색!$/);
  if (색) {
    const want = 팔레트[색[1]];
    const hex = (rgb) => {
      const m = rgb.match(/\d+/g);
      return m ? '#' + m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : '';
    };
    return btns.findIndex((b) => hex(getComputedStyle(b).color) === want);
  }
  if (order === '큰 쪽!') {
    const nums = texts.map(Number);
    return nums.indexOf(Math.max(...nums));
  }
  // 초성: 각 보기의 첫소리를 뽑아 명령과 맞춰 본다
  const 초성표 = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const 첫소리 = (w) =>
    [...w]
      .map((ch) => {
        const c = ch.charCodeAt(0) - 0xac00;
        return c >= 0 && c <= 11171 ? 초성표[Math.floor(c / 588)] : ch;
      })
      .join('');
  return texts.findIndex((t) => 첫소리(t) === order);
}

/** solve=true 면 정답을 눌러 이기려 하고, false 면 늘 첫 칸을 눌러 대충 둔다. */
async function playUntilEnd(page, deadline, solve, 팔레트) {
  while (Date.now() < deadline) {
    const over = await page.evaluate(() => /이겼다|졌다|비겼다/.test(document.querySelector('#duOrder')?.textContent || ''));
    if (over) return true;
    const i = solve ? await page.evaluate(solveInPage, 팔레트) : 0;
    if (i >= 0) {
      const btn = page.locator('.du-choice:not([disabled])').nth(i);
      if (await btn.count()) await btn.click({ timeout: 2000 }).catch(() => {});
    }
    await page.waitForTimeout(100);
  }
  return false;
}

try {
  const a = await browser.newPage();
  const b = await browser.newPage();
  for (const [who, p] of [
    ['A', a],
    ['B', b]
  ]) {
    p.on('pageerror', (e) => failures.push(`${who} 쪽 페이지 오류: ${e.message}`));
  }

  // ① 방을 만들면 링크가 나온다
  const res = await a.goto(TOOL, { waitUntil: 'domcontentloaded' });
  if (res && res.status() === 404) throw new Error(`페이지가 아직 없다 (${BASE} 에 배포되기 전)`);
  await a.waitForSelector('#duMake', { timeout: 30000 });
  await a.fill('#duName', '가');
  await a.click('#duMake');
  await a.waitForSelector('#duUrl', { timeout: 15000 });
  const url = await a.inputValue('#duUrl');
  check('대결 링크', /#r=/.test(url), `링크: ${url}`);

  // ② 링크를 다른 창에서 열면 붙는다 (검사에서는 뿌리가 다를 수 있어 해시만 옮겨 붙인다)
  const hash = url.slice(url.indexOf('#'));
  await b.goto(TOOL + hash, { waitUntil: 'domcontentloaded' });
  await b.waitForSelector('#duName', { timeout: 30000 });
  await b.fill('#duName', '나');

  const joined = await a
    .waitForFunction(() => /붙었다/.test(document.querySelector('#duStatus')?.textContent || ''), { timeout: CONNECT_MS })
    .then(() => true)
    .catch(() => false);
  if (!joined) {
    cantRun = '둘이 안 붙었다 — 이 자리에서 공개망(짝짓기)이 막혀 있을 수 있다';
    throw new Error(cantRun);
  }

  // ③ 다섯 판이 끝까지 굴러 승부가 난다
  const deadline = Date.now() + MATCH_MS;
  // A 는 정답을 풀고, B 는 늘 첫 칸을 누른다 — A 가 이긴 판이 하나도 없으면 판정이 고장 난 것이다.
  const [endedA, endedB] = await Promise.all([playUntilEnd(a, deadline, true, 팔레트), playUntilEnd(b, deadline, false, 팔레트)]);
  check('A 쪽 승부', endedA, '다섯 판이 안 끝났다');
  check('B 쪽 승부', endedB, '다섯 판이 안 끝났다');

  // ④ 양쪽 점수판이 뒤집힌 값으로 일치한다
  const read = (p) =>
    p.evaluate(() => ({
      me: Number(document.querySelector('#duMeScore')?.textContent || -1),
      foe: Number(document.querySelector('#duFoeScore')?.textContent || -1),
      foeName: document.querySelector('#duFoeName')?.textContent || ''
    }));
  const sa = await read(a);
  const sb = await read(b);
  check('점수 일치', sa.me === sb.foe && sa.foe === sb.me, `A ${sa.me}:${sa.foe} · B ${sb.me}:${sb.foe}`);
  check('판정이 산다', sa.me >= 1, `푸는 쪽이 한 판도 못 이겼다 (A ${sa.me}:${sa.foe})`);
  check('판 수', sa.me + sa.foe <= 5, `이긴 판 합계 ${sa.me + sa.foe}`);
  check('상대 이름', sa.foeName === '나' && sb.foeName === '가', `A가 본 이름 ${sa.foeName} · B가 본 이름 ${sb.foeName}`);
} catch (e) {
  if (!cantRun) failures.push(`검사가 끝까지 못 갔다: ${e.message}`);
} finally {
  await browser.close();
}

if (cantRun) {
  console.log(`[smoke-duel] 못 돌았다 — ${cantRun} (통과 아님)`);
  process.exit(2);
}
if (failures.length > 0) {
  console.log(`[smoke-duel] 실패 ${failures.length}건`);
  for (const f of failures) console.log('  - ' + f);
  process.exit(1);
}
console.log('[smoke-duel] 창 둘이 붙어 한 판을 끝냈다 — 링크 · 연결 · 다섯 판 · 점수 일치');
