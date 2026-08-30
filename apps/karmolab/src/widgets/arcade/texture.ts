/**
 * 결과 무늬. **그림 파일 없이 코드로 굽는다** (change.arcade-redesign)
 *
 * 나뭇결, 돌의 얼룩은 사진을 받아 오면 KB 를 먹고, 없으면 표면이 플라스틱처럼 매끈해진다.
 * 캔버스에 한 번 그려 두면 파일 0개에 원하는 크기, 색으로 굽는다. 판이 열릴 때 한 번만 굽고
 * 그 뒤로는 GPU 가 들고 있다.
 *
 * 난수는 **씨앗을 받는다**. 판을 다시 열 때마다 나뭇결이 달라지면 같은 판이 아닌 것처럼 보인다.
 */

/** 작고 빠른 씨앗 난수 (mulberry32). 같은 씨앗이면 같은 무늬. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const make = (size: number): { cv: HTMLCanvasElement; c: CanvasRenderingContext2D } => {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  return { cv, c: cv.getContext('2d') as CanvasRenderingContext2D };
};

/**
 * 나뭇결. 세로로 흐르는 결 + 드문드문한 옹이.
 * 바둑판은 결이 **한 방향**으로 흐른다. 사방으로 뻗으면 대리석이 된다.
 */
export function woodTexture(seed = 7, size = 512): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);

  c.fillStyle = '#dfa763';
  c.fillRect(0, 0, size, size);

  /* 결. 폭이 제각각인 세로 띠를 겹친다. */
  for (let i = 0; i < 220; i += 1) {
    const x = r() * size;
    const w = 0.6 + r() * 3.4;
    const dark = r() * 0.16;
    c.fillStyle = `rgba(120,74,26,${(0.05 + dark).toFixed(3)})`;
    /* 살짝 휘어야 톱으로 켠 결처럼 보인다. 곧게 그으면 줄무늬 벽지다. */
    c.beginPath();
    c.moveTo(x, 0);
    c.bezierCurveTo(x + (r() - 0.5) * 26, size * 0.33, x + (r() - 0.5) * 26, size * 0.66, x + (r() - 0.5) * 14, size);
    c.lineWidth = w;
    c.strokeStyle = c.fillStyle;
    c.stroke();
  }

  /* 옹이. 서너 개면 충분하다. 많으면 판이 지저분해진다. */
  for (let i = 0; i < 3; i += 1) {
    const x = r() * size;
    const y = r() * size;
    const rad = 6 + r() * 12;
    for (let k = 5; k >= 1; k -= 1) {
      c.beginPath();
      c.ellipse(x, y, rad * k * 0.42, rad * k * 0.7, r() * 0.4, 0, Math.PI * 2);
      c.strokeStyle = `rgba(112,68,22,${(0.05 + k * 0.02).toFixed(3)})`;
      c.lineWidth = 1.4;
      c.stroke();
    }
  }

  /* 얼룩. 아주 옅게. 넓은 면이 한 색이면 종이처럼 보인다. */
  for (let i = 0; i < 900; i += 1) {
    const x = r() * size;
    const y = r() * size;
    c.fillStyle = `rgba(${r() > 0.5 ? '255,238,210' : '120,74,26'},${(r() * 0.05).toFixed(3)})`;
    c.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
  }
  return cv;
}

/**
 * 돌 무늬. 조개(흰 돌)의 결과 슬레이트(검은 돌)의 얼룩.
 * 공 하나에 감기므로 **가장자리에서 이어지게** 좌우를 같은 색으로 둔다.
 */
export function stoneTexture(kind: 'black' | 'white', seed = 3, size = 256): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  const base = kind === 'white' ? '#f6f1e6' : '#2a2724';
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);

  if (kind === 'white') {
    /* 조개 결. 한쪽으로 흐르는 아주 옅은 줄. */
    for (let i = 0; i < 90; i += 1) {
      const y = r() * size;
      c.strokeStyle = `rgba(206,190,158,${(0.05 + r() * 0.12).toFixed(3)})`;
      c.lineWidth = 0.6 + r() * 2.2;
      c.beginPath();
      c.moveTo(0, y);
      c.quadraticCurveTo(size / 2, y + (r() - 0.5) * 30, size, y + (r() - 0.5) * 10);
      c.stroke();
    }
  } else {
    /* 슬레이트. 결 대신 미세한 얼룩과 아주 옅은 반짝임. */
    for (let i = 0; i < 1400; i += 1) {
      const x = r() * size;
      const y = r() * size;
      const light = r() > 0.72;
      c.fillStyle = `rgba(${light ? '150,146,140' : '10,9,8'},${(r() * 0.16).toFixed(3)})`;
      c.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
    }
  }
  return cv;
}

/** 펠트. 카드, 당구 천. 아주 잔 알갱이. */
export function feltTexture(seed = 11, size = 256): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  c.fillStyle = '#14624a';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 6000; i += 1) {
    const x = r() * size;
    const y = r() * size;
    c.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${(r() * 0.06).toFixed(3)})`;
    c.fillRect(x, y, 1, 1);
  }
  return cv;
}

/**
 * 다다미. 짚을 촘촘히 엮은 결 + 가장자리 검은 천(헤리).
 *
 * 오목가자 실측: 판 밑이 어두운 나무가 아니라 다다미방이다. 판만 나무면 판이 어디 놓였는지
 * 모르겠고, 바닥까지 나무면 판과 바닥이 한 덩이로 붙어 보인다. 결이 가로로 흐르는 초록빛
 * 짚이 깔려야 판이 **방 안 물건**
 *
 * 한 장에 다다미 반 장을 굽고 `repeat` 로 깐다. 그래서 좌우가 이어져야 한다(x 는 안 흔든다).
 */
export function tatamiTexture(seed = 19, size = 512): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);

  /* 바탕은 올리브빛. 노랗게 두면 판과 한 색이 되어 판이 바닥에 묻힌다(실측) */
  c.fillStyle = '#b3ad7e';
  c.fillRect(0, 0, size, size);

  /* 짚 결. 가로로 흐르는 잔 줄. 굵기와 색이 제각각이라야 돗자리로 보인다 */
  for (let y = 0; y < size; y += 1) {
    const v = r();
    c.fillStyle = `rgba(${v > 0.5 ? '244,236,198' : '120,108,62'},${(0.05 + v * 0.16).toFixed(3)})`;
    c.fillRect(0, y, size, 1);
  }
  /* 세로로 짚을 묶은 실. 일정한 간격이라 눈이 짜임을 읽는다 */
  for (let x = 0; x < size; x += 7) {
    c.fillStyle = `rgba(96,86,48,${(0.05 + r() * 0.05).toFixed(3)})`;
    c.fillRect(x, 0, 1, size);
  }
  /* 헤리(가장자리 천). 위아래에만 둔다. 좌우까지 두르면 한 장이 정사각이 된다 */
  const hem = Math.round(size * 0.045);
  const g = c.createLinearGradient(0, 0, 0, hem);
  g.addColorStop(0, '#2a2620');
  g.addColorStop(1, '#413a2e');
  c.fillStyle = g;
  c.fillRect(0, 0, size, hem);
  c.fillStyle = '#2a2620';
  c.fillRect(0, size - hem, size, hem);
  /* 천의 실 몇 올. 검은 띠가 한 색이면 종이테이프로 보인다 */
  for (let i = 0; i < 400; i += 1) {
    const x = r() * size;
    const top = r() > 0.5;
    c.fillStyle = `rgba(255,240,210,${(r() * 0.09).toFixed(3)})`;
    c.fillRect(x, (top ? 0 : size - hem) + r() * hem, 2 + r() * 3, 1);
  }
  return cv;
}
