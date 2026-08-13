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
 * @param {{ timeout?: number, require?: boolean }} [opts]
 *   `require: true` 면 **손이 안 붙었을 때 던진다**. 안 그러면 못 기다린 것을 그대로 안고
 *   내려가서, 미리 그린 HTML 에 값을 넣고 「값을 넣어 주세요」로 끝난다 — 화면은 멀쩡한데
 *   검사만 이상한 말을 하는 자리가 된다(판본 대조가 그렇게 며칠 빨갛게 방치됐다,
 *   [[TASK-KL-301]]). 실서비스를 겨누는 검사는 켜 두는 편이 낫다.
 */
export async function waitHydrated(page, selector, opts = {}) {
  const timeout = opts.timeout ?? 30000;
  await page.waitForSelector(selector, { timeout });

  const 손붙음 = await page
    .waitForFunction(
      (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        /* ★ **준 그 요소가 단추면 그 단추에게 묻는다** (2026-08-13).
           예전에는 「같은 화면 안 아무 단추 하나라도 손이 붙었으면」이었다. 그런데 도구 상세
           화면에는 셸이 만든 단추들이 이미 손을 달고 앉아 있어서, **그 도구 자신은 아직 안
           그려졌는데** 신호가 참이 됐다. 판본 대조가 그 틈에 걸렸다: 파일 두 개를 미리 그린
           HTML 쪽 입력칸에 넣고 나면, 곧이어 위젯이 그 자리를 통째로 갈아 끼워 파일이 사라지고
           「두 판본을 모두 넣어 주세요」로 끝났다(실사이트 실측). 준 요소가 단추면 그 단추다. */
        if (el.tagName === 'BUTTON') return typeof el.onclick === 'function';
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
  /* `'no-button'` 은 **기다릴 신호가 없는 화면**이지 못 뜬 화면이 아니다 — 여기서 던지면
     단추 없는 도구를 통째로 못 재게 된다. 던지는 건 시간이 다 된 `false` 뿐이다. */
  if (손붙음 === false && opts.require) {
    throw new Error(
      `화면이 안 떴다 — \`${selector}\` 에 손이 안 붙었다 (${timeout}ms). ` +
        '도구가 고장 난 것이 아니라 **판이 아직 안 나갔거나 사이트가 느린 것**일 수 있다 — 배포가 끝난 뒤 다시 보라.'
    );
  }
  return 손붙음 === true;
}
