/**
 * 손놀림. 누르기냐 끌기냐 (`features/play.md` 의 계약)
 *
 * 둘을 한 화면에 다 두면 섞여서 오동작. 든 채로 다른 카드를 끌면 그것이 놓기로 읽혀
 * "거기엔 못 놓는다" 만 나오고, 먼저 든 것을 물려야 다시 시작(2026-09-01 사용자 실측)
 *
 * 그래서 사람이 고름. 기본은 화면에 맞게. 손가락이면 누르기, 마우스면 끌기
 * 고른 값은 브라우저에 남고 판마다 화면이 읽음
 */
const KEY = 'karmolab.arcade.hand';

export type HandMode = 'auto' | 'tap' | 'drag';
/** 실제로 도는 손놀림. `auto` 는 화면을 보고 둘 중 하나로 풀린다 */
export type HandNow = 'tap' | 'drag';

/** 손가락 화면인가. 마우스가 없고 손끝이 있으면 누르기가 나음 */
function coarse(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function handMode(): HandMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'tap' || v === 'drag' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setHandMode(v: HandMode): void {
  try {
    if (v === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
  } catch {
    /* 못 써도 이 판에서는 돈다 */
  }
}

/** 지금 무엇으로 도나. 화면이 이 값만 보면 됨 */
export function handNow(): HandNow {
  const m = handMode();
  if (m !== 'auto') return m;
  return coarse() ? 'tap' : 'drag';
}

/** 세 값을 돌림. 설정 버튼 하나로 auto -> tap -> drag -> auto */
export function nextHandMode(): HandMode {
  const m = handMode();
  const next: HandMode = m === 'auto' ? 'tap' : m === 'tap' ? 'drag' : 'auto';
  setHandMode(next);
  return next;
}
