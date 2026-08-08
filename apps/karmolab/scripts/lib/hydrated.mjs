/**
 * **손이 달릴 때까지** 기다린다 (TASK-KL-135)
 *
 * 도구 상세 페이지는 두 번 그려진다. 먼저 빌드 때 떠 둔 그림이 HTML 로 오고(빠르다),
 * 그다음 위젯이 도착해 그 자리를 제 화면으로 갈아 끼운다. 실사이트 실측으로 **76ms 에 그림,
 * 127ms 에 교체**였다.
 *
 * 그래서 「단추가 보인다」로 기다림을 끝내면 그 사이 51ms 에 걸린다 — 거기서 적은 글은 교체와
 * 함께 사라지고, 누른 것은 아무 일도 안 난다. 실제로 타임캡슐 검사가 그 틈에서 두 번 헛돌아
 * 「바깥 시계에 못 닿았다」로 끝났다(도구는 멀쩡했다).
 *
 * 여기서 보는 신호는 **손**이다: 미리 그린 그림은 HTML 을 떠 온 것이라 어떤 단추에도 `onclick`
 * 이 없다. 위젯이 만든 화면에는 붙어 있다. 그래서 그것이 붙을 때까지 기다린다.
 *
 * 단추가 아예 없는 도구도 있다 — 그런 화면은 기다릴 신호가 없으므로 잠깐 가라앉기만 기다린다.
 */

/**
 * @param {import('playwright').Page} page
 * @param {string} selector 그 도구 화면 안의 아무 요소 (예: '#tcSeal')
 * @param {{ timeout?: number }} [opts]
 */
export async function waitHydrated(page, selector, opts = {}) {
  const timeout = opts.timeout ?? 30000;
  await page.waitForSelector(selector, { timeout });

  const 손붙음 = await page
    .waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const page = el.closest('.tool-page') || document.getElementById('tool-pages');
        if (!page) return false;
        const 단추 = [...page.querySelectorAll('button')];
        if (!단추.length) return 'no-button';
        return 단추.some((b) => typeof b.onclick === 'function');
      },
      selector,
      { timeout }
    )
    .then((h) => h.jsonValue())
    .catch(() => false);

  /* 단추가 없어 신호를 못 본 화면(그리고 시간이 다 된 경우)은 가라앉기만 기다린다.
     못 기다린 것을 「기다렸다」로 삼키지 않으려고 결과를 돌려준다. */
  if (손붙음 !== true) await page.waitForTimeout(500);
  return 손붙음 === true;
}
