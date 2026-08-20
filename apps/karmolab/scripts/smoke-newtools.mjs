/**
 * 오늘 세운 도구 넷이 **화면에서 실제로 도나** (TASK-KL-335/336/337).
 *
 * 사람이 눈으로 볼 몫을 기계에 넘긴다. 다만 **모델을 받는 자리는 못 잰다** — 44MB 를 받아야
 * 하고 WebGPU 도 없다. 그래서 여기서 재는 것은 「모델 없이도 참이어야 하는 것」이다:
 *
 *   - 게이트가 **받기 전에** 크기를 숫자로 보여 주나 (그게 이 저장소의 규율이다)
 *   - 라이선스가 화면에 적히나 (비상업 모델을 말없이 쓰면 나중에 곤란한 건 우리다)
 *   - 모델이 없어도 **도구가 그대로 열리나** (로컬 AI 는 추가지 전제가 아니다)
 *   - 셈이 실제로 픽셀을 바꾸나 (지우개는 모델이 아예 필요 없다 — 끝까지 잰다)
 *
 * 「하늘」 겹은 뒷단이 살아 있어야 하므로, 못 닿으면 **실패가 아니라 못 잰 것**으로 적는다.
 * 못 잰 것을 통과로 세면 그게 이 저장소에서 제일 비싼 고장이다.
 *
 * 사용: node scripts/smoke-newtools.mjs   (npm run smoke:newtools)
 */
import { chromium } from 'playwright';
import { serveRepo } from './lib/serve-static.mjs';

const frozen = process.env.URL ? null : await serveRepo();
const BASE = process.env.URL || `${frozen.base}/apps/karmolab/index.html`;

const failures = [];
const skipped = [];
const check = (ok, why) => {
  if (ok) process.stdout.write('.');
  else {
    process.stdout.write('x');
    failures.push(why);
  }
};
const skip = (why) => {
  process.stdout.write('-');
  skipped.push(why);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(20000);

/** 사진 한 장을 그 자리에서 그려 넣는다 — 가운데만 빨갛고 나머지는 한 가지 색. */
async function putPhoto(selector, w = 120, h = 90) {
  await page.evaluate(
    async ([sel, width, height]) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2288cc'; // 한 가지 색 배경 — 색 겹이 지울 수 있는 모양
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#cc2222';
      ctx.fillRect(Math.round(width * 0.35), Math.round(height * 0.3), Math.round(width * 0.3), Math.round(height * 0.4));
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      const input = document.querySelector(sel);
      const dt = new DataTransfer();
      dt.items.add(new File([blob], '시험사진.png', { type: 'image/png' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [selector, w, h]
  );
}

/* ── ① 배경 지우기 — 색 겹은 끝까지, 모양 겹은 「받기 전」까지 ───────────── */

await page.goto(`${BASE}#bgremove`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#brFile');
await putPhoto('#brFile');
await page.waitForFunction(() => document.querySelector('#brCanvas')?.width > 0);

/* 색 겹: 실제로 지워야 한다. 「지운 데가 없다」면 배선이 끊긴 것이다. */
const brStatus = await page.locator('#brStatus').innerText();
check(/\d+% 를 지웠습니다/.test(brStatus), `한 가지 색 배경은 실제로 지워져야 한다 (지금 「${brStatus}」)`);

/* ★ 모양 겹 자리 — **사진을 넣은 뒤에만** 뜬다. 받기 전에 숫자와 라이선스를 보여 줘야 한다. */
check(await page.locator('#brAiPanel').isVisible(), '사진을 넣으면 모양 겹 자리가 뜬다');
const person = await page.locator('#brAiPerson').innerText();
const anything = await page.locator('#brAiAnything').innerText();
check(/\(\d+MB\)/.test(person), `★ 받기 전에 크기를 숫자로 보여 준다 — 사람 겹 (지금 「${person}」)`);
check(/\(\d+MB\)/.test(anything), `★ 물건 겹도 숫자 (지금 「${anything}」)`);
const personMb = Number(person.match(/(\d+)MB/)?.[1] ?? 0);
const anythingMb = Number(anything.match(/(\d+)MB/)?.[1] ?? 0);
check(personMb > 0 && personMb < anythingMb, `가벼운 쪽이 기본 — 사람 ${personMb}MB < 물건 ${anythingMb}MB`);

const license = await page.locator('#brAiLicense').innerText();
check(/modnet/i.test(license) && /RMBG/i.test(license), `★ 쓰는 모델 이름을 적는다 (지금 「${license}」)`);
check(/비상업|non-?commercial/i.test(license), '★ 비상업 라이선스라고 화면에 적는다');

/* 「여백까지 자르기」 — 켜면 캔버스가 남은 것에 맞춰 줄어야 한다(trimBox 배선). */
const beforeTrim = await page.evaluate(() => document.querySelector('#brCanvas').width);
await page.locator('#brTrim').check();
await page.waitForTimeout(200);
const afterTrim = await page.evaluate(() => document.querySelector('#brCanvas').width);
check(afterTrim <= beforeTrim, `여백 자르기가 캔버스를 안 키운다 (${beforeTrim} → ${afterTrim})`);

/* ★ 모델이 없어도 도구는 그대로 열려 있어야 한다 — 로컬 AI 는 추가지 전제가 아니다. */
check(await page.locator('#brSave').isEnabled(), '모델을 안 받아도 저장 단추는 살아 있다');

/* ── ② 지우개 — 모델이 필요 없다. 끝까지 잰다 ──────────────────────────── */

await page.goto(`${BASE}#cleanup`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#cuFile');
await putPhoto('#cuFile');
await page.waitForFunction(() => document.querySelector('#cuCanvas')?.width > 0);

/*
 * 칠하면 **붉게** 보여야 한다 — 무엇이 지워질지를 누르기 전에 보여 주는 자리다.
 *
 * ★ 탐침은 **바탕색 위**를 본다. 처음엔 한가운데를 봤는데, 시험 사진의 한가운데는 빨간
 * 사각형이라 「칠해서 붉다」와 「원래 빨갛다」가 구별이 안 됐다 — 검사가 늘 통과하거나
 * 늘 실패하는, 뜻이 없는 자리였다(실측으로 걸렸다).
 */
const PROBE = { fx: 0.15, fy: 0.5 }; // 왼쪽 = 파란 바탕
const box = await page.locator('#cuCanvas').boundingBox();
const px = box.x + box.width * PROBE.fx;
const py = box.y + box.height * PROBE.fy;
await page.mouse.move(px, py);
await page.mouse.down();
await page.mouse.move(px + 8, py, { steps: 4 });
await page.mouse.up();

const painted = await page.locator('#cuStatus').innerText();
check(/\d+점을 칠했습니다/.test(painted), `칠한 점 수를 말한다 (지금 「${painted}」)`);
const probeAt = (fx, fy) =>
  page.evaluate(
    ([x, y]) => {
      const c = document.querySelector('#cuCanvas');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data;
      return { r: d[0], g: d[1], b: d[2] };
    },
    [fx, fy]
  );
const before = await probeAt(PROBE.fx, PROBE.fy);
check(before.r > before.b, `★ 칠한 자리가 붉게 보인다 — 파란 바탕이 붉어졌다 (지금 ${JSON.stringify(before)})`);

/* 「칠한 데 지우기」 — 실제로 픽셀이 바뀌어야 한다. */
await page.locator('#cuRun').click();
await page.waitForFunction(() => /덮었습니다/.test(document.querySelector('#cuStatus')?.textContent ?? ''));
const filled = await probeAt(PROBE.fx, PROBE.fy);
check(filled.b > filled.r, `메운 뒤에는 붉은 덧칠이 사라지고 **주변 바탕색**이 온다 (지금 ${JSON.stringify(filled)})`);
/* 조건은 **하나**로 — 「r 이거나 g 이거나 b」는 늘 참에 가깝다(느슨한 쪽이 이긴다).
   메운 자리는 주변 바탕(#2288cc)이므로 파랑이 뚜렷해야 한다. 검정·투명이면 여기서 걸린다. */
check(filled.b > 120, `메운 자리가 주변 바탕색이다 — 검정·투명으로 안 뚫린다 (파랑 ${filled.b})`);

/* 한 걸음 되돌리기 */
await page.locator('#cuUndo').click();
const undone = await page.locator('#cuStatus').innerText();
check(/되돌렸습니다/.test(undone), `되돌리기가 산다 (지금 「${undone}」)`);

/* ★ 자판만으로도 칠해져야 한다 — 끌기만 있으면 자판 쓰는 사람에게는 없는 도구다. */
await page.locator('#cuCanvas').focus();
const focusSay = await page.locator('#cuStatus').innerText();
check(/화살표|스페이스/.test(focusSay), `초점이 오면 자판 길을 알려 준다 (지금 「${focusSay}」)`);
await page.keyboard.press('ArrowRight');
await page.keyboard.press('Space');
const byKey = await page.locator('#cuStatus').innerText();
check(/\d+점을 칠했습니다/.test(byKey), `★ 화살표+스페이스로 칠해진다 (지금 「${byKey}」)`);

/* ── ③ 영상 배경 빼기 — 「몇 판 돌린다」를 누르기 전에 말하나 ───────────── */

await page.goto(`${BASE}#videobg`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#vbFile');
await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  const rec = new MediaRecorder(canvas.captureStream(12), { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((res) => (rec.onstop = res));
  rec.start();
  const from = performance.now();
  await new Promise((res) => {
    const paint = () => {
      const t = (performance.now() - from) / 1000;
      ctx.fillStyle = `hsl(${Math.floor(t * 180)} 80% 50%)`;
      ctx.fillRect(0, 0, 96, 72);
      if (t > 2) return res();
      requestAnimationFrame(paint);
    };
    paint();
  });
  rec.stop();
  await done;
  const input = document.querySelector('#vbFile');
  const dt = new DataTransfer();
  dt.items.add(new File(chunks, '찍은영상.webm', { type: 'video/webm' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForFunction(() => /초짜리 영상|못 읽었습니다/.test(document.querySelector('#vbStatus')?.textContent ?? ''), undefined, { timeout: 30000 });

const vbStatus = await page.locator('#vbStatus').innerText();
if (/못 읽었습니다/.test(vbStatus)) {
  skip('영상을 못 읽었다 — 이 브라우저가 그 자리에서 찍은 webm 을 못 읽는다(도구 잘못 아님)');
} else {
  const cost = await page.locator('#vbCost').innerText();
  check(/\d+장을 돌립니다/.test(cost), `★ 누르기 전에 몇 판인지 말한다 (지금 「${cost}」)`);

  /* 손잡이를 돌리면 숫자가 따라와야 한다 — 안 따라오면 화면이 옛 값을 말하는 것이다. */
  const before = await page.locator('#vbCost').innerText();
  await page.evaluate(() => {
    const el = document.querySelector('#vbFps');
    el.value = '24';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const after = await page.locator('#vbCost').innerText();
  check(before !== after, `초당 장 수를 올리면 판 수가 바뀐다 (${before} → ${after})`);

  /* ★ 상한이 실제로 걸리나 — 상한이 없으면 3분짜리를 넣은 사람이 브라우저를 잃는다. */
  await page.evaluate(() => {
    for (const [sel, v] of [['#vbLen', '20'], ['#vbFps', '24']]) {
      const el = document.querySelector(sel);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  const capped = await page.locator('#vbCost').innerText();
  const n = Number(capped.match(/(\d+)장/)?.[1] ?? 0);
  check(n > 0 && n <= 150, `상한 150장을 안 넘는다 (지금 ${n})`);

  check(await page.locator('#vbTry').isEnabled(), '「첫 장만 해 보기」가 눌린다');
  check(!(await page.locator('#vbSave').isVisible()), '아직 오려낸 게 없으면 내보내기는 안 보인다');
}

/* ── ④ 지구본 「하늘」 겹 — 뒷단이 살아 있을 때만 잰다 ─────────────────── */

/*
 * ★ 뒷단은 **origin 허용목록**으로 막혀 있다. 로컬 검사 서버 포트는 그 목록 밖이라
 * 브라우저가 부르면 요청이 통째로 버려진다 — 도구가 아니라 검사 환경 탓이다(이 저장소가
 * 이미 아는 함정). 그래서 그 부름만 **여기(Node)가 대신 받아** 넘겨준다.
 * 이렇게 하면 우리 그리는 코드는 **진짜 자료**로 재게 되고, 네트워크가 죽으면 아래에서
 * 「못 잼」으로 적힌다(통과로 안 센다).
 */
await page.route('**/kl/air/near*', async (route) => {
  try {
    const res = await fetch(route.request().url(), { headers: { Accept: 'application/json' } });
    route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
  } catch {
    route.abort();
  }
});

await page.goto(`${BASE}#bluemarble`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.bm-canvas', { timeout: 40000 });
/* 조작부는 접혀 있는 게 기본이다 — 펴지 않으면 겹 단추가 지구본 뒤에 깔려 못 눌린다. */
await page.locator('.bm-menu').click();
await page.waitForSelector('.bm-wrap.bm-panel', { timeout: 10000 });
const airChip = page.locator('.bm-chips button', { hasText: '하늘' }).first();
if ((await airChip.count()) === 0) {
  check(false, '★ 지구본에 「하늘」 겹 단추가 없다 — 겹이 배선에서 빠졌다');
} else {
  check(true, '지구본에 「하늘」 겹 단추가 있다');
  await airChip.click();
  const said = await page
    .waitForFunction(
      () => /하늘에 \d+대|잡히는 게 없습니다|못 받았습니다/.test(document.body.innerText),
      undefined,
      { timeout: 25000 }
    )
    .then(() => page.evaluate(() => document.body.innerText.match(/하늘에 \d+대|잡히는 게 없습니다|못 받았습니다/)?.[0] ?? ''))
    .catch(() => '');
  if (said === '' || /못 받았습니다/.test(said)) {
    /* 뒷단이 안 서 있으면 **못 잰 것**이다. 통과로 세지 않는다. */
    skip(`하늘 겹: 뒷단(yawnbot /kl/air)에 못 닿았다 — 통과 아님 (화면이 말한 것: 「${said || '아무 말 없음'}」)`);
  } else {
    check(/하늘에 \d+대|잡히는 게 없습니다/.test(said), `★ 받은 결과를 사람 말로 말한다 (지금 「${said}」)`);
    check(!/하늘에 0대/.test(said), '0대를 「n대」로 말하지 않는다 (없으면 없다고 말해야 한다)');

    /*
     * ★ **말만 하고 안 그리는 것**이 이 겹에서 제일 그럴듯한 고장이다 — 상태 줄은 받아 온
     * 수를 말하므로 그리기가 통째로 죽어도 초록으로 보인다. 그래서 픽셀을 센다:
     * 비행기 색(214,238,255 계열)이 겹을 끄면 사라져야 한다.
     */
    const planePixels = () =>
      page.evaluate(() => {
        const c = document.querySelector('.bm-canvas');
        const ctx = c.getContext('2d');
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 195 && d[i] < 235 && d[i + 1] > 225 && d[i + 2] > 245) n++;
        }
        return n;
      });
    const onCount = await planePixels();
    if (/잡히는 게 없습니다/.test(said)) {
      skip('그 하늘이 실제로 0대였다 — 그리기는 못 쟀다(잡을 게 없으면 그릴 것도 없다)');
    } else {
      check(onCount > 0, `★ 비행기가 실제로 그려진다 (그 색 픽셀 ${onCount}개)`);
      await airChip.click(); // 끈다
      await page.waitForTimeout(400);
      const offCount = await planePixels();
      check(offCount < onCount, `겹을 끄면 사라진다 (${onCount} → ${offCount})`);
    }
  }
}

await browser.close();
if (frozen) await frozen.close();

process.stdout.write('\n');
for (const s of skipped) console.log(`  [못 잼] ${s}`);
if (failures.length > 0) {
  console.error(`\n[smoke-newtools] ${failures.length}건 실패:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[smoke-newtools] 화면 검사 통과 (못 잰 것 ${skipped.length}건 — 통과로 안 셈)`);
