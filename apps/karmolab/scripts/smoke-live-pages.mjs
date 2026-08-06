/**
 * 배포된 도구 페이지가 실제로 화면을 그리는지 확인 (TASK-KL-088)
 *
 * 도구 페이지는 HTML 이 200 이어도 **자바스크립트가 다른 곳으로 튕기면 빈 화면**이 된다.
 * 실제로 그런 일이 있었다 — 묶음으로 보내는 규칙이 상세 페이지에서도 발동해서,
 * 코드가 로드되지도 않은 묶음으로 옮겨 가 41개 페이지가 조용히 비었다.
 * 200 응답만 보면 절대 안 잡히므로, 브라우저로 열어 도구 화면이 보이는지 본다.
 *
 * 사용: node scripts/smoke-live-pages.mjs [id ...]   (기본 = 전 도구)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(seo);

const browser = await chromium.launch();
const page = await browser.newPage();
const failures = [];

for (const id of ids) {
  const url = `${BASE}/karmolab/t/${id}/`;
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const state = await page.evaluate((toolId) => {
    const el = document.getElementById('page-' + toolId);
    if (!el) return { built: false, visible: false, nodes: 0, reachable: false, here: location.pathname };
    const visible = getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;

    // 「쓸 것이 있는가」 — 조작할 것이 하나라도 있거나, 읽을 글이 있어야 한다.
    // (달 위상처럼 보여 주기만 하는 도구가 있어 조작 요소를 필수로 둘 수는 없다.)
    const controls = el.querySelectorAll('button, input, select, textarea, canvas, a').length;
    const text = (el.textContent || '').trim().length;
    return {
      built: true,
      visible,
      nodes: el.querySelectorAll('*').length,
      usable: controls > 0 || text >= 20,
      here: location.pathname
    };
  }, id);

  // 도구 아래의 설명·FAQ 까지 사람이 실제로 닿는지 (TASK-KL-089).
  // 화면을 꽉 쓰는 도구는 바깥 스크롤이 꺼져 이 부분이 통째로 잘린 적이 있다.
  // 주의: 코드로 scrollIntoView 를 부르면 스크롤이 꺼져 있어도 위치가 옮겨져 **통과해 버린다**
  // (실제로 이 검사를 그렇게 짰다가 거짓 통과를 봤다). 휠을 굴리는 방법도 마우스가 어디
  // 있느냐에 따라 결과가 뒤집혀 못 쓴다 — 도구가 휠을 먼저 먹기 때문이다.
  // 그래서 스크롤을 가진 영역의 *상태*로 판정한다.
  const reach = await page.evaluate(() => {
    const seo = document.querySelector('.tool-seo');
    if (!seo) return { ok: true, why: '설명 블록 없음' };

    // 설명을 담고 있는 스크롤 영역을 찾는다.
    let box = seo.parentElement;
    while (box && box !== document.body) {
      const oy = getComputedStyle(box).overflowY;
      if ((oy === 'auto' || oy === 'scroll' || oy === 'hidden') && box.scrollHeight > box.clientHeight + 4) break;
      box = box.parentElement;
    }
    const scroller = box && box !== document.body ? box : document.scrollingElement;

    // 넘치는 내용이 있는데 그 영역이 hidden 이면 사람은 아래를 볼 방법이 없다.
    // (코드로 scrollIntoView 를 부르면 hidden 이어도 옮겨져 통과해 버리므로, 상태로 판정한다.)
    const oy = getComputedStyle(scroller).overflowY;
    const overflows = scroller.scrollHeight > scroller.clientHeight + 4;
    if (overflows && oy === 'hidden') return { ok: false, why: '스크롤이 꺼져 아래를 볼 수 없음' };

    scroller.scrollTop = scroller.scrollHeight;
    const last = seo.querySelector('.tool-seo-note') || seo.lastElementChild;
    const b = last.getBoundingClientRect();
    return b.top < window.innerHeight && b.bottom > 0
      ? { ok: true }
      : { ok: false, why: '끝까지 굴려도 설명 끝이 안 보임' };
  });
  state.reachable = reach.ok;
  state.why = reach.why || '';

  // 요소 하한 8개 — 실제로 재 보니 가장 단출한 도구가 10개다(사업자번호 검사).
  // 예전 기준(5개)은 껍데기만 남은 화면도 통과시켰다. 슬러그 도구를 일부러 망가뜨렸을 때
  // 요소 5개짜리 빈 화면이 그대로 초록이었다.
  const ok =
    res.status() === 200 && state.built && state.visible && state.nodes >= 8 && state.usable && state.reachable;
  if (!ok) {
    failures.push(
      `${id}: http=${res.status()} 화면생성=${state.built} 보임=${state.visible} 요소=${state.nodes} 쓸것있음=${state.usable} 설명닿음=${state.reachable}${state.why ? "(" + state.why + ")" : ""} 위치=${state.here}`
    );
    process.stdout.write('x');
  } else {
    process.stdout.write('.');
  }
}
process.stdout.write('\n');
await browser.close();

if (failures.length) {
  console.error(`[smoke-live-pages] 빈 화면 ${failures.length}건 / ${ids.length}`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-live-pages] ${ids.length}개 도구 페이지 모두 화면이 보인다`);
