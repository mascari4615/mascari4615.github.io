/**
 * 캔버스가 제 칸을 다 쓰게 (2026-09-03, 사용자 지적 세 번째: 2D 도 3D 도 콘텐츠 칸 전체, 여백 없음)
 *
 * 전에는 폭만 받고 높이를 비율로 정해 세로로 긴 판(컬링 2.6:1)이 3,000px 로 넘치거나, 높이에 맞춰 폭을
 * 잘라 좌우가 비었다. 여기서는 캔버스가 칸을 통째로 덮고(CSS 가 폭과 높이를 줌), 판은 그 안에 맞춰
 * 넣음(`contain`). 남는 자리는 캔버스의 배경색(CSS)이 채워 그 장면의 바닥이 이어져 보임.
 *
 * 돌려주는 것: 판 좌표 -> 캔버스 화소 변환. `c.setTransform(k, 0, 0, k, ox, oy)` 로 씀
 */
export interface CanvasFit {
  /** 판 한 칸이 캔버스 화소 몇 개인가 */
  k: number;
  /** 판 왼쪽 위가 캔버스 어디인가 (화소) */
  ox: number;
  oy: number;
  /** 캔버스 화소 크기 */
  pw: number;
  ph: number;
}

export function fitCanvas(cv: HTMLCanvasElement, W: number, H: number): CanvasFit {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = cv.clientWidth || 300;
  /* 높이를 CSS 가 안 줬으면(칸 밖, 옛 배치) 비율로 */
  const ch = cv.clientHeight || Math.round((cw * H) / W);
  const pw = Math.round(cw * dpr);
  const ph = Math.round(ch * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  const k = Math.min(pw / W, ph / H);
  return { k, ox: (pw - W * k) / 2, oy: (ph - H * k) / 2, pw, ph };
}

/** 캔버스 전체를 비우고 판 변환을 건다. 그리기 앞에 한 번 */
export function beginFit(c: CanvasRenderingContext2D, f: CanvasFit): void {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, f.pw, f.ph);
  c.setTransform(f.k, 0, 0, f.k, f.ox, f.oy);
}

/** 캔버스 화소 -> 판 좌표. 누른 자리를 판으로 옮길 때 */
export function toBoard(cv: HTMLCanvasElement, f: CanvasFit, clientX: number, clientY: number): { x: number; y: number } {
  const r = cv.getBoundingClientRect();
  const sx = f.pw / (r.width || 1);
  const sy = f.ph / (r.height || 1);
  return { x: ((clientX - r.left) * sx - f.ox) / f.k, y: ((clientY - r.top) * sy - f.oy) / f.k };
}
