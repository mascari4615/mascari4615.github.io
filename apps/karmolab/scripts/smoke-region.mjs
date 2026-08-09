/**
 * 지역이 언어와 **따로 논다**는 것을 실제로 열어서 본다 (TASK-KL-203 S10)
 *
 * 이 검사가 없으면 되돌아가기 쉬운 자리다 — 「한국 것」을 `언어 == 한국어` 로 판정하는 코드는
 * 한국어 화면에서 멀쩡히 동작하고, 깨진 건 **영어로 읽는 한국 거주자**뿐이라 아무도 안 본다.
 *
 * 세 가지를 본다:
 *   ① 언어 en + 지역 KR  → 한국 항목이 **보이고**, 그 항목이 **영어로** 적혀 있다
 *   ② 언어 en + 지역 US  → 한국 항목이 **안 보인다**
 *   ③ 언어 ko + 지역 US  → 한국어를 읽어도 한국에 안 살면 안 보인다 (언어로 판정하면 여기서 샌다)
 *
 * 사용: node scripts/smoke-region.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog } from './lib/locales.mjs';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.dirname(path.dirname(appRoot));
const PORT = 8834;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

/** 지역이 정하는 항목 한 개를 골라 그것만 본다 — 「보인다/안 보인다」가 뚜렷한 줄. */
const CASES = [
  { locale: 'en', region: 'KR', page: 'apps/blog/en/karmolab/t/birth/index.html', expect: true },
  { locale: 'en', region: 'US', page: 'apps/blog/en/karmolab/t/birth/index.html', expect: false },
  { locale: 'ko', region: 'US', page: 'apps/blog/karmolab/t/birth/index.html', expect: false },
  { locale: 'ko', region: 'KR', page: 'apps/blog/karmolab/t/birth/index.html', expect: true }
];

const missing = CASES.filter((c) => !fs.existsSync(path.join(repoRoot, c.page)));
if (missing.length) {
  /* 장이 아직 안 찍혔다 = 이 검사의 **대상이 없다**. 「못 돈다」와 「실패」는 다르다. */
  console.log(`[region] 도구 장이 아직 없다 (${missing[0].page}) — 건너뜀`);
  process.exit(0);
}

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(repoRoot, url);
  if (url.endsWith('/')) file = path.join(file, 'index.html');
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('no');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const fail = [];

for (const c of CASES) {
  const ctx = await browser.newContext();
  /* 지역은 브라우저에 저장하는 취향값이라, 장을 열기 **전에** 심어야 첫 그림부터 반영된다. */
  await ctx.addInitScript((r) => {
    try {
      localStorage.setItem('karmolab_region', r);
    } catch {
      /* 저장을 막아 둔 환경 — 이 검사에서는 안 일어난다. */
    }
  }, c.region);

  const tab = await ctx.newPage();
  await tab.goto(`http://127.0.0.1:${PORT}/${c.page}`, { waitUntil: 'domcontentloaded' });

  const label = catalog(c.locale, 'birth')['birth.row.school'];

  /* **그려진 자리 안**에서만 본다. 장에는 말 묶음 전체가 글자로 박혀 있어서(그래야 기다림 없이
     그린다), `body.innerHTML` 로 재면 그 묶음에 든 낱말이 늘 잡힌다 — 처음에 그래서 네 경우가
     모두 「보인다」로 나왔다. 도구는 멀쩡했고 검사가 틀린 것이었다. */
  const shown = async () =>
    await tab.evaluate(() => {
      const host = document.querySelector('#tool-pages');
      if (!host) return '';
      const copy = host.cloneNode(true);
      copy.querySelectorAll('script,style').forEach((n) => n.remove());
      return copy.textContent || '';
    });

  const seen = await tab
    .waitForFunction(
      (needle) => {
        const host = document.querySelector('#tool-pages');
        if (!host) return false;
        const copy = host.cloneNode(true);
        copy.querySelectorAll('script,style').forEach((n) => n.remove());
        return (copy.textContent || '').includes(needle);
      },
      label,
      { timeout: 6000 }
    )
    .then(() => true)
    .catch(async () => {
      /* 못 봤다면 **도구가 그려지긴 했는지** 확인한다 — 아무것도 안 그려졌는데 「안 보인다」로
         통과하면, 이 검사는 도구가 죽어도 초록이다. */
      const body = await shown();
      if (!body.trim()) fail.push(`${c.locale}/${c.region}: 도구가 아예 안 그려졌다 — 검사 자체가 못 돈다`);
      return false;
    });

  const where = `${c.locale}/${c.region}`;
  if (seen !== c.expect) {
    fail.push(
      c.expect
        ? `${where}: 그 지역 항목이 안 보인다 (${label}) — 지역이 아니라 언어로 가르고 있을 수 있다`
        : `${where}: 그 지역이 아닌데 한국 항목이 보인다 (${label})`
    );
  }
  await ctx.close();
}

/* ── 그 나라 공휴일이 **실제로 빠지는가** (S13) ────────
 *
 * 달력 표가 맞는지는 따로 검산했지만, 그건 「표가 맞다」까지다. 도구가 그 표를 **쓰는지**는
 * 화면에서만 보인다 — 지역을 바꿔도 도구가 옛 표를 그대로 쓰면 표는 맞고 답은 틀린다.
 * 그래서 나라를 바꿔 놓고 **쉰 날 목록에 그 나라 공휴일 이름이 뜨는지** 본다. */
const HOLIDAY_CASES = [
  /* 평일에 걸린 날로 고른다 — 주말에 걸리면 「토요일」이 이겨서 이름이 안 뜬다(그건 맞는 동작). */
  { locale: 'en', region: 'US', from: '2026-11-23', to: '2026-11-28', want: 'Thanksgiving' },
  { locale: 'en', region: 'JP', from: '2026-05-01', to: '2026-05-08', want: 'Children’s Day' },
  { locale: 'en', region: 'KR', from: '2026-02-14', to: '2026-02-20', want: 'Seollal' }
];

const wdPage = 'apps/blog/en/karmolab/t/workdays/index.html';
if (fs.existsSync(path.join(repoRoot, wdPage))) {
  for (const c of HOLIDAY_CASES) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((r) => {
      try {
        localStorage.setItem('karmolab_region', r);
      } catch {
        /* 저장을 막아 둔 환경 */
      }
    }, c.region);
    const tab = await ctx.newPage();
    await tab.goto(`http://127.0.0.1:${PORT}/${wdPage}`, { waitUntil: 'domcontentloaded' });

    /* 「두 날짜 사이」로 바꾸고 그 나라 공휴일이 든 주를 넣는다. 값을 넣는 것으로는 도구가
       안 움직이므로(사람이 친 것만 듣는다) 바뀌었다고 알려 준다. */
    const ok = await tab
      .waitForFunction(() => !!document.querySelector('#wdModeBetween'), { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!ok) {
      fail.push(`${c.region}: 영업일 도구가 안 그려졌다 — 검사가 못 돈다`);
      await ctx.close();
      continue;
    }
    await tab.evaluate(
      ({ from, to }) => {
        document.querySelector('#wdModeBetween').click();
        const set = (sel, v) => {
          const el = document.querySelector(sel);
          el.value = v;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        set('#wdFrom', from);
        set('#wdTo', to);
      },
      { from: c.from, to: c.to }
    );

    const seen = await tab
      .waitForFunction((needle) => (document.querySelector('#wdSkipped')?.textContent || '').includes(needle), c.want, {
        timeout: 6000
      })
      .then(() => true)
      .catch(() => false);
    if (!seen) {
      const got = await tab.evaluate(() => (document.querySelector('#wdSkipped')?.textContent || '').trim());
      fail.push(`${c.region}: 쉰 날 목록에 「${c.want}」 가 없다 — 도구가 그 나라 달력을 안 쓴다 (본 것: ${got.slice(0, 80)})`);
    }
    await ctx.close();
  }
} else {
  console.log('[region] 영업일 도구 장이 아직 없다 — 공휴일 확인은 건너뜀');
}

/* ── 도량형 (S14) — 미국은 피트·파운드로 넣는다 ────────
 * 「kg 을 넣으세요」는 미국 사람에게 못 쓰는 도구다. 단위 칸이 지역을 따르는지 화면에서 본다. */
const bmiPage = 'apps/blog/en/karmolab/t/bmi/index.html';
if (fs.existsSync(path.join(repoRoot, bmiPage))) {
  for (const c of [
    { region: 'US', want: 'lb', notWant: 'kg' },
    { region: 'KR', want: 'kg', notWant: 'lb' }
  ]) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((r) => {
      try {
        localStorage.setItem('karmolab_region', r);
      } catch {
        /* 저장을 막아 둔 환경 */
      }
    }, c.region);
    const tab = await ctx.newPage();
    await tab.goto(`http://127.0.0.1:${PORT}/${bmiPage}`, { waitUntil: 'domcontentloaded' });
    const label = await tab
      .waitForFunction(() => {
        const el = document.querySelector('#tool-pages .tool-sublabel');
        return el && el.textContent ? el.textContent : false;
      }, { timeout: 8000 })
      .then((h) => h.jsonValue())
      .catch(() => '');
    const all = await tab.evaluate(
      () => [...document.querySelectorAll('#tool-pages .tool-sublabel')].map((e) => e.textContent).join(' | ')
    );
    if (!all.includes(c.want) || all.includes(c.notWant)) {
      fail.push(`${c.region}: 재는 단위가 그 나라 것이 아니다 — 「${c.want}」 를 기대했는데 「${all}」 (첫 칸 ${label})`);
    }
    await ctx.close();
  }
}

/* ── 단위 변환의 **처음 놓인 짝** (S14-b) ─────────────
 * 미터법 나라는 「cm → 인치」, 미국은 그 반대가 궁금하다. 처음 놓인 자리가 틀리면 매번 손이
 * 한 번 더 가고, 그 한 번이 「이 도구는 내 것이 아니구나」를 만든다. */
const ucPage = 'apps/blog/en/karmolab/t/unitconv/index.html';
if (fs.existsSync(path.join(repoRoot, ucPage))) {
  for (const c of [
    { region: 'US', from: 'inch', to: 'cm' },
    { region: 'KR', from: 'cm', to: 'inch' }
  ]) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((r) => {
      try {
        localStorage.setItem('karmolab_region', r);
      } catch {
        /* 저장을 막아 둔 환경 */
      }
    }, c.region);
    const tab = await ctx.newPage();
    await tab.goto(`http://127.0.0.1:${PORT}/${ucPage}`, { waitUntil: 'domcontentloaded' });
    const picked = await tab
      .waitForFunction(
        () => {
          const from = document.querySelector('#ucFrom');
          const to = document.querySelector('#ucTo');
          return from && to && from.value ? { from: from.value, to: to.value } : false;
        },
        { timeout: 8000 }
      )
      .then((h) => h.jsonValue())
      .catch(() => null);
    if (!picked) fail.push(`${c.region}: 단위 변환 도구가 안 그려졌다 — 검사가 못 돈다`);
    else if (picked.from !== c.from || picked.to !== c.to) {
      fail.push(`${c.region}: 처음 놓인 단위가 그 나라 것이 아니다 — ${picked.from}→${picked.to} (기대 ${c.from}→${c.to})`);
    }
    await ctx.close();
  }
}

/* 러닝 페이스 — 미국은 「1마일에 몇 분」으로 말한다 (S14-b). */
const pacePage = 'apps/blog/en/karmolab/t/pace/index.html';
if (fs.existsSync(path.join(repoRoot, pacePage))) {
  for (const c of [
    { region: 'US', want: 'mile' },
    { region: 'KR', want: 'km' }
  ]) {
    const ctx = await browser.newContext();
    await ctx.addInitScript((r) => {
      try {
        localStorage.setItem('karmolab_region', r);
      } catch {
        /* 저장을 막아 둔 환경 */
      }
    }, c.region);
    const tab = await ctx.newPage();
    await tab.goto(`http://127.0.0.1:${PORT}/${pacePage}`, { waitUntil: 'domcontentloaded' });
    const label = await tab
      .waitForFunction(() => {
        const el = document.querySelector('#tool-pages .tool-sublabel');
        return el && el.textContent && el.textContent.includes('/') ? el.textContent : false;
      }, { timeout: 8000 })
      .then((h) => h.jsonValue())
      .catch(() => '');
    if (!String(label).includes(c.want)) {
      fail.push(`${c.region}: 페이스 단위가 그 나라 것이 아니다 — 「${c.want}」 를 기대했는데 「${label}」`);
    }
    await ctx.close();
  }
}

await browser.close();
server.close();

if (fail.length) {
  for (const f of fail) console.error('[region] ' + f);
  process.exit(1);
}
console.log(
  `[region] 지역·언어 따로 놀기 ${CASES.length}건 정상 — ${CASES.map((c) => `${c.locale}/${c.region}`).join(', ')}` +
    ` · 나라별 공휴일 ${HOLIDAY_CASES.length}건 정상 — ${HOLIDAY_CASES.map((c) => `${c.region}:${c.want}`).join(', ')}`
);
