/**
 * 배포된 도구 페이지가 실제로 화면을 그리는지 확인 (TASK-KL-088)
 *
 * 도구 페이지는 HTML 이 200 이어도 **자바스크립트가 다른 곳으로 튕기면 빈 화면**이 된다.
 * 실제로 그런 일이 있었다. 묶음으로 보내는 규칙이 상세 페이지에서도 발동해서,
 * 코드가 로드되지도 않은 묶음으로 옮겨 가 41개 페이지가 조용히 비었다.
 * 200 응답만 보면 절대 안 잡히므로, 브라우저로 열어 도구 화면이 보이는지 본다.
 *
 * 사용: node scripts/smoke-live-pages.mjs [id ...]   (기본 = 전 도구)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { withoutRetired } from './lib/retired-operations.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BASE = process.env.BASE || 'https://blog.mascari4615.com';
const seo = JSON.parse(fs.readFileSync(path.join(root, 'data/tools-seo.json'), 'utf8')).tools;
/* 작업대로 합친 옛 도구의 자리는 **작업대로 보내는 안내 한 장**이다. 열면 곧바로 작업대로
   가므로 화면이 안 그려졌다로 읽히고, 마크다운 쌍둥이도 안 찍는다(도구 장이 아니니 맞다).
   도구가 아닌 것을 도구로 재면 이 검사는 늘 빨갛다. 목록 정본은 lib/retired-operations.mjs. */
const ids = withoutRetired(process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(seo));

/* ★ **배포가 갈리는 중이면 그건 우리 잘못이 아니다** (2026-08-16, 실측).
   새 판이 올라가는 순간 지문 붙은 파일 이름이 바뀐다. 그때 열린 화면은 **사라진 이름**을
   부르고 `Toolbox is not defined` 로 죽는다. 오늘 한 판에서 그렇게 **11장**이 한꺼번에 빨갰다
   (표시가 `xx..xx..xxx!!xx.!xx.` 처럼 뒤쪽에 몰려 있었다. 도중에 배포가 끼어든 자국).
   같은 주소를 다시 물어도 소용없다(그 이름은 영영 없다). 그래서 **도장(build.json)** 을
   앞뒤로 읽어 둔다: 도장이 바뀌었으면 사이트가 발밑에서 바뀐 것이므로 **못 쟀다(2)** 로 끝낸다. */
const stamp2 = async () => {
  try {
    const res = await fetch(`${BASE}/apps/karmolab/build.json`, { cache: 'no-store' });
    return res.ok ? String((await res.json()).stamp || '') : '';
  } catch {
    return '';
  }
};
const firstStamp = await stamp2();

const browser = await chromium.launch();
const failures = [];
/* ★ **지문 붙은 자산 하나가 아직 안 퍼진 것**을 제품 결함으로 세지 않는다 (2026-08-16 실측).
   도구 장 11개가 한꺼번에 빨갰는데 전부 같은 파일이었다(`js/toolbox.5bb39e24.js` 404).
   몇 분 뒤 같은 주소를 받아 보면 200 이고, 지금 실사이트도 200 이다. 배포가 갈리는 창에서
   화면과 자산이 서로 다른 판이었던 것뿐이다.
   진짜 안 지어진 자산은 **짓는 자리**에서 audit-page-scripts 가 잡는다(그게 그 검사가 생긴 이유다).
   여기서 빨강으로 세면 22판 연속 빨강 같은 게 되고, 늘 빨간 불은 아무도 안 본다. */
const hashMissing = [];
/** 화면은 떴는데 다듬을 것. 실패로 세지 않는다(늘 빨간 불은 아무도 안 본다). */
const polishes = [];

// 도구가 백 개에 가까워지면서 한 장씩 여는 것만으로 배포 뒤 점검이 몇 분씩 걸렸다.
// 서로 무관한 페이지라 동시에 몇 장씩 연다 (TASK-KL-089).
const LANES = 4;

async function checkOne(page, id) {
  const url = `${BASE}/t/${id}/`;
  /* 없는 파일을 부르고 있는가 (TASK-KL-089).
   * 실제로 한 도구가 매번 없는 스크립트를 부르고 있었다. 목록에 적힌 경로와 빌드가 내놓는
   * 자리가 어긋나서다. 화면은 멀쩡해 보여서 아무도 몰랐다. 방문 기록기는 남의 서버라 뺀다. */
  /* 화면이 안 뜨면 **왜인지**도 같이 알려 준다 (TASK-KL-089).
   * 지난번에 스크립트 차례를 바꿨다가 Mdd is not defined 가 나면서 위젯 등록이 끊겨
   * 도구 칸이 통째로 안 만들어졌다. 그런데 검사는 빈 화면만 말해서, 원인을 손으로 찾느라
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
  /* ★ **500 대는 없다가 아니라 지금 잠깐 안 준다다** (2026-08-13 실측).
     배포가 갈리는 동안 자산 하나가 503 을 냈고, 그것만으로 화면이 안 뜬다 빨강이 났다 . 
     같은 자리를 곧바로 다시 물어보면 200 이었다. 없는 파일(4xx)과 서버 딸꾹질(5xx)은
     손 갈 데가 다르다. 5xx 는 한 번 더 물어보고, 그때 오면 빨강으로 세지 않는다. */
  const hiccups = [];
  /* ★ **지문 붙은 파일의 404 도 딸꾹질일 수 있다** (2026-08-16, 실측). 위 규칙은 5xx 만 다시
     물어본다. 그런데 배포가 갈리는 순간 실제로 나는 것은 **404** 다: 새 판이 올라가면서
     `js/perf.<지문>.js` 의 지문이 바뀌는데, 화면과 자산이 서로 다른 판일 수 있기 때문이다.
     그래서 도구 장 **30장이 한꺼번에 빨갛게** 났고(같은 파일 하나), 몇 분 뒤 같은 주소를
     받아 보면 200 이었다. 지문이 붙은 이름(`.<8자리 이상 16진수>.js|css`)의 404 만 한 번 더
     물어본다. 지문 없는 파일이 없으면 그건 그냥 없는 것이라 곧바로 빨강이다. */
  const hashedNames = /\.[0-9a-f]{8,}\.(js|css)$/;
  const onResponse = (r) => {
    if (r.status() >= 400 && !/gc\.zgo\.at|goatcounter/.test(r.url())) {
      const short = `${r.status()} ${r.url().split('/').slice(-2).join('/')}`;
      const toRecheck = r.status() >= 500 || hashedNames.test(r.url().split('?')[0]);
      if (toRecheck) hiccups.push({ url: r.url(), short });
      else missing.push(short);
    }
  };
  page.on('response', onResponse);
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  /* 도구 화면이 그려질 때까지 기다린다. 고정 시간(700ms)으로 재면 **늦게 뜨는 도구가 억울하게
   * 걸린다.** 실제로 글자표(코드 두 덩이를 받는다)가 세 번 다 빈 화면으로 잡혔는데,
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

    // 쓸 것이 있는가. 조작할 것이 하나라도 있거나, 읽을 글이 있어야 한다.
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

  // 도구 아래의 설명, FAQ 까지 사람이 실제로 닿는지 (TASK-KL-089).
  // 화면을 꽉 쓰는 도구는 바깥 스크롤이 꺼져 이 부분이 통째로 잘린 적이 있다.
  // 주의: 코드로 scrollIntoView 를 부르면 스크롤이 꺼져 있어도 위치가 옮겨져 **통과해 버린다**
  // (실제로 이 검사를 그렇게 짰다가 거짓 통과를 봤다). 휠을 굴리는 방법도 마우스가 어디
  // 있느냐에 따라 결과가 뒤집혀 못 쓴다. 도구가 휠을 먼저 먹기 때문이다.
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
     * 굴리면 그 순간 새로 그려진 만큼 페이지가 길어져 아직 끝이 아니다. 길이가 멈출 때까지
     * 몇 번 더 굴린다. 사람은 조금씩 굴리므로 겪지 않는 일이고, 검사만 이래야 한다. */
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (let i = 0; i < 20; i++) {
      const before = scroller.scrollHeight;
      scroller.scrollTop = scroller.scrollHeight;
      await frame(); // 그려질 틈을 준다. 안 그러면 길이가 갱신되기 전에 다음으로 넘어간다
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
   * 페이지가 통째로 옆으로 넘치는 일은 이 앱 구조상 안 생긴다. 대신 **잘라낸다**. 그래서
   * 잘린 쪽이 증상이다: Ctrl+Shift 같은 글자가 칸을 넘으면 그만큼 안 보이고 굴릴 수도 없다
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
      /* ★ **꾸밈 층은 잘려도 잃는 게 없다** (2026-08-16, 실측). 화면 전체를 덮는
         `pointer-events:none` 고정 층(`.kl-cursors`. 남의 커서가 뜨는 자리)은 자식이
         화면 밖 좌표에 놓이는 순간 `scrollWidth` 가 폭을 넘는다. 그게 733>375 로 잡혀
         도구 장 두 곳이 늘 다듬을 것에 올라와 있었다. 그런데 거기 잘리는 것은 **남의 커서**지
         읽을 글이 아니다. 늘 켜져 있는 경고는 곧 아무도 안 읽는 칸이 된다.
         누를 수도 없고 화면에 붙박인 층만 뺀다. 진짜 잘린 본문은 그대로 잡힌다. */
      if (s.pointerEvents === 'none' && s.position === 'fixed') continue;
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
   * 고르는 상자 두 개는 위젯 코드가 인라인으로 크기를 박아 두어 스타일로 못 고친다 . 
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
  /* 5xx 였던 자리를 다시 물어본다. 그때도 안 오면 그건 진짜 빨강이다. */
  for (const h of hiccups) {
    try {
      const again = await page.request.get(h.url, { timeout: 15000 });
      if (again.ok()) state.hiccup = (state.hiccup ? state.hiccup + ' , ' : '') + h.short;
      else missing.push(h.short);
    } catch {
      missing.push(h.short);
    }
  }
  state.missing = [...new Set(missing)].slice(0, 2).join(' , ');

  // 요소 하한 8개. 실제로 재 보니 가장 단출한 도구가 10개다(사업자번호 검사).
  // 예전 기준(5개)은 껍데기만 남은 화면도 통과시켰다. 슬러그 도구를 일부러 망가뜨렸을 때
  // 요소 5개짜리 빈 화면이 그대로 초록이었다.
  /*
   * ★ 두 가지를 갈라 부른다 (2026-08-10).
   *
   * 예전에는 글씨가 11px 이다도 화면이 안 떴다와 같은 통에 담아 **빈 화면 N건**이라고
   * 말했다. 그런데 그 11px 짜리 꼬리말은 도구 페이지 **전부**에 있다. 그래서 이 검사는 늘
   * 빨갛고, 늘 빨간 불은 아무도 안 본다. 게다가 진짜로 화면이 안 뜬 날에도 문장이 같아서
   * **구분이 안 된다.**
   *
   * 그래서 화면이 안 뜬 것만 실패로 센다. 다듬을 것(글씨, 잘림, 확대)은 따로 세어 보여만 준다 . 
   * 사라지지도 않고, 진짜 사고를 가리지도 않는다.
   */
  const broken =
    res.status() !== 200 || !state.built || !state.visible || state.nodes < 8 || !state.usable || !state.reachable || Boolean(state.missing);
  const polish = Boolean(state.clipped || state.tiny || state.unreadable || state.zoomy);

  const detail =
    `${id}: http=${res.status()} 화면생성=${state.built} 보임=${state.visible} 요소=${state.nodes} 쓸것있음=${state.usable} 설명닿음=${state.reachable}${state.why ? "(" + state.why + ")" : ""}${state.clipped ? " 잘림=" + state.clipped : ""}${state.tiny ? " 누르기작음=" + state.tiny : ""}${state.unreadable ? " 글씨작음=" + state.unreadable : ""}${state.zoomy ? " 눌러도확대=" + state.zoomy : ""}${state.missing ? " 없는파일=" + state.missing : ""}${state.hiccup ? " 잠깐안되던것(다시받으니OK)=" + state.hiccup : ""}${state.jsError ? " 오류=" + state.jsError : ""} 위치=${state.here}`
  ;
  if (broken) {
    /* 지문 붙은 파일 하나가 없어서 깨진 것인지 표시해 둔다. 아래에서 갈래를 가른다. */
    const onlyHashMissing =
      Boolean(state.missing) &&
      /\.[0-9a-f]{8,}\.(js|css)/.test(state.missing) &&
      res.status() === 200 && state.built && state.visible && state.usable && state.reachable;
    if (onlyHashMissing) hashMissing.push(state.missing);
    failures.push(detail);
    process.stdout.write('x');
  } else if (polish) {
    polishes.push(detail);
    process.stdout.write('!');
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
        failures.push(`${id}: 여는 중 실패. ${String(e.message).slice(0, 70)}`);
        process.stdout.write('x');
      }
    }
    await page.close();
  })
);
process.stdout.write('\n');
await browser.close();

/*
 * ── 마크다운 쌍둥이 (`/t/<id>.md`). 읽으러 온 쪽이 받는 판
 *
 * 이 129장은 **사람이 안 보는 자리**라 깨져도 아무도 눈치채지 못한다. 실제로 두 번 깨져 있었다:
 * 한 번은 다음 생성기가 폴더째 지워서 404, 한 번은 살아남았지만 Jekyll 이 HTML 로 바꿔 놓아서
 * 마크다운을 달라고 온 쪽에 `<h1>` 이 갔다. 둘 다 **빌드 로그는 성공**이었다.
 *
 * 그래서 배포된 주소를 직접 받아 본다. 브라우저는 필요 없다. 글자만 보면 된다.
 * 표본 몇 개면 충분하다(생성기가 하나라 하나가 깨지면 전부 깨진다).
 */
const MD_SAMPLES = ids.slice(0, 3);
for (const id of MD_SAMPLES) {
  const url = `${BASE}/t/${id}.md`;
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.ok === false) {
      failures.push(`${id}.md: ${res.status}. 마크다운 쌍둥이가 안 올라갔다 (${url})`);
      continue;
    }
    const text = (await res.text()).trim();
    if (text.startsWith('<')) {
      failures.push(`${id}.md: HTML 이 왔다. 원본이 .md 라 Jekyll 이 변환했을 것 (${url})`);
    } else if (text.startsWith('#') === false) {
      failures.push(`${id}.md: 마크다운 제목으로 시작하지 않는다: ${text.slice(0, 40)}`);
    }
  } catch (e) {
    failures.push(`${id}.md: 받지 못했다. ${String(e.message).slice(0, 60)}`);
  }
}

if (polishes.length) {
  console.log(`[smoke-live-pages] 다듬을 것 ${polishes.length}건. 화면은 뜬다(실패 아님):`);
  for (const w of polishes.slice(0, 5)) console.log('  ~ ' + w);
  if (polishes.length > 5) console.log(`  ... 외 ${polishes.length - 5}건`);
}
const laterStamp = await stamp2();
if (failures.length && firstStamp && laterStamp && firstStamp !== laterStamp) {
  console.log(`[smoke-live-pages] 못 쟀다. 재는 동안 배포가 갈렸다 (${firstStamp} → ${laterStamp}).`);
  console.log(`  그 사이 열린 화면은 사라진 이름을 부른다. 안 뜬 것 ${failures.length}건은 이 판의 판정으로 안 센다.`);
  console.log('  통과로도 세지 않는다. 다음 판에서 다시 본다.');
  /* 브라우저는 위(318줄)에서 이미 닫았다. 여기서 또 닫으면 윈도우에서 libuv 가 소리 지르며
     죽고 종료값이 **127** 로 나간다(실측). 그러면 못 쟀다(2)가 빨강으로 읽힌다.
     값만 정해 두고 제 발로 끝나게 둔다. */
  process.exitCode = 2;
}
/* 깨진 것이 **전부** 지문 붙은 자산 하나 없음이면 못 잰 것이다. 통과로도, 빨강으로도 안 센다. */
if (failures.length > 0 && hashMissing.length === failures.length) {
  const name = [...new Set(hashMissing)].join(' , ');
  console.log(`[smoke-live-pages] 못 쟀다. 지문 붙은 자산이 아직 안 퍼졌다 (${name}).`);
  console.log(`  그 파일 하나 때문에 ${failures.length}장이 같이 안 떴다. 화면, 주소, 글은 다 정상이었다.`);
  console.log('  진짜로 안 지어진 자산은 짓는 자리에서 audit-page-scripts 가 잡는다. 다음 판에서 다시 본다.');
  failures.forEach((f) => console.log('  ~ ' + f));
  process.exitCode = 2;
  process.exit(2);
}
if (failures.length) {
  console.error(`[smoke-live-pages] 화면이 안 뜬 것 ${failures.length}건 / ${ids.length}`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`[smoke-live-pages] ${ids.length}개 도구 페이지 모두 화면이 보인다`);
