/**
 * 키로 미는 자리. 마우스는 위치, 키는 속도 (TASK-KL-317)
 *
 * 마우스는 *어디에 있나*를 그대로 준다. 키는 *어느 쪽으로 가고 싶나*밖에 못 준다.
 * 그 둘을 잇는 자리는 **화면(view)** 이다. 커널은 지금도 화면이 만든 위치(`act({x})`)만 받는다.
 * 그래서 여기서 키를 위치로 바꾼다. 커널에 키 개념을 넣으면 재생, 되돌리기가 입력 장치에 묶인다.
 *
 * 두 가지를 특히 조심한다:
 *   ① **시간으로 민다**. 프레임 수로 밀면 144Hz 화면에서 2.4배 빠른 다른 놀이가 된다.
 *   ② **대각을 정규화한다**. 안 하면 비스듬히 갈 때만 1.41배 빠르다.
 *
 * 그리고 창(window)에서 듣는다. 판(canvas)에 걸면 **초점이 판에 오지 않아 한 번도 안 먹는다**
 *. 2026-08-15 실측: 화살표를 눌러도 라켓이 40.0 에서 꼼짝 안 했다(뱀만 창에서 듣고 있었다).
 */

declare const Toolbox: { onDispose?: (fn: () => void) => void } | undefined;

const LEFT = new Set(['ArrowLeft', 'a', 'A']);
const RIGHT = new Set(['ArrowRight', 'd', 'D']);
const UP = new Set(['ArrowUp', 'w', 'W']);
const DOWN = new Set(['ArrowDown', 's', 'S']);

export type KeyDrive = {
  /** 지난 호출 이후 흐른 시간만큼 민 거리. 아무 키도 안 눌렸으면 0,0 이고 그때는 아무것도 안 보낸다. */
  step(): { dx: number; dy: number; held: boolean };
  dispose(): void;
};

/**
 * @param spanX 가로 한 변 (판 좌표계). 이 길이를 `crossSec` 초에 건넌다.
 * @param spanY 세로 한 변. 0 이면 세로는 안 민다(탁구처럼 한 축만 쓰는 놀이).
 */
export function keyDrive(spanX: number, spanY = 0, crossSec = 1.1): KeyDrive {
  const held = new Set<string>();
  let last = 0;

  const onDown = (e: KeyboardEvent): void => {
    if (!LEFT.has(e.key) && !RIGHT.has(e.key) && !UP.has(e.key) && !DOWN.has(e.key)) return;
    if (spanY === 0 && (UP.has(e.key) || DOWN.has(e.key))) return;
    held.add(e.key);
    e.preventDefault();
  };
  const onUp = (e: KeyboardEvent): void => { held.delete(e.key); };
  // 창이 초점을 잃으면 누른 채로 굳는다. 그러면 라켓이 혼자 벽까지 간다.
  const onBlur = (): void => { held.clear(); last = 0; };

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  const dispose = (): void => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', onBlur);
    held.clear();
  };
  if (typeof Toolbox !== 'undefined') Toolbox.onDispose?.(dispose);

  return {
    step() {
      const now = performance.now();
      // 첫 프레임과 **탭이 뒤로 갔다 온 뒤**는 dt 를 믿을 수 없다(수 초가 찍힌다) → 한 프레임 버린다.
      const dt = last === 0 || now - last > 250 ? 0 : (now - last) / 1000;
      last = now;
      let ix = 0;
      let iy = 0;
      for (const k of held) {
        if (LEFT.has(k)) ix -= 1;
        else if (RIGHT.has(k)) ix += 1;
        else if (UP.has(k)) iy -= 1;
        else if (DOWN.has(k)) iy += 1;
      }
      ix = Math.max(-1, Math.min(1, ix));
      iy = Math.max(-1, Math.min(1, iy));
      const held2 = ix !== 0 || iy !== 0;
      if (!held2 || dt === 0) return { dx: 0, dy: 0, held: held2 };
      const norm = ix !== 0 && iy !== 0 ? Math.SQRT1_2 : 1;
      return {
        dx: (ix * norm * spanX * dt) / crossSec,
        dy: spanY === 0 ? 0 : (iy * norm * spanY * dt) / crossSec,
        held: true
      };
    },
    dispose
  };
}
