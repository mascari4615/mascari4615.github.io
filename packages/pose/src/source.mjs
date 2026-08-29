/**
 * **포즈 소스**. 손이든 폰이든 마우스든, 화면 쪽에는 **한 모양**으로 들어온다.
 *
 * 이 꾸러미의 알맹이는 손 인식이 아니라 **이 그릇**이다. 손을 이름에 넣지 않은 까닭도 그것이다
 * (`hand-kit` 이면 폰이 이름 밖으로 밀린다). 나중에 얼굴, 전신을 붙여도 여기는 안 바뀐다.
 *
 * 한 판(frame)의 모양:
 * ```
 * { t, ok, kind, point: [x, y] | null, depth, grip, buttons, raw }
 * ```
 * - `point` = 0~1 로 편 화면 자리 (왼위 0,0). 소스가 무엇이든 같은 눈금
 * - `depth` = 0~1, 카메라 쪽이 1 (손이 앞으로 나오면 큼). 없으면 0.5
 * - `grip`  = 0~1, **쥔 정도**. 손은 엄지-검지 사이, 마우스는 버튼, 폰은 화면 누름
 * - `kind`  = 'hand' | 'phone' | 'pointer'. 화면이 무엇으로 조작 중인가를 적을 수 있게
 *
 * 소스는 `start()` / `stop()` / `onFrame(fn)` 만 있으면 된다. 그 위에 얹는 사건 셈은
 * `gesture.mjs` 가 한다. **소스는 값만 낸다**(판정은 한 곳에서).
 */

/** 빈 판 하나. 소스가 아직 아무것도 못 볼 때. */
export function emptyFrame(kind = 'none', t = 0) {
  return { t, ok: false, kind, point: null, depth: 0.5, grip: 0, buttons: 0, raw: null };
}

/**
 * 여러 소스를 **하나로 묶는다.** 손이 안 보이면 마우스가, 마우스가 쉬면 손이 이어받는다.
 * 규칙은 하나: **가장 최근에 `ok` 를 낸 소스**가 말한다. 그러다 `idleMs` 동안 조용하면 놓는다.
 */
export function mergeSources(sources, { idleMs = 700 } = {}) {
  let last = emptyFrame();
  let lastOkAt = -Infinity;
  let owner = null;
  const listeners = new Set();
  const offs = [];

  const push = (f) => {
    const stale = f.t - lastOkAt > idleMs;
    if (f.ok && (owner === null || owner === f.kind || stale)) {
      owner = f.kind; lastOkAt = f.t; last = f;
    } else if (owner === f.kind && !f.ok) {
      last = { ...f, ok: false };
      if (stale) owner = null;
    } else {
      return;    // 주인이 아닌 소스의 말은 흘린다
    }
    for (const fn of listeners) fn(last);
  };

  const live = [...sources];
  return {
    get owner() { return owner; },
    get last() { return last; },
    get sources() { return [...live]; },
    onFrame(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /**
     * **나중에 소스를 더한다**. 손은 켤 때 붙는다(무거워서 처음부터 안 켠다).
     * 이미 돌고 있으면 붙이자마자 듣기 시작한다.
     */
    add(source, { start = true } = {}) {
      live.push(source);
      offs.push(source.onFrame(push));
      if (start) source.start?.();
      return source;
    },
    start() {
      for (const s of live) {
        offs.push(s.onFrame(push));
        s.start?.();
      }
      return this;
    },
    stop() {
      for (const off of offs.splice(0)) off?.();
      for (const s of live) s.stop?.();
      owner = null;
      return this;
    },
  };
}

/**
 * **마우스, 손가락 소스**. 늘 되는 바닥. 손 인식이 없어도 조작이 되고, 자가 돌 수 있다.
 *
 * 카메라도 권한도 없다. 그래서 이것이 **기본**이고 손은 켜는 것이다
 * (허공에 손 든 자세는 짧은 시간에도 팔이 지친다. 실측된 제약).
 */
export function pointerSource(el, { now = () => performance.now() } = {}) {
  const listeners = new Set();
  let down = 0;
  const emit = (e, ok = true) => {
    const r = el.getBoundingClientRect();
    const f = {
      t: now(),
      ok,
      kind: 'pointer',
      point: [(e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.height || 1)],
      depth: 0.5,
      grip: down ? 1 : 0,
      buttons: down,
      raw: null,
    };
    for (const fn of listeners) fn(f);
  };
  const onMove = (e) => emit(e);
  const onDown = (e) => { down = 1; emit(e); };
  const onUp = (e) => { down = 0; emit(e); };
  const onLeave = (e) => { down = 0; emit(e, false); };
  return {
    kind: 'pointer',
    onFrame(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    start() {
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerdown', onDown);
      window.addEventListener('pointerup', onUp);
      el.addEventListener('pointerleave', onLeave);
    },
    stop() {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointerleave', onLeave);
    },
  };
}
