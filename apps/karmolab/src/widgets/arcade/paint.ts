/**
 * 판 그리기 재질. 캔버스 놀이가 함께 쓰는 **붓** (change.arcade-redesign)
 *
 * 캔버스 판 열 개가 저마다 색을 하나 골라 평평하게 칠하고 있었다(초록 하나, 하늘색 하나...).
 * 재질은 몇 종류뿐이다: 천, 얼음, 나무, 흙. 그 붓을 여기 두고 판은 **무엇을 어디에**만
 * 정한다.
 *
 * 좌표계는 판이 정한 논리 크기(W, H)를 그대로 쓴다. 붓이 화면 픽셀을 몰라야 판이 커져도
 * 그림이 같다.
 */

type Ctx = CanvasRenderingContext2D;

/** 천 (당구, 다트판 뒤). 가운데가 밝고 가장자리가 어둡다. */
export function felt(c: Ctx, w: number, h: number, hue: 'green' | 'blue' = 'green'): void {
  const g = c.createRadialGradient(w / 2, h * 0.34, 2, w / 2, h / 2, Math.max(w, h) * 0.72);
  if (hue === 'green') {
    g.addColorStop(0, '#1c7d5c');
    g.addColorStop(0.55, '#146349');
    g.addColorStop(1, '#0d4633');
  } else {
    g.addColorStop(0, '#1f6f92');
    g.addColorStop(0.55, '#175a78');
    g.addColorStop(1, '#0f4056');
  }
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/** 얼음 (컬링, 에어하키). 흰데 푸른 기가 돌고, 위에서 빛이 비스듬히 깔린다. */
export function ice(c: Ctx, w: number, h: number): void {
  const g = c.createLinearGradient(0, 0, w * 0.6, h);
  g.addColorStop(0, '#f7fbff');
  g.addColorStop(0.5, '#e6eff8');
  g.addColorStop(1, '#d3e2f0');
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  /* 결. 갈아 놓은 빙판의 미세한 줄. 너무 또렷하면 종이에 그은 선이 된다. */
  c.strokeStyle = 'rgba(255,255,255,.65)';
  c.lineWidth = Math.max(0.3, w * 0.004);
  for (let i = 0; i < 7; i += 1) {
    const y = (h / 7) * (i + 0.35);
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y + h * 0.012);
    c.stroke();
  }
}

/** 나무 테두리. 판 둘레의 두께. 안쪽에 밝은 선을 하나 더 그어야 두께로 읽힌다. */
export function woodRail(c: Ctx, w: number, h: number, thick = 3.4): void {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7d5216');
  g.addColorStop(1, '#4a2f0d');
  c.strokeStyle = g;
  c.lineWidth = thick;
  c.strokeRect(thick / 2, thick / 2, w - thick, h - thick);
  c.strokeStyle = 'rgba(255,214,150,.28)';
  c.lineWidth = thick * 0.15;
  c.strokeRect(thick * 1.1, thick * 1.1, w - thick * 2.2, h - thick * 2.2);
}

/**
 * 구슬, 돌. **떠 있는 알**로 그린다: 바닥 그림자, 좌상단에서 오는 빛, 하이라이트 한 점.
 * 평평한 원으로 칠하면 판 위에 스티커를 붙인 그림이 된다.
 */
export function orb(
  c: Ctx, x: number, y: number, r: number, color: string, light = '#ffffff', shadow = true
): void {
  /* 그림자는 **옆에서 볼 때만** 뜻이 있다. 위에서 내려다보는 판(뱀)에서는 옆으로 깔린
     타원이 알을 납작하게 눌러 놓은 것처럼 읽힌다. 그런 판은 `shadow=false`. */
  if (shadow) {
    c.beginPath();
    c.ellipse(x + r * 0.25, y + r * 0.4, r * 0.95, r * 0.62, 0, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,.26)';
    c.fill();
  }

  const g = c.createRadialGradient(x - r * 0.34, y - r * 0.38, r * 0.12, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.45));
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = g;
  c.fill();

  c.beginPath();
  c.ellipse(x - r * 0.32, y - r * 0.42, r * 0.26, r * 0.17, -0.5, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,.7)';
  c.fill();
}

/** 색을 밝게(+), 어둡게(−). 판마다 어두운 색을 따로 적어 두면 두 곳이 갈린다. */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt))))
  );
  return '#' + ch.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** 자리 색 여섯. 화면 여덟이 각자 적던 팔레트 (2026-09-02 감사 B4) */
export const SEAT_COLOR = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#06b6d4'] as const;
