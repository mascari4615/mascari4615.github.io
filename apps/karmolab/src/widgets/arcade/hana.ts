/**
 * 화투 그림. 평면(꽃 글자와 색)과 입체(캔버스 질감)가 같은 표를 쓴다 (감사 D1, 2026-09-03)
 *
 * 카드 번호는 달(card >> 2)과 자리(card & 3). 0 번째가 으뜸(광이나 열끗), 1 번째가 띠, 나머지 피
 * 실물의 월별 소재(소나무, 매화, 벚꽃, 등나무, 창포, 모란, 싸리, 억새, 국화, 단풍, 버들, 오동)를
 * 코드 작화. 자리마다 서로 다른 광, 열끗, 띠 표식
 */

/** 달마다 꽃 이름 한 글자. 실물 화투의 열두 달 */
export const FLOWER = ['松', '梅', '桜', '藤', '菖', '牡', '萩', '芒', '菊', '楓', '柳', '桐'];
export const HUE = [
  '#2f7358', '#b3242c', '#d46a8a', '#6b4bbf', '#2a8bb8', '#c0392b',
  '#8a5a1e', '#5b6770', '#c08a1e', '#b8571e', '#2e8f6f', '#6f3fa0'
];
/** 광이 있는 달. 규칙(`games/hanafuda.ts`)과 같은 표 */
const LIGHT_MONTHS = [0, 2, 7, 10, 11];
/** 붉은 띠와 푸른 띠. 나머지 달은 붉은 띠 */
const BLUE_RIBBON = [5, 8, 9];

/** 화투 한 장 앞면. 세로가 가로의 1.4 배 (카드 상자와 같은 비율) */
export function hanaFaceTexture(card: number, w = 256): HTMLCanvasElement {
  const m = (card >> 2) % 12;
  const slot = card & 3;
  const h = Math.round(w * 1.4);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  /* 종이. 검은 테 안에 상아빛 */
  c.fillStyle = '#17120f';
  c.fillRect(0, 0, w, h);
  const pad = w * 0.05;
  c.fillStyle = '#f3ead6';
  c.fillRect(pad, pad, w - pad * 2, h - pad * 2);

  const hue = HUE[m];
  const green = '#3f7a4a';
  const branch = (x0: number, y0: number, x1: number, y1: number, bend = 0): void => {
    c.strokeStyle = m === 10 ? green : '#5a3d22';
    c.lineWidth = w * 0.035;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(w * x0, h * y0);
    c.quadraticCurveTo(w * ((x0 + x1) / 2 + bend), h * ((y0 + y1) / 2), w * x1, h * y1);
    c.stroke();
  };
  const petal = (x: number, y: number, r = 0.07, petals = 5): void => {
    c.fillStyle = hue;
    for (let k = 0; k < petals; k += 1) {
      const a = (Math.PI * 2 * k) / petals;
      c.beginPath();
      c.ellipse(w * (x + Math.cos(a) * r * 0.55), h * (y + Math.sin(a) * r * 0.38), w * r * 0.42, w * r * 0.24, a, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#e2b23c';
    c.beginPath();
    c.arc(w * x, h * y, w * r * 0.18, 0, Math.PI * 2);
    c.fill();
  };
  branch(0.24, 0.92, 0.62, 0.22, m === 3 || m === 10 ? 0.2 : -0.12);
  if (m === 0) {
    c.strokeStyle = green;
    c.lineWidth = w * 0.012;
    for (let k = 0; k < 16; k += 1) {
      const y = 0.28 + (k % 4) * 0.12;
      c.beginPath(); c.moveTo(w * (0.35 + (k % 3) * 0.11), h * y); c.lineTo(w * (0.18 + (k % 5) * 0.13), h * (y - 0.12)); c.stroke();
    }
  } else if (m === 1 || m === 2 || m === 5 || m === 8) {
    const count = m === 5 ? 4 : m === 8 ? 6 : 5;
    for (let k = 0; k < count; k += 1) petal(0.28 + (k % 3) * 0.2, 0.28 + Math.floor(k / 3) * 0.22, m === 5 ? 0.12 : 0.08, m === 8 ? 12 : 5);
  } else if (m === 3) {
    c.fillStyle = hue;
    for (let col = 0; col < 3; col += 1) for (let row = 0; row < 5; row += 1) {
      c.beginPath(); c.ellipse(w * (0.35 + col * 0.16), h * (0.25 + row * 0.09 + col * 0.03), w * 0.045, w * 0.075, 0.25, 0, Math.PI * 2); c.fill();
    }
  } else if (m === 4) {
    c.strokeStyle = green; c.lineWidth = w * 0.028;
    for (let k = 0; k < 5; k += 1) { c.beginPath(); c.moveTo(w * (0.2 + k * 0.13), h * 0.9); c.lineTo(w * (0.3 + k * 0.08), h * 0.25); c.stroke(); }
    petal(0.52, 0.35, 0.13, 3);
  } else if (m === 6) {
    c.fillStyle = green;
    for (let k = 0; k < 10; k += 1) { c.beginPath(); c.ellipse(w * (0.22 + (k % 4) * 0.17), h * (0.3 + Math.floor(k / 4) * 0.18), w * 0.065, w * 0.035, k % 2 ? 0.5 : -0.5, 0, Math.PI * 2); c.fill(); }
    for (let k = 0; k < 7; k += 1) petal(0.28 + (k % 3) * 0.18, 0.25 + Math.floor(k / 3) * 0.16, 0.035, 4);
  } else if (m === 7) {
    c.fillStyle = '#2b2622'; c.beginPath(); c.ellipse(w / 2, h * 0.98, w * 0.62, h * 0.42, 0, Math.PI, Math.PI * 2); c.fill();
    c.strokeStyle = '#b89155'; c.lineWidth = w * 0.018;
    for (let k = 0; k < 9; k += 1) { c.beginPath(); c.moveTo(w * (0.18 + k * 0.08), h * 0.9); c.quadraticCurveTo(w * 0.5, h * 0.5, w * (0.15 + k * 0.09), h * (0.22 + (k % 3) * 0.08)); c.stroke(); }
  } else if (m === 9) {
    c.fillStyle = hue;
    for (let k = 0; k < 7; k += 1) {
      const x = w * (0.24 + (k % 3) * 0.22), y = h * (0.28 + Math.floor(k / 3) * 0.2), r = w * 0.085;
      c.beginPath();
      for (let p = 0; p < 10; p += 1) { const a = -Math.PI / 2 + (Math.PI * 2 * p) / 10; const rr = p % 2 ? r * 0.38 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      c.closePath(); c.fill();
    }
  } else if (m === 10) {
    c.strokeStyle = green; c.lineWidth = w * 0.025;
    for (let k = 0; k < 7; k += 1) { c.beginPath(); c.moveTo(w * (0.22 + k * 0.09), h * 0.18); c.bezierCurveTo(w * (0.18 + k * 0.08), h * 0.42, w * (0.38 + k * 0.04), h * 0.62, w * (0.25 + k * 0.08), h * 0.88); c.stroke(); }
  } else {
    c.fillStyle = hue;
    for (let k = 0; k < 9; k += 1) { c.beginPath(); c.moveTo(w * (0.22 + (k % 3) * 0.2), h * (0.25 + Math.floor(k / 3) * 0.18)); c.lineTo(w * (0.3 + (k % 3) * 0.2), h * (0.34 + Math.floor(k / 3) * 0.18)); c.lineTo(w * (0.38 + (k % 3) * 0.2), h * (0.25 + Math.floor(k / 3) * 0.18)); c.closePath(); c.fill(); }
  }

  /* 자리 표식. 으뜸은 달(광)이나 새(열끗), 둘째는 띠 */
  if (slot === 0 && LIGHT_MONTHS.includes(m)) {
    c.fillStyle = '#e2b23c';
    c.beginPath();
    c.arc(w * 0.62, h * 0.24, w * 0.2, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#b3242c';
    c.lineWidth = w * 0.02;
    c.stroke();
  } else if (slot === 0) {
    c.fillStyle = '#2b2622';
    c.beginPath();
    c.ellipse(w * 0.6, h * 0.62, w * 0.16, w * 0.09, -0.3, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(w * 0.74, h * 0.55, w * 0.06, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#e2b23c';
    c.beginPath();
    c.moveTo(w * 0.79, h * 0.55);
    c.lineTo(w * 0.86, h * 0.565);
    c.lineTo(w * 0.79, h * 0.58);
    c.fill();
  } else if (slot === 1) {
    c.fillStyle = BLUE_RIBBON.includes(m) ? '#2b4c9e' : '#b3242c';
    c.save();
    c.translate(w * 0.5, h * 0.5);
    c.rotate(-0.35);
    c.fillRect(-w * 0.34, -w * 0.075, w * 0.68, w * 0.15);
    c.restore();
  }

  if (slot === 0) {
    const special = ['鶴', '鶯', '幕', '郭', '橋', '蝶', '猪', '月', '杯', '鹿', '雨', '鳳'][m];
    c.fillStyle = '#17120f';
    c.font = `800 ${Math.round(w * 0.13)}px "Noto Serif JP", serif`;
    c.textAlign = 'right';
    c.textBaseline = 'middle';
    c.fillText(special, w - pad * 1.8, h * 0.72);
  }

  /* 글자. 꽃 이름은 크게 위에, 달과 끗은 작게 아래에 */
  c.fillStyle = hue;
  c.font = `700 ${Math.round(w * 0.3)}px "Noto Serif KR", "Noto Serif JP", serif`;
  c.textAlign = 'left';
  c.textBaseline = 'top';
  c.fillText(FLOWER[m], pad * 1.8, pad * 1.6);
  c.fillStyle = '#4a3a2a';
  c.font = `600 ${Math.round(w * 0.11)}px "Noto Sans KR", sans-serif`;
  c.textBaseline = 'bottom';
  c.fillText(String(m + 1), pad * 1.8, h - pad * 1.5);
  c.textAlign = 'right';
  const pt = slot === 0 ? (LIGHT_MONTHS.includes(m) ? 20 : 10) : slot === 1 ? 5 : 1;
  c.fillText(String(pt), w - pad * 1.8, h - pad * 1.5);
  return cv;
}

/** 화투 뒷면. 검붉은 종이에 옅은 무늬 */
export function hanaBackTexture(w = 256): HTMLCanvasElement {
  const h = Math.round(w * 1.4);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  c.fillStyle = '#17120f';
  c.fillRect(0, 0, w, h);
  const pad = w * 0.05;
  c.fillStyle = '#6e1f22';
  c.fillRect(pad, pad, w - pad * 2, h - pad * 2);
  c.strokeStyle = 'rgba(255,220,170,.22)';
  c.lineWidth = w * 0.012;
  for (let y = pad * 2; y < h - pad; y += w * 0.12) {
    c.beginPath();
    c.moveTo(pad * 2, y);
    c.lineTo(w - pad * 2, y);
    c.stroke();
  }
  return cv;
}
