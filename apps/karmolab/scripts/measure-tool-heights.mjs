/**
 * 도구가 들어갈 자리의 높이를 미리 재 둔다 (TASK-KL-089)
 *
 * 상세 페이지는 도구를 자바스크립트로 그린다. 그 전까지 도구 자리는 높이가 0 이라,
 * 도구가 뜨는 순간 아래 설명글이 통째로 아래로 밀린다. 읽던 줄이 달아나고, 누르려던
 * 버튼이 손가락 밑에서 사라진다. 검색 순위에도 쓰이는 값인데 실측 0.86 이었다(나쁨 기준 0.25).
 *
 * 높이는 도구마다 204px ~ 8254px 로 제각각이라 한 값으로 못 막는다. 그래서 여기서
 * **도구별로 실제 높이를 재어 기록**해 두고, 페이지를 찍을 때 그만큼 자리를 비워 둔다.
 *
 * 좁은 화면과 넓은 화면에서 따로 잰다. 같은 도구도 폭에 따라 높이가 다르다.
 *
 * 기록은 도구 내용이 바뀌면 조용히 낡는다. 낡은 채로 두면 비워 둔 자리와 실제 높이가 어긋나
 * 다시 밀리기 시작하는데, 화면은 멀쩡해 보인다. `--check` 가 그것을 잡는다.
 *
 * 사용: node scripts/measure-tool-heights.mjs            (기록에 없는 것만)
 *       node scripts/measure-tool-heights.mjs --force    (전부 다시)
 *       node scripts/measure-tool-heights.mjs --check    (안 고치고 어긋난 것만 알린다)
 *       BASE=http://127.0.0.1:8797/apps/blog node scripts/measure-tool-heights.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/* 재는 대상은 **실제 사이트와 같은 HTML** 이어야 한다. 평소 로컬 서버는 저장소 파일을 그대로
 * 주므로 맨 위 설정 몇 줄이 글자로 떠서 화면이 밀리고, 그 상태로 잰 높이는 실제와 최대 80px
 * 어긋났다(실측). `npm run serve:gzip`(8801) 은 그 줄을 걷어내고 압축까지 해 준다. 그쪽을 기본으로 쓴다. */
const BASE = process.env.BASE || 'http://127.0.0.1:8801/apps/blog';
const outPath = path.join(root, 'data/tool-heights.json');
const force = process.argv.includes('--force');
const check = process.argv.includes('--check');
// 글꼴이 조금 달라져도 몇 px 은 흔들린다. 사람 눈에 안 띄는 그 정도는 넘긴다.
const TOLERANCE = 24;

const WIDTHS = { narrow: 390, wide: 1280 };
const LANES = 4;

const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : {};

// 서버가 아예 안 떠 있으면 fetch 자체가 던진다. 그냥 두면 스택만 쏟아지고 왜인지가 안 보인다.
const hubRes = await fetch(`${BASE}/t/`).catch((e) => ({ ok: false, status: `연결 실패(${e.code || e.message})` }));
if (!hubRes.ok) {
  console.error(
    `[measure-heights] 목록을 못 받는다 (${hubRes.status}). ${BASE}\n` +
      '  → 다른 창에서 `npm run serve:gzip` 을 먼저 띄워라 (실제 사이트와 같은 화면으로 재려면 이 서버여야 한다).'
  );
  process.exit(1);
}
const ids = [...new Set([...(await hubRes.text()).matchAll(/\/t\/([a-z0-9-]+)\//g)].map((m) => m[1]))];
/* ★ **한 도구만 다시 재는 길** (2026-08-21). 흔들리는 도구 하나를 다시 잠그려고 290장을
   전부 재고 있었다(한 판 2분+). 그동안 다른 289개도 같이 다시 쓰이므로 <b>안 건드려도 될
   값이 흔들릴 위험</b>까지 얹힌다. `out = { ...prev }` 라 고른 것만 갱신해도 나머지는 그대로다.
   씀: `npm run measure:heights -- --force --only ghosttype` */
const only = (() => {
  const i = process.argv.indexOf('--only');
  return i >= 0 ? process.argv[i + 1] : null;
})();
if (only && !ids.includes(only)) {
  console.error(`[measure-heights] 그런 도구가 목록에 없다. ${only}`);
  process.exit(2);
}
const todo = only ? [only] : force || check ? ids : ids.filter((id) => !prev[id]);

if (!todo.length) {
  console.log(`[measure-heights] 최신 상태. ${ids.length}개 모두 기록에 있다 (다시 재려면 --force)`);
  process.exit(0);
}

const browser = await chromium.launch();
const out = { ...prev };
const failed = [];

/**
 * 한 번 실패했다고 포기하지 않는다 (TASK-KL-107).
 *
 * 이 측정은 여러 작업이 같은 서버를 두드리는 동안 돌아서, 가끔 한 도구가 제때 안 그려진다.
 * 그런데 실패가 한 건만 나도 **기록 전체를 안 쓰고 끝냈다**. 126개를 다 재고도 아무것도
 * 안 남는다. 실제로 돌릴 때마다 *다른* 도구가 실패했다(pdfcompress → filehash). 도구가
 * 고장 난 게 아니라 재는 쪽이 흔들린 것이다. 진짜 고장이면 몇 번을 다시 해도 실패한다.
 */
const TRIES = 3;

/** 한 도구를 두 폭에서 열고 도구 자리의 높이를 잰다. */
async function measure(ctx, id, key, attempt = 1) {
  const page = await ctx.newPage();
  try {
    // 페이지에는 이미 이만큼 비워 둬라가 박혀 있고 그것이 **최소** 높이다. 끄지 않고 재면
    // 실제가 더 작아도 박아 둔 값이 그대로 나와, 한 번 커진 기록은 영영 안 줄어든다.
    await page.addInitScript(() => {
      addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = '#tool-pages{min-height:0!important}';
        document.head.appendChild(s);
      });
    });
    /* ⚠ `networkidle` 로 기다리지 않는다 (2026-08-21). 이 창은 실시간 채널
       (`/kl/presence`, `/kl/chat/stream` 등)을 계속 열어 두므로 <b>회선이 조용해지는 순간이
       안 온다</b>. 러너가 조금만 느려도 30초를 다 쓰고 죽는다(실측: `draw(wide)` 가 3번 다 그랬다).
       재는 것은 <b>높이</b>다. 필요한 것은 문서가 섰고 글꼴이 왔다뿐이고, 그 둘은 아래에서
       따로 기다린다(`document.fonts.ready`). 회선이 조용한지는 높이와 상관이 없다. */
    await page.goto(`${BASE}/t/${id}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    /* 도구 자리가 그려질 때까지. 초를 세지 않고 <b>생겼나</b>를 본다. */
    await page.waitForSelector('#tool-pages', { timeout: 20000 }).catch(() => null);
    // 글꼴이 늦게 오면 높이가 달라진다. 다 온 뒤에 잰다.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    /* ★ **높이가 가라앉을 때까지 잰다** (2026-08-21). 한 번 찍으면 판마다 값이 달라진다 . 
       같은 장을 네 번 재니 1573, 1587, 1587, 1587 이었다(허용 24px 인데 14px 흔들린다).
       늦게 오는 조각(그림, 글꼴, 실시간 값)이 높이를 조금씩 밀기 때문이다.
       그래서 <b>같은 값이 두 번 연달아</b> 나올 때까지 다시 재고, 끝내 안 가라앉으면
       <b>가장 큰 값</b>을 쓴다. 자리는 넉넉히 비워 두는 쪽이 안전하다(밀리는 것보다 낫다). */
    const readHeight = async () =>
      page.evaluate(() => Math.round(document.getElementById('tool-pages')?.getBoundingClientRect().height || 0));
    let h = await readHeight();
    let tallest = h;
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(250);
      const next = await readHeight();
      if (next > tallest) tallest = next;
      if (next === h) break;
      h = next;
    }
    h = tallest;
    if (!h) throw new Error('도구 자리를 못 찾았다');
    out[id] = { ...(out[id] || {}), [key]: h };
  } catch (e) {
    await page.close();
    if (attempt < TRIES) {
      // 조금 쉬었다 다시. 서버가 다른 작업에 밀린 순간이면 그 사이 풀린다.
      await new Promise((r) => setTimeout(r, 800 * attempt));
      return measure(ctx, id, key, attempt + 1);
    }
    failed.push(`${id}(${key}): ${String(e.message).slice(0, 50)} (${TRIES}번 다시 해도 같음)`);
    return;
  }
  await page.close();
}

for (const [key, width] of Object.entries(WIDTHS)) {
  const lanes = Array.from({ length: LANES }, (_, i) => todo.filter((_, j) => j % LANES === i));
  await Promise.all(
    lanes.map(async (list) => {
      const ctx = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
      for (const id of list) await measure(ctx, id, key);
      await ctx.close();
    })
  );
  process.stdout.write(`${width}px 잼 `);
}
process.stdout.write('\n');
await browser.close();

if (failed.length) {
  console.error(`[measure-heights] 못 잰 것 ${failed.length}건`);
  failed.slice(0, 8).forEach((f) => console.error('  - ' + f));
  process.exit(1);
}

/* ★ **어느 컴퓨터에서 잰 값인지 함께 적는다** (2026-08-13).
 *
 * 이 숫자는 글꼴이 실제로 그려진 높이다. **재는 컴퓨터가 다르면 값이 다르다**. 내 자리(윈도우)에서
 * 다시 재어 올렸더니 CI(리눅스)에서 14건이 어긋났다(같은 코드, 같은 화면인데 26~321px 더 큼).
 * 그 차이는 고장이 아니라 **비교 대상이 아닌 것을 비교한** 것이다. 그런데 검사는 낡았다고만
 * 말해서, 없는 버그를 쫓거나 영영 빨간 게이트가 된다.
 * 그래서 잰 자리를 적어 두고, **다른 자리에서는 판정하지 않는다**(모름은 아니오가 아니다). */
const META_PATH = path.join(root, 'data/tool-heights.meta.json');
const meta = (() => {
  try {
    return JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
  } catch {
    return null;
  }
})();

/* --check = 안 고치고 알리기만. 기록이 낡으면 비워 둔 자리가 실제와 어긋나 다시 밀린다. */
if (check) {
  if (meta && meta.platform && meta.platform !== process.platform) {
    console.log(`[measure-heights] 이 기록은 ${meta.platform} 에서 잰 것이고 여기는 ${process.platform} 이다. 판정하지 않는다(못 돌림).`);
    console.log('  글꼴이 그려지는 높이는 컴퓨터마다 다르다. 판정하려면 기록을 **이 자리에서** 다시 재라:');
    console.log('  npm run measure:heights -- --force');
    process.exit(0);
  }
  const off = [];
  for (const id of todo) {
    for (const key of Object.keys(WIDTHS)) {
      const was = prev[id]?.[key];
      const now = out[id]?.[key];
      /* **한쪽만 본다** (2026-08-08).
       *
       * 이 기록은 자리를 얼마나 비워 둘까다. 실제가 기록보다 **크면** 도구가 뜨는 순간
       * 아래 글이 밀린다 = 진짜 고장. 실제가 기록보다 **작으면** 예약한 자리가 조금 남을
       * 뿐 아무것도 안 밀린다.
       * 양쪽을 다 보다가 이 게이트가 영영 초록이 안 되는 상태였다: ghosttype(narrow) 이
       * 잴 때마다 924 ↔ 958 로 흔들려(34px, 허용 24px) 다시 재도 반대쪽으로 걸렸다.
       * 흔들리는 도구는 **큰 쪽으로 예약**해 두는 것이 맞다. 다만 너무 많이 남으면 큰 빈칸이
       * 생기므로 그건 따로, 훨씬 헐겁게 본다. */
      if (was == null) off.push(`${id}(${key}): 기록에 없다`);
      else if (now - was > TOLERANCE) off.push(`${id}(${key}): 자리를 ${was}px 잡아 뒀는데 실제 ${now}px. 그만큼 아래 글이 밀린다`);
      else if (was - now > 200) off.push(`${id}(${key}): 자리를 ${was}px 잡아 뒀는데 실제 ${now}px. 빈칸이 너무 크다`);
    }
  }
  if (off.length) {
    console.error(`[measure-heights] 자리 높이 기록이 낡았다 ${off.length}건. 도구가 뜰 때 아래 글이 밀린다`);
    off.slice(0, 12).forEach((o) => console.error('  - ' + o));
    console.error('  → `npm run measure:heights -- --force` 로 다시 재고 페이지를 다시 찍어라');
    process.exit(1);
  }
  console.log(`[measure-heights] 기록이 실제와 맞는다. ${todo.length}개, ${TOLERANCE}px 넘게 어긋난 것 0`);
  process.exit(0);
}

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
/* 노이즈 범위(허용치의 두 배) 안에서 흔들리는 값은 **큰 쪽을 남긴다**. 자리는 예약이라
   덜 잡는 쪽이 사고다. 그보다 크게 달라졌으면 진짜 변화이므로 새 값을 그대로 쓴다. */
for (const id of Object.keys(sorted)) {
  for (const key of Object.keys(WIDTHS)) {
    const was = prev[id]?.[key];
    const now = sorted[id]?.[key];
    if (was == null || now == null) continue;
    if (Math.abs(now - was) <= TOLERANCE * 2) sorted[id][key] = Math.max(now, was);
  }
}
fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + '\n');
/* 잰 자리를 함께 남긴다. 다른 컴퓨터에서 이 숫자로 판정하지 않도록. */
fs.writeFileSync(META_PATH, JSON.stringify({ platform: process.platform, measuredAt: new Date().toISOString() }, null, 2) + String.fromCharCode(10));
console.log(`[measure-heights] ${todo.length}개를 새로 재어 기록했다 (기록 전체 ${Object.keys(sorted).length}개)`);
