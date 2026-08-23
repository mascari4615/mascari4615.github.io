/**
 * **궤도 카메라** — 가운데를 두고 돌려 본다 (three 의 OrbitControls 를 안 쓴다).
 *
 * 왜 직접: 벤더에 든 것은 `three.module.min.js` 한 벌뿐이고, 컨트롤을 더 들이면 **한 곳으로
 * 모은다**는 이 꾸러미의 뜻이 흐려진다. 우리가 쓰는 것은 돌기·당기기·밀기 셋뿐이라 셈이 짧다.
 *
 * 나뉘어 있는 이유:
 * - `orbitPosition()` = **순수 셈**. 화면도 three 도 필요 없어 headless 로 잰다
 * - `createOrbit()` = 그 셈에 손잡이(관성·한계·입력)를 붙인 것
 *
 * 좌표 규약: y 가 위. `pitch` 는 수평면에서 잰 각(라디안) — +면 위에서 내려다본다.
 * 위·아래 꼭짓점에서는 방위가 뒤집혀 손맛이 무너지므로 **한계를 둔다**(기본 ±85°).
 */

export const HALF_PI = Math.PI / 2;

/** 가운데·거리·방위·높이 → 카메라 자리. 순수 함수 (같은 입력 = 같은 자리). */
export function orbitPosition(target, distance, yaw, pitch) {
  const [tx, ty, tz] = target;
  const cp = Math.cos(pitch);
  return [
    tx + distance * cp * Math.sin(yaw),
    ty + distance * Math.sin(pitch),
    tz + distance * cp * Math.cos(yaw),
  ];
}

/** 값을 한계 안으로. */
export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * 궤도 상태 + 손잡이.
 *
 * `update(dt)` 를 그리기 바퀴에서 부르면 **관성**이 목표값을 따라간다 — 손을 떼도 조금 더 돈다.
 * 관성을 0 으로 두면 즉시 따라간다(시험·정지 화면용).
 */
export function createOrbit({
  target = [0, 0, 0],
  distance = 3,
  yaw = 0,
  pitch = 0.5,
  minDistance = 0.4,
  maxDistance = 40,
  maxPitch = (85 * Math.PI) / 180,
  damping = 0.12,
  rotateSpeed = 0.005,
  zoomSpeed = 0.0015,
} = {}) {
  const want = { yaw, pitch, distance, target: [...target] };
  const now = { yaw, pitch, distance, target: [...target] };

  const api = {
    get state() {
      return { ...now, target: [...now.target], want: { ...want, target: [...want.target] } };
    },
    /** 화면에서 끈 만큼 돌린다 (px). */
    rotate(dx, dy) {
      want.yaw -= dx * rotateSpeed;
      want.pitch = clamp(want.pitch + dy * rotateSpeed, -maxPitch, maxPitch);
      return api;
    },
    /** 굴린 만큼 당긴다. 곱셈이라 멀리서도 가까이서도 손맛이 같다. */
    zoom(delta) {
      want.distance = clamp(want.distance * Math.exp(delta * zoomSpeed), minDistance, maxDistance);
      return api;
    },
    /** 가운데를 옮긴다 — 화면 기준(오른쪽·위)으로 민다. */
    pan(dx, dy) {
      const s = want.distance * 0.0015;
      const right = [Math.cos(want.yaw), 0, -Math.sin(want.yaw)];
      const up = [
        -Math.sin(want.pitch) * Math.sin(want.yaw),
        Math.cos(want.pitch),
        -Math.sin(want.pitch) * Math.cos(want.yaw),
      ];
      for (let i = 0; i < 3; i += 1) want.target[i] += (-dx * right[i] + dy * up[i]) * s;
      return api;
    },
    /** 목표를 그대로 박는다 (관성 없이). */
    set(next = {}) {
      if (next.yaw != null) { want.yaw = next.yaw; now.yaw = next.yaw; }
      if (next.pitch != null) { want.pitch = clamp(next.pitch, -maxPitch, maxPitch); now.pitch = want.pitch; }
      if (next.distance != null) {
        want.distance = clamp(next.distance, minDistance, maxDistance);
        now.distance = want.distance;
      }
      if (next.target) { want.target = [...next.target]; now.target = [...next.target]; }
      return api;
    },
    /** 관성 한 걸음. `dt` 는 초 — 프레임이 밀려도 같은 속도로 따라가게. */
    update(dt = 1 / 60) {
      const k = damping <= 0 ? 1 : 1 - Math.exp(-dt / damping);
      now.yaw += (want.yaw - now.yaw) * k;
      now.pitch += (want.pitch - now.pitch) * k;
      now.distance += (want.distance - now.distance) * k;
      for (let i = 0; i < 3; i += 1) now.target[i] += (want.target[i] - now.target[i]) * k;
      return api;
    },
    /** 지금 상태의 카메라 자리. */
    position() {
      return orbitPosition(now.target, now.distance, now.yaw, now.pitch);
    },
    /** three 카메라에 얹는다 (three 를 안 쓰면 안 불러도 된다). */
    apply(camera) {
      const [x, y, z] = api.position();
      camera.position.set(x, y, z);
      camera.lookAt(now.target[0], now.target[1], now.target[2]);
      return api;
    },
    /**
     * 마우스·손가락을 붙인다. **끄는 손을 돌려준다** — 화면이 사라질 때 부르면 리스너가 떨어진다.
     * 포즈 소스(KarmoPose)도 같은 `rotate/zoom/pan` 을 부르면 되므로 여기 안 들어온다.
     */
    attach(el, { button = 0 } = {}) {
      let last = null;
      const down = (e) => {
        if (e.button != null && e.button !== button && !e.touches) return;
        const p = e.touches ? e.touches[0] : e;
        last = [p.clientX, p.clientY];
      };
      const move = (e) => {
        if (!last) return;
        const p = e.touches ? e.touches[0] : e;
        const dx = p.clientX - last[0];
        const dy = p.clientY - last[1];
        last = [p.clientX, p.clientY];
        if (e.shiftKey) api.pan(dx, dy); else api.rotate(dx, dy);
        if (e.cancelable) e.preventDefault();
      };
      const up = () => { last = null; };
      const wheel = (e) => { api.zoom(e.deltaY); if (e.cancelable) e.preventDefault(); };
      el.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      el.addEventListener('wheel', wheel, { passive: false });
      return () => {
        el.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        el.removeEventListener('wheel', wheel);
      };
    },
  };
  return api;
}
