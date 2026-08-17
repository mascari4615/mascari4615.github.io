/**
 * **손가락으로 누를 만한가** 를 잰다 — 재기만 한다, 막지 않는다 (2026-08-17).
 *
 * 왜 생겼나: 거울(기준 대조)의 「접근성」 기준에 「손가락 최소 44px」 이 적혀 있는데
 * 아무도 안 재고 있었다. 관문 검사(`smoke-hub`)가 32px 선을 지키긴 하지만 그건 **관문 한 장**이고
 * 문턱도 다르다 — 적어 놓은 기준과 재는 값이 다르면 그 기준은 없는 것과 같다.
 *
 * 두 문턱을 같이 낸다. 하나만 내면 「지켰다/못 지켰다」가 문턱 고르기 싸움이 된다:
 *   · 24px — WCAG 2.2 AA(2.5.8 Target Size Minimum) 가 요구하는 선
 *   · 44px — 우리가 적어 둔 선(손가락). 그쪽이 더 엄하다.
 *
 * 막지 않는다(늘 0으로 끝난다) — 늘리고 줄이는 판단은 사람 몫이고, 이건 거울이 읽을 수다.
 * 못 열면 2(못 잼). 「0개」와 「못 쟀다」는 다르다.
 *
 * 사용: node scripts/measure-tap-size.mjs [주소...]
 */
import { chromium } from 'playwright';

const BASE = 'https://blog.mascari4615.com/karmolab/';
const 주소들 = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const URLS = 주소들.length ? 주소들 : [BASE, `${BASE}t/`, `${BASE}t/loan/`];
const 폰 = { width: 390, height: 844 };

const br = await chromium.launch();
const ctx = await br.newContext({ viewport: 폰, isMobile: true, hasTouch: true });
const 줄 = [];
let 열린장 = 0;

for (const url of URLS) {
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    줄.push(`  ${url} — 못 열었다`);
    await p.close();
    continue;
  }
  열린장 += 1;
  const m = await p.evaluate(() => {
    const 보이나 = (e) => {
      const b = e.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return false;
      const s = getComputedStyle(e);
      return s.display !== 'none' && s.visibility !== 'hidden';
    };
    const 손잡이 = [...document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]')]
      .filter(보이나);
    /* ★ **문장 안 링크는 기준이 스스로 빼 준다** (2026-08-17). WCAG 2.2 AA 2.5.8 에는
       「인라인」 예외가 있다 — 글 안에 있어서 줄 높이에 크기가 매인 링크는 대상이 아니다.
       그걸 안 빼면 이 자가 없는 병을 만든다: 실제로 「높은 쪽 고르기」·「오늘의 문제」 같은
       **문단 속 링크 넷**이 21px 로 잡혀 「기준 위반」처럼 보였다(고치면 줄 모양이 깨진다).
       판별은 기준이 말하는 그대로 — 글 흐름 안에 있는(display:inline) 링크. */
    const 문장안 = (e) => e.tagName === 'A' && getComputedStyle(e).display === 'inline';
    const 잴것 = 손잡이.filter((e) => !문장안(e));
    const 예외 = 손잡이.filter(문장안);
    const 작은것 = (선) => 잴것.filter((e) => {
      const b = e.getBoundingClientRect();
      return Math.min(b.width, b.height) < 선;
    });
    const 이름 = (e) => {
      const b = e.getBoundingClientRect();
      const t = (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 12);
      return `${(e.className || e.tagName).toString().split(' ')[0].slice(0, 16)} ${Math.round(b.width)}x${Math.round(b.height)}${t ? ` "${t}"` : ''}`;
    };
    return {
      전부: 잴것.length,
      문장안링크: 예외.length,
      아래24: 작은것(24).length,
      아래44: 작은것(44).length,
      보기24: [...new Set(작은것(24).map(이름))].slice(0, 4),
      보기: [...new Set(작은것(44).map(이름))].slice(0, 3),
    };
  });
  줄.push(`  ${url}`);
    줄.push(`    손잡이 ${m.전부}개(문장 안 링크 ${m.문장안링크}개는 기준 예외라 뺐다) · 24px 미만 ${m.아래24}개 · 44px 미만 ${m.아래44}개`);
  /* ★ 24px 미만을 먼저 보여 준다 — 그게 바깥 기준(WCAG 2.2 AA)이 실제로 요구하는 선이다.
     44px 미만은 「더 크면 좋다」쪽이라 목록이 길어도 사고가 아니다. */
  for (const b of m.보기24) 줄.push(`      · 24px 미만 — ${b}`);
  for (const b of m.보기) 줄.push(`      · 44px 미만 — ${b}`);
  await p.close();
}

await br.close();

if (열린장 === 0) {
  console.error('[tap-size] CANNOT-RUN: 한 장도 못 열었다 — 이건 「다 크다」가 아니라 안 잰 것이다.');
  process.exit(2);
}
console.log(`[tap-size] 폰 ${폰.width}x${폰.height} · ${열린장}장`);
console.log(줄.join('\n'));
