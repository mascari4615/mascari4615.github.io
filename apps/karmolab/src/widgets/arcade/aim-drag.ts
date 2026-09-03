/**
 * 조준 끌기. 끌기 한 번이 방향과 세기 (change.arcade-reference-followup, 2026-09-03)
 *
 * 레퍼런스(8 Ball Pool, Wii Sports, 클럽하우스 51)는 물리 판의 한 발 입력이 하나. 우리는 슬라이더 둘과
 * 버튼이라 한 발에 셋이었다. 여기서는 판 위 아무 데나 누르고 끌다 놓으면 그 순간 발사.
 *
 * - `pull`: 당구 큐처럼 뒤로 당김. 놓는 순간 당긴 반대쪽으로 나감 (컬링, 볼링, 당구, 투호)
 * - `push`: 끈 쪽으로 나감 (탱크)
 * - 죽은 구역 `dead` 안에서 놓으면 취소. 폰에서 손가락이 미끄러져 엉뚱한 데로 가던 것을 막음
 *   (옛 컬링 화면 주석의 걱정. 끌기를 막지 않고 짧은 끌기만 버림)
 * - 세기는 끈 길이. `max` 화소에서 1. 기본은 판 짧은 변의 0.35
 */

export interface AimReading {
  /** 나가는 방향. 화면 좌표(아래가 +y), 단위 벡터 */
  dx: number;
  dy: number;
  /** 0~1. 죽은 구역 안이면 0 */
  pow: number;
  /** 끌고 있는 중인가 */
  live: boolean;
}

export interface AimDragOpts {
  mode?: 'pull' | 'push';
  /** 세기 1 이 되는 화소 길이. 안 주면 판 짧은 변의 0.35 (최소 90) */
  max?: number;
  /** 이 안에서 놓으면 취소. 기본 12 화소 */
  dead?: number;
  /** 지금 끌 수 있나. 내 차례가 아니면 false */
  enabled(): boolean;
  /** 끌고 있는 동안 */
  onMove?(r: AimReading): void;
  /** 놓는 순간. 죽은 구역 밖일 때만 */
  onRelease(r: AimReading): void;
}

export interface AimDrag {
  /** 지금 끌고 있으면 그 값, 아니면 마지막으로 놓은 값. 아직 없으면 null */
  reading(): AimReading | null;
  dispose(): void;
}

export function mountAimDrag(target: HTMLElement, opts: AimDragOpts): AimDrag {
  const mode = opts.mode ?? 'pull';
  const dead = opts.dead ?? 12;
  let start: { x: number; y: number; id: number } | null = null;
  let last: AimReading | null = null;
  let live: AimReading | null = null;
  target.classList.add('ac-aim');

  const maxPx = (): number => opts.max ?? Math.max(90, Math.min(target.clientWidth, target.clientHeight) * 0.35);

  const read = (x: number, y: number): AimReading => {
    if (!start) return { dx: 0, dy: -1, pow: 0, live: false };
    const vx = x - start.x;
    const vy = y - start.y;
    const len = Math.hypot(vx, vy);
    if (len < dead) return { dx: 0, dy: -1, pow: 0, live: true };
    const sign = mode === 'pull' ? -1 : 1;
    return {
      dx: (sign * vx) / len,
      dy: (sign * vy) / len,
      pow: Math.min(1, (len - dead) / maxPx()),
      live: true
    };
  };

  const onDown = (ev: PointerEvent): void => {
    if (!opts.enabled() || start) return;
    if (ev.button !== undefined && ev.button !== 0) return;
    start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    try { target.setPointerCapture(ev.pointerId); } catch { /* 잡기 못 해도 창 이벤트로 받음 */ }
    live = read(ev.clientX, ev.clientY);
    opts.onMove?.(live);
    ev.preventDefault();
  };
  const onMove = (ev: PointerEvent): void => {
    if (!start || ev.pointerId !== start.id) return;
    live = read(ev.clientX, ev.clientY);
    opts.onMove?.(live);
    ev.preventDefault();
  };
  const onUp = (ev: PointerEvent): void => {
    if (!start || ev.pointerId !== start.id) return;
    const r = read(ev.clientX, ev.clientY);
    start = null;
    live = null;
    try { target.releasePointerCapture(ev.pointerId); } catch { /* 이미 풀림 */ }
    if (r.pow <= 0 || !opts.enabled()) {
      opts.onMove?.({ ...(last ?? r), live: false });
      return;
    }
    last = { ...r, live: false };
    opts.onRelease(last);
  };
  const onCancel = (ev: PointerEvent): void => {
    if (!start || ev.pointerId !== start.id) return;
    start = null;
    live = null;
    opts.onMove?.({ ...(last ?? { dx: 0, dy: -1, pow: 0 }), live: false });
  };

  target.addEventListener('pointerdown', onDown);
  target.addEventListener('pointermove', onMove);
  target.addEventListener('pointerup', onUp);
  target.addEventListener('pointercancel', onCancel);

  return {
    reading: () => live ?? last,
    dispose() {
      target.removeEventListener('pointerdown', onDown);
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onCancel);
      target.classList.remove('ac-aim');
    }
  };
}

/** 화면 방향에서 앞(위)을 0 으로 한 좌우 각. 오른쪽이 + */
export const lateralOf = (r: AimReading): number => Math.atan2(r.dx, -r.dy);
