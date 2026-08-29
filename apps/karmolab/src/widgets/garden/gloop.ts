/**
 * 정원 그림 한 판 (change.widget-idle-cost).
 *
 * 정원 갈래들은 각자 `requestAnimationFrame` 으로 스스로를 다시 걸었다. 그건 **화면에서
 * 나가도 계속 돈다**. 브라우저는 안 보이는 요소의 rAF 를 안 멈추고, 셸은 장을 안 지운다
 * (입력하던 값이 살아 있는 것이 계약이다). 정원 하나로 rAF 콜백이 2초에 120 → 1220 이었다.
 *
 * 여기를 지나면 **보이는 동안만** 돈다. 시뮬레이션 상태는 그대로 남아 이어서 돈다.
 */
declare const Toolbox: {
  raf?: (fn: (time: number) => void) => { stop: () => void; start: () => void };
  onDispose?: (fn: () => void) => void;
} | undefined;

export interface GardenLoop {
  stop(): void;
}

/** `fn` 을 매 프레임 부른다. 셸이 있으면 셸이 멈춰 준다. 없으면(시험, 따로 띄운 화면) 그냥 돈다. */
export function gloop(fn: () => void): GardenLoop {
  if (typeof Toolbox !== 'undefined' && Toolbox?.raf) return Toolbox.raf(() => fn());
  /* 셸이 없을 때만 오는 자리 — 여기서 멈춰 줄 사람이 없다. 검사에게 그 사실을 말한다:
     keepAlive('셸 없이 띄운 화면 — 멈춰 줄 셸이 없다') */
  let handle: number | undefined = requestAnimationFrame(function tick() {
    handle = requestAnimationFrame(tick);
    fn();
  });
  const loop = { stop(): void { if (handle !== undefined) cancelAnimationFrame(handle); handle = undefined; } };
  Toolbox?.onDispose?.(loop.stop);
  return loop;
}
