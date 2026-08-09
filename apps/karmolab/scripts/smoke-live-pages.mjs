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
const failures = [];

// 도구가 백 개에 가까워지면서 한 장씩 여는 것만으로 배포 뒤 점검이 몇 분씩 걸렸다.
// 서로 무관한 페이지라 동시에 몇 장씩 연다 (TASK-KL-089).
const LANES = 4;

async function checkOne(page, id) {
  const url = `${BASE}/karmolab/t/${id}/`;
  /* 없는 파일을 부르고 있는가 (TASK-KL-089).
   * 실제로 한 도구가 매번 없는 스크립트를 부르고 있었다 — 목록에 적힌 경로와 빌드가 내놓는
   * 자리가 어긋나서다. 화면은 멀쩡해 보여서 아무도 몰랐다. 방문 기록기는 남의 서버라 뺀다. */
  /* 화면이 안 뜨면 **왜인지**도 같이 알려 준다 (TASK-KL-089).
   * 지난번에 스크립트 차례를 바꿨다가 「Mdd is not defined」 가 나면서 위젯 등록이 끊겨
   * 도구 칸이 통째로 안 만들어졌다. 그런데 검사는 「빈 화면」만 말해서, 원인을 손으로 찾느라
   * 두 회차를 썼다. 오류 한 줄만 붙어 있었어도 그 자리에서 알았다. */
  const jsErrors = [];
  const onError = (e) => jsErrors.push(String(e.message).split('\n')[0].slice(0, 70));
  const onConsole = (m) => {
    if (m.type() === 'error' && !/gc\.zgo\.at|goatcounter|Failed to load resource/.test(m.text())) {
      jsErrors.push(m.text().split('\n')[0].slice(0, 70));
    }
  };
  page.on('pageerror', onError);
  page.on('console', onConsole);

  const missing = [];
  const onResponse = (r) => {
    if (r.status() >= 400 && !/gc\.zgo\.at|goatcounter/.test(r.url())) {
      missing.push(`${r.status()} ${r.url().split('/').slice(-2).join('/')}`);
    }
  };
  page.on('response', onResponse);
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  /* 도구 화면이 그려질 때까지 기다린다 — 고정 시간(700ms)으로 재면 **늦게 뜨는 도구가 억울하게
   * 걸린다.** 실제로 글자표(코드 두 덩이를 받는다)가 세 번 다 「빈 화면」으로 잡혔는데,
   * 3초 뒤에 보면 멀쩡히 떠 있었다. 진짜로 안 뜨는 페이지는 이 기다림이 끝나고 그대로 걸린다. */
  await page
    .waitForFunction(
      (toolId) => {
        const vis = (e) => e && e.getBoundingClientRect().height > 0;
        const own = document.getElementById('page-' + toolId);
        return vis(own) && own.querySelectorAll('*').length >= 8;
      },
      id,
      { timeout: 8000 }
    )
    .catch(() => {});
  await page.waitForTimeout(300);
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
  const reach = await page.evaluate(async () => {
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

    /* 설명은 화면에 가까워질 때 그려지도록 미뤄 두었다(tools.css). 그래서 한 번에 끝까지
     * 굴리면 그 순간 새로 그려진 만큼 페이지가 길어져 아직 끝이 아니다 — 길이가 멈출 때까지
     * 몇 번 더 굴린다. 사람은 조금씩 굴리므로 겪지 않는 일이고, 검사만 이래야 한다. */
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 20; i++) {
      const before = scroller.scrollHeight;
      scroller.scrollTop = scroller.scrollHeight;
      await frame(); // 그려질 틈을 준다 — 안 그러면 길이가 갱신되기 전에 다음으로 넘어간다
      if (scroller.scrollHeight === before) break;
    }
    const last = seo.querySelector('.tool-seo-note') || seo.lastElementChild;
    const b = last.getBoundingClientRect();
    return b.top < window.innerHeight && b.bottom > 0
      ? { ok: true }
      : { ok: false, why: '끝까지 굴려도 설명 끝이 안 보임' };
  });
  state.reachable = reach.ok;
  state.why = reach.why || '';

  /* 좁은 폰에서 옆으로 잘려 못 보는 내용이 있는가 (TASK-KL-089).
   * 페이지가 통째로 옆으로 넘치는 일은 이 앱 구조상 안 생긴다 — 대신 **잘라낸다**. 그래서
   * 잘린 쪽이 증상이다: 「Ctrl+Shift」 같은 글자가 칸을 넘으면 그만큼 안 보이고 굴릴 수도 없다
   * (참고표 여섯 장이 실제로 그랬다). 옆으로 굴릴 수 있는 영역은 괜찮으니 뺀다. */
  const wide = page.viewportSize();
  await page.setViewportSize({ width: 375, height: 720 }); // 흔한 폰 폭
  await page.waitForTimeout(250);
  state.clipped = await page.evaluate(() => {
    const hits = [];
    for (const e of document.querySelectorAll('body *')) {
      if (e.scrollWidth <= e.clientWidth + 2) continue;
      const s = getComputedStyle(e);
      if (s.overflowX === 'auto' || s.overflowX === 'scroll') continue;
      const b = e.getBoundingClientRect();
      if (b.height < 8 || b.width < 8) continue;
      const what = (e.className || e.tagName).toString().split(' ')[0].slice(0, 20);
      hits.push(`${what} ${e.scrollWidth}>${e.clientWidth}`);
    }
    return hits.slice(0, 2).join(' , ');
  });

  /* 손가락으로 누를 수 있는 크기인가 (TASK-KL-089).
   * 체크 상자는 그 자체가 13px 이라, 라벨까지 합쳐도 22px 밖에 안 되는 것이 21장 있었다.
   * 글 속의 링크는 원래 작아도 되므로 조작 요소만 본다. */
  state.tiny = await page.evaluate(() => {
    const hits = [];
    for (const e of document.querySelectorAll('.tool-page input[type=checkbox], .tool-page input[type=radio]')) {
      const own = e.getBoundingClientRect();
      if (!own.width) continue;
      const box = (e.closest('label') || e).getBoundingClientRect();
      if (Math.min(box.width, box.height) < 32) hits.push(`${Math.round(box.width)}x${Math.round(box.height)}`);
    }
    return hits.slice(0, 2).join(' , ');
  });
  /* 폰에서 입력칸을 누를 때 화면이 확대되지 않는가 (TASK-KL-089).
   * iOS 는 글씨가 16px 보다 작은 입력칸을 누르면 화면을 확대하고, 쓰던 자리가 밀려 나간다.
   * 고르는 상자 두 개는 위젯 코드가 인라인으로 크기를 박아 두어 스타일로 못 고친다 —
   * 그건 그쪽에 넘겼으므로 여기서는 뺀다(안 그러면 영영 빨간 검사가 된다). */
  state.zoomy = await page.evaluate(() => {
    const hits = [];
    const sel = '.tool-page input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]), .tool-page textarea';
    for (const e of document.querySelectorAll(sel)) {
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const px = parseFloat(getComputedStyle(e).fontSize);
      if (px < 16) hits.push(`${e.tagName.toLowerCase()} ${px}px`);
    }
    return hits.slice(0, 2).join(' , ');
  });

  /* 글씨가 읽을 수 있는 크기인가 (TASK-KL-089).
   * 이 사이트 글자 눈금의 가장 작은 값은 12px 인데, 참고표 부제만 10px 로 박혀 있어
   * 폰에서 넉 장이 읽기 힘들었다. 아스키 아트처럼 **글자로 그림을 그리는** 곳은 뺀다. */
  state.unreadable = await page.evaluate(() => {
    const artsy = ['aa-out', 'ascii-art'];
    const hits = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walk.nextNode())) {
      if ((n.textContent || '').trim().length < 2) continue;
      const e = n.parentElement;
      if (!e || seen.has(e)) continue;
      seen.add(e);
      const cls = (e.className || '').toString();
      if (artsy.some((a) => cls.includes(a)) || e.closest('[class*="aa-out"]')) continue;
      const b = e.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const px = parseFloat(getComputedStyle(e).fontSize);
      if (px < 12) hits.push(`${cls.split(' ')[0].slice(0, 18) || e.tagName} ${px}px`);
    }
    return hits.slice(0, 2).join(' , ');
  });
  if (wide) await page.setViewportSize(wide); // 다음 페이지는 원래 폭에서 본다
  page.off('response', onResponse);
  page.off('pageerror', onError);
  page.off('console', onConsole);
  state.jsError = [...new Set(jsErrors)].slice(0, 2).join(' , ');
  state.missing = [...new Set(missing)].slice(0, 2).join(' , ');

  // 요소 하한 8개 — 실제로 재 보니 가장 단출한 도구가 10개다(사업자번호 검사).
  // 예전 기준(5개)은 껍데기만 남은 화면도 통과시켰다. 슬러그 도구를 일부러 망가뜨렸을 때
  // 요소 5개짜리 빈 화면이 그대로 초록이었다.
  const ok =
    res.status() === 200 && state.built && state.visible && state.nodes >= 8 && state.usable && state.reachable && !state.clipped && !state.tiny && !state.unreadable && !state.zoomy && !state.missing;
  if (!ok) {
    failures.push(
      `${id}: http=${res.status()} 화면생성=${state.built} 보임=${state.visible} 요소=${state.nodes} 쓸것있음=${state.usable} 설명닿음=${state.reachable}${state.why ? "(" + state.why + ")" : ""}${state.clipped ? " 잘림=" + state.clipped : ""}${state.tiny ? " 누르기작음=" + state.tiny : ""}${state.unreadable ? " 글씨작음=" + state.unreadable : ""}${state.zoomy ? " 눌러도확대=" + state.zoomy : ""}${state.missing ? " 없는파일=" + state.missing : ""}${state.jsError ? " 오류=" + state.jsError : ""} 위치=${state.here}`
    );
    process.stdout.write('x');
  } else {
    process.stdout.write('.');
  }
}

// 각 차선이 자기 페이지를 하나 열어 두고 목록을 나눠 가져간다.

const queue = [...ids];
await Promise.all(
  Array.from({ length: Math.min(LANES, queue.length) }, async () => {
    const page = await browser.newPage();
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined) break;
      try {
        await checkOne(page, id);
      } catch (e) {
        failures.push(`${id}: 여는 중 실패 — ${String(e.message).slice(0, 70)}`);
        process.stdout.write('x');
      }
    }
    await page.close();
  })
);
process.stdout.write('\n');
await browser.close();

/*
 * ── 마크다운 쌍둥이 (`/karmolab/t/<id>.md`) — 읽으러 온 쪽이 받는 판
 *
 * 이 129장은 **사람이 안 보는 자리**라 깨져도 아무도 눈치채지 못한다. 실제로 두 번 깨져 있었다:
 * 한 번은 다음 생성기가 폴더째 지워서 404, 한 번은 살아남았지만 Jekyll 이 HTML 로 바꿔 놓아서
 * 마크다운을 달라고 온 쪽에 `<h1>` 이 갔다. 둘 다 **빌드 로그는 성공**이었다.
 *
 * 그래서 배포된 주소를 직접 받아 본다. 브라우저는 필요 없다 — 글자만 보면 된다.
 * 표본 몇 개면 충분하다(생성기가 하나라 하나가 깨지면 전부 깨진다).
 */
const MD_SAMPLES = ids.slice(0, 3);
for (const id of MD_SAMPLES) {
  const url = `${BASE}/karmolab/t/${id}.md`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok === false) {
      failures.push(`${id}.md: ${res.status} — 마크다운 쌍둥이가 안 올라갔다 (${url})`);
      continue;
    }
    const text = (await res.text()).trim();
    if (text.startsWith('<')) {
      failures.push(`${id}.md: HTML 이 왔다 — 원본이 .md 라 Jekyll 이 변환했을 것 (${url})`);
    } else if (text.startsWith('#') === false) {
      failures.push(`${id}.md: 마크다운 제목으로 시작하지 않는다: ${text.slice(0, 40)}`);
    }
  } catch (e) {
    failures.push(`${id}.md: 받지 못했다 — ${String(e.message).slice(0, 60)}`);
  }
}

if (failures.length) {
  console.error(`[smoke-live-pages] 빈 화면 ${failures.length}건 / ${ids.length}`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-live-pages] ${ids.length}개 도구 페이지 모두 화면이 보인다`);
