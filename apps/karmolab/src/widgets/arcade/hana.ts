/**
 * 화투 그림. 평면(꽃 글자와 색)과 입체(캔버스 질감)가 같은 표를 쓴다 (감사 D1, 2026-09-03)
 *
 * 카드 번호는 달(card >> 2)과 자리(card & 3). 0 번째가 으뜸(광이나 열끗), 1 번째가 띠, 나머지 피
 * 그림은 실물을 흉내 낸 약도. 달마다 꽃 글자와 색, 자리마다 표식(달, 새, 띠)
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
  /* 줄기와 잎. 달마다 같은 자리(씨앗은 달 번호)라 같은 달은 같은 풀 */
  const rnd = ((): (() => number) => {
    let x = (m + 1) * 9301 + 49297;
    return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  })();
  c.strokeStyle = m === 10 ? green : '#5a3d22';
  c.lineWidth = w * 0.035;
  c.lineCap = 'round';
  const stems = m === 10 ? 4 : 1;
  for (let k = 0; k < stems; k += 1) {
    c.beginPath();
    const x0 = w * (0.3 + k * 0.14);
    c.moveTo(x0, h * 0.92);
    c.quadraticCurveTo(w * (0.55 + (rnd() - 0.5) * 0.3), h * 0.55, w * (0.45 + (rnd() - 0.5) * 0.4), h * (m === 10 ? 0.3 : 0.35));
    c.stroke();
  }
  if (m === 7) {
    /* 억새. 검은 언덕 */
    c.fillStyle = '#2b2622';
    c.beginPath();
    c.ellipse(w / 2, h * 0.98, w * 0.62, h * 0.42, 0, Math.PI, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = green;
  for (let k = 0; k < 3; k += 1) {
    c.beginPath();
    c.ellipse(w * (0.25 + rnd() * 0.5), h * (0.5 + rnd() * 0.35), w * 0.1, w * 0.045, (rnd() - 0.5) * 1.6, 0, Math.PI * 2);
    c.fill();
  }
  /* 꽃. 그 달의 색으로 다섯 송이 */
  if (m !== 7) {
    c.fillStyle = hue;
    for (let k = 0; k < 5; k += 1) {
      c.beginPath();
      c.arc(w * (0.22 + rnd() * 0.56), h * (0.28 + rnd() * 0.4), w * (0.055 + rnd() * 0.03), 0, Math.PI * 2);
      c.fill();
    }
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
