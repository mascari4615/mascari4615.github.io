/**
 * **사건 셈**. 판(frame)의 흐름에서 쥐었다 / 놓았다 / 끌었다를 낸다.
 *
 * ⚠ **손은 고르기에 안 쓴다.** 실측된 제약: 손짓으로 고르게 하면 처리량이 절반이고 틀림이
 * 네 배다. 그래서 여기가 내는 것도 **연속 조작**(끌기, 당기기)뿐이고, 눌러서 고르기는
 * 마우스, 자판 몫으로 남긴다.
 *
 * ⚠ **문턱 하나로 켜고 끄지 않는다**(히스테리시스). 0.5 한 줄로 재면 손이 조금만 떨려도
 * 쥐었다 놓았다가 초당 몇 번씩 난다. 쥘 때는 높게, 놓을 때는 낮게 둔다.
 *
 * ⚠ **떨림을 눌러 준다**(1€ 필터 계열의 단순판): 느리게 움직일 땐 세게 눌러 조용하게,
 * 빠르게 움직일 땐 약하게 눌러 따라가게. 한 계수로 고정하면 조용하지만 굼뜨다가 된다.
 */

/** 한 줄짜리 저역 통과. `a` 가 1 이면 그대로, 0 에 가까울수록 무겁다. */
export function lowpass(prev, next, a) {
  return prev == null ? next : prev + (next - prev) * a;
}

/**
 * 속도에 따라 세기가 바뀌는 떨림 누르개.
 * `minCut` = 멈춰 있을 때의 세기(작을수록 조용), `beta` = 빨리 움직일 때 얼마나 풀어 줄지.
 */
export function makeSmoother({ minCut = 0.35, beta = 6, dt = 1 / 60 } = {}) {
  let prev = null;
  let prevRaw = null;
  return (v) => {
    if (v == null) { prev = null; prevRaw = null; return null; }
    const speed = prevRaw == null ? 0 : Math.abs(v - prevRaw) / dt;
    prevRaw = v;
    const cut = minCut + beta * speed;
    /* 잘라내는 주파수를 계수로. 값이 클수록(빠를수록) 1 에 가까워진다. */
    const tau = 1 / (2 * Math.PI * cut);
    const a = 1 / (1 + tau / dt);
    prev = lowpass(prev, v, a);
    return prev;
  };
}

/**
 * 쥠 사건. `onGrab` / `onRelease` / `onDrag(dx, dy, frame)` 를 낸다.
 *
 * `dx, dy` 는 **화면 비율**(0~1)이 아니라 **화소**로 낸다. 궤도 카메라가 화소로 받기 때문.
 * 화면 크기는 `size()` 로 물어본다(창이 바뀌어도 손맛이 안 바뀌게).
 */
export function createGestures({
  grabOn = 0.7,
  grabOff = 0.45,
  size = () => [1, 1],
  smooth = true,
} = {}) {
  const listeners = { grab: new Set(), release: new Set(), drag: new Set(), frame: new Set() };
  const sx = smooth ? makeSmoother() : null;
  const sy = smooth ? makeSmoother() : null;
  let holding = false;
  let last = null;

  const fire = (name, ...args) => { for (const fn of listeners[name]) fn(...args); };

  return {
    on(name, fn) {
      if (!listeners[name]) throw new Error(`모르는 사건: ${name}`);
      listeners[name].add(fn);
      return () => listeners[name].delete(fn);
    },
    get holding() { return holding; },
    /** 판 하나를 먹인다. 소스가 무엇이든 같은 자리로 들어온다. */
    push(f) {
      fire('frame', f);
      if (!f.ok || !f.point) {
        if (holding) { holding = false; fire('release', f); }
        last = null;
        sx?.(null); sy?.(null);
        return;
      }
      const [w, h] = size();
      const px = (smooth ? sx(f.point[0]) : f.point[0]) * w;
      const py = (smooth ? sy(f.point[1]) : f.point[1]) * h;

      /* 문턱 둘. 쥘 때는 높게, 놓을 때는 낮게. 하나면 손 떨림이 그대로 사건이 된다. */
      if (!holding && f.grip >= grabOn) {
        holding = true; last = [px, py]; fire('grab', f);
      } else if (holding && f.grip <= grabOff) {
        holding = false; last = null; fire('release', f);
      }

      if (holding && last) {
        const dx = px - last[0];
        const dy = py - last[1];
        last = [px, py];
        if (dx || dy) fire('drag', dx, dy, f);
      }
    },
    /** 소스에 붙인다. 돌려주는 손을 부르면 떨어진다. */
    attach(source) {
      return source.onFrame((f) => this.push(f));
    },
  };
}
