/**
 * 정원 그림 한 판 (change.widget-idle-cost).
 *
 * 정원 갈래들은 각자 `requestAnimationFrame` 으로 스스로를 다시 걸었다. 그건 **화면에서
 * 나가도 계속 돈다**. 브라우저는 안 보이는 요소의 rAF 를 안 멈추고, 셸은 장을 안 지운다
 * (입력하던 값이 살아 있는 것이 계약이다). 정원 하나로 rAF 콜백이 2초에 120 → 1220 이었다.
 *
 * 여기를 지나면 **보이는 동안만** 돈다. 시뮬레이션 상태는 그대로 남아 이어서 돈다.
 *
 * 셸이 멈춰 주는 단위는 **위젯 하나**다. 정원은 한 위젯 안에 갈래가 10개고 셸이 보기엔
 * 전부 켜져 있는 것이라, 탭 하나를 보는 동안 나머지 9개가 같이 돌았다 (실측 2026-09-05:
 * 정원을 열면 시뮬 10개가 동시에 돈다). 그래서 갈래마다 자기 판이 화면에 걸쳐 있는지
 * 직접 본다. `el` 을 넘기면 안 보이는 동안 rAF 를 아예 안 거는 것
 */
declare const Toolbox: {
  raf?: (fn: (time: number) => void) => { stop: () => void; start: () => void };
  onDispose?: (fn: () => void) => void;
} | undefined;

export interface GardenLoop {
  stop(): void;
}

/**
 * 매 프레임 `fn`. 셸이 있으면 셸이 멈춰 주고, 없으면(시험, 따로 띄운 화면) 그냥 도는 것
 *
 * @param el 이 판이 화면에 걸친 동안만 구동. 탭으로 가려진 갈래를 멈추는 자리
 */
export function gloop(fn: () => void, el?: Element): GardenLoop {
  const base = makeLoop(fn);
  if (!el || typeof IntersectionObserver === 'undefined') return base;

  let visible = true;
  const io = new IntersectionObserver(
    (entries) => {
      const now = entries.some((e) => e.isIntersecting);
      if (now === visible) return;
      visible = now;
      if (now) base.start();
      else base.stop();
    },
    { threshold: 0 }
  );
  io.observe(el);
  const loop = {
    stop(): void {
      io.disconnect();
      base.stop();
    }
  };
  Toolbox?.onDispose?.(loop.stop);
  return loop;
}

function makeLoop(fn: () => void): { stop(): void; start(): void } {
  if (typeof Toolbox !== 'undefined' && Toolbox?.raf) return Toolbox.raf(() => fn());
  /* 셸이 없을 때만 오는 자리. 멈춰 줄 사람이 없으니 검사에게 그 사실을 말한다:
     keepAlive('셸 없이 띄운 화면. 멈춰 줄 셸이 없다') */
  let handle: number | undefined;
  const loop = {
    start(): void {
      if (handle !== undefined) return;
      handle = requestAnimationFrame(function tick() {
        handle = requestAnimationFrame(tick);
        fn();
      });
    },
    stop(): void {
      if (handle !== undefined) cancelAnimationFrame(handle);
      handle = undefined;
    }
  };
  loop.start();
  Toolbox?.onDispose?.(loop.stop);
  return loop;
}
