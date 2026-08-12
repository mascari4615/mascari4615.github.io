/**
 * 화면에서 **잘리고 튀어나온 것**을 브라우저 안에서 직접 잰다 (TASK-KL-220).
 *
 * 33회차 동안 단위·smoke 가 전부 초록인 채로 BPM 칸이 잘려 있었고 모바일은 화면 절반이
 * 트랙 머리였다. 검사는 「무엇이 일어났나」만 보고 「어떻게 보이나」는 안 봤다.
 * 그래서 사람 눈이 하던 일 중 **기계가 확실히 할 수 있는 세 가지**만 잰다:
 *
 *  ① 글자가 제 칸을 넘쳤나 (scrollWidth > clientWidth)
 *  ② 값 칸이 내용보다 좁나 (input/select 가 제 값을 못 보여 준다)
 *  ③ 무엇이 화면 밖으로 나갔나 (뿌리 상자 밖으로 삐져나온 조각)
 *
 * 「예쁘다/촌스럽다」는 안 본다 — 그건 사람이 본다. 이건 **잘림**만 본다.
 */

/**
 * @param {import('playwright').Page} page
 * @param {string} rootSelector 검사할 뿌리 (이 안쪽만 본다)
 * @param {{ignore?: string[]}} [options] 넘쳐도 괜찮은 것들 (스크롤 되는 판 등)
 */
export async function auditLayout(page, rootSelector, options = {}) {
  const ignore = options.ignore ?? [];
  return page.evaluate(([selector, skip]) => {
    const root = document.querySelector(selector);
    if (!root) return { ok: false, reason: 'root not found', clipped: [], overflow: [], tooNarrow: [] };
    const rootBox = root.getBoundingClientRect();
    const skipped = (element) => skip.some((sel) => element.closest(sel));
    const label = (element) => {
      const id = element.dataset?.act || element.dataset?.bind || element.dataset?.role || element.dataset?.trackAct || '';
      const text = (element.textContent || '').trim().slice(0, 24);
      return `${element.tagName.toLowerCase()}${element.className ? '.' + String(element.className).split(' ')[0] : ''}${id ? `[${id}]` : ''}${text ? ` "${text}"` : ''}`;
    };

    const clipped = [];
    const tooNarrow = [];
    const overflow = [];

    for (const element of root.querySelectorAll('*')) {
      if (skipped(element)) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;

      /* ① 글자가 칸을 넘쳤다.
         빼는 것 셋 — (a) 스크롤 되는 칸과 **그 안의 것들**(넓은 게 정상이다),
         (b) 말줄임표로 **일부러** 자른 것, (c) 글자가 없는 것(선·칸막이). */
      const scrolls = /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY);
      const insideScroller = (() => {
        for (let node = element.parentElement; node && node !== root.parentElement; node = node.parentElement) {
          const parentStyle = getComputedStyle(node);
          if (/auto|scroll/.test(parentStyle.overflowX) || /auto|scroll/.test(parentStyle.overflowY)) return true;
        }
        return false;
      })();
      const ellipsis = style.textOverflow === 'ellipsis' && style.overflow !== 'visible';
      const hasText = (element.textContent || '').trim().length > 0;
      if (!scrolls && !insideScroller && !ellipsis && hasText
          && element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) {
        clipped.push({ what: label(element), by: element.scrollWidth - element.clientWidth });
      }

      /* ② 값 칸이 제 값을 못 보여 준다. */
      if ((element.tagName === 'INPUT' || element.tagName === 'SELECT') && element.scrollWidth > element.clientWidth + 1) {
        tooNarrow.push({ what: label(element), value: String(element.value ?? '').slice(0, 20), by: element.scrollWidth - element.clientWidth });
      }

      /* ③ 뿌리 밖으로 삐져나갔다 — 가로만 본다(세로는 스크롤이 정상).
         스크롤 되는 칸 안의 것은 뺀다: 굴려서 보면 되니 「나갔다」가 아니다. */
      if (!insideScroller && (box.right > rootBox.right + 1 || box.left < rootBox.left - 1)) {
        overflow.push({ what: label(element), left: Math.round(box.left - rootBox.left), right: Math.round(box.right - rootBox.right) });
      }
    }
    return { ok: true, clipped, tooNarrow, overflow };
  }, [rootSelector, ignore]);
}

/** 사람이 읽을 한 줄들로. */
export function describeLayout(report) {
  const lines = [];
  for (const item of report.tooNarrow) lines.push(`값 칸이 좁다 — ${item.what} 값 "${item.value}" 가 ${item.by}px 잘림`);
  for (const item of report.clipped) lines.push(`글자가 칸을 넘쳤다 — ${item.what} (${item.by}px)`);
  for (const item of report.overflow) lines.push(`화면 밖으로 나갔다 — ${item.what} (오른쪽 +${item.right}px)`);
  return lines;
}
