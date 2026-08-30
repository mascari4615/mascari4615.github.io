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
  c.fillStyle = '#aeb08a';
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

/**
 * 장지문. 빛을 **투사하는 무늬**로 씀(SpotLight.map). 종이는 밝고 살은 어두움
 * 다다미에 이 무늬가 떨어지면 처마 밑으로 해가 드는 방이 된다. 살 가장자리는 조금 번져야
 * 그림자. 번지지 않으면 인쇄물
 */
export function shojiTexture(size = 512): HTMLCanvasElement {
  const { cv, c } = make(size);
  const g = c.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, '#fff6e6');
  g.addColorStop(1, '#3a2a18');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  c.strokeStyle = 'rgba(30,20,10,.92)';
  c.lineCap = 'butt';
  const cols = 10;
  const rows = 14;
  c.shadowColor = 'rgba(30,20,10,.9)';
  c.shadowBlur = size * 0.012;
  for (let i = 0; i <= cols; i += 1) {
    c.lineWidth = i === 0 || i === cols ? size * 0.03 : size * 0.014;
    c.beginPath();
    c.moveTo((i / cols) * size, 0);
    c.lineTo((i / cols) * size, size);
    c.stroke();
  }
  for (let j = 0; j <= rows; j += 1) {
    c.lineWidth = j === 0 || j === rows ? size * 0.03 : size * 0.014;
    c.beginPath();
    c.moveTo(0, (j / rows) * size);
    c.lineTo(size, (j / rows) * size);
    c.stroke();
  }
  return cv;
}

/** 툇마루 널. 어둡고 윤이 나는 나무. 결은 가로로 흐른다(널이 가로로 놓이므로) */
export function plankTexture(seed = 29, size = 512): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  c.fillStyle = '#5a3a20';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i += 1) {
    const y = r() * size;
    c.strokeStyle = `rgba(${r() > 0.5 ? '120,84,48' : '28,16,8'},${(0.06 + r() * 0.18).toFixed(3)})`;
    c.lineWidth = 0.6 + r() * 3;
    c.beginPath();
    c.moveTo(0, y);
    c.bezierCurveTo(size * 0.33, y + (r() - 0.5) * 18, size * 0.66, y + (r() - 0.5) * 18, size, y + (r() - 0.5) * 10);
    c.stroke();
  }
  /* 널 사이 틈. 여섯 장 */
  for (let k = 1; k < 6; k += 1) {
    const y = (k / 6) * size;
    c.fillStyle = 'rgba(12,6,2,.85)';
    c.fillRect(0, y - 1.5, size, 3);
    c.fillStyle = 'rgba(160,120,80,.18)';
    c.fillRect(0, y + 1.5, size, 1.5);
  }
  return cv;
}

/**
 * 구름. 빛에 물려 바닥에 **지나가는 구름 그늘**을 만든다(SpotLight.map). 밝은 바탕에 옅은 덩어리 몇.
 * 진하면 얼룩, 옅어야 구름. 등이 천천히 자리를 옮기면 그늘이 흘러감
 */
export function cloudTexture(seed = 41, size = 512): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, size, size);
  /* 덩어리는 크고 적게. 작고 많으면 판 위에서 얼룩으로 보인다(실측) */
  for (let i = 0; i < 5; i += 1) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.24 + r() * 0.3);
    const g = c.createRadialGradient(x, y, 0, x, y, rad);
    /* 옅으면 안 보인다(실측: 22~38% 는 눈에 없었다). 구름 가운데는 절반 넘게 어둡게 */
    g.addColorStop(0, `rgba(90,85,80,${(0.5 + r() * 0.2).toFixed(3)})`);
    g.addColorStop(0.6, 'rgba(90,85,80,0.22)');
    g.addColorStop(1, 'rgba(120,110,100,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(x, y, rad * (0.8 + r() * 0.6), rad * (0.5 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
    c.fill();
  }
  return cv;
}

/** 햇살 줄기. 위는 밝고 아래로 사라지는 띠. 창에서 방으로 드는 빛을 눈에 보이게 */
export function shaftTexture(size = 256): HTMLCanvasElement {
  const { cv, c } = make(size);
  c.clearRect(0, 0, size, size);
  const g = c.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(255,250,240,0.5)');
  g.addColorStop(0.5, 'rgba(255,248,236,0.2)');
  g.addColorStop(1, 'rgba(255,248,236,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  /* 가장자리를 부드럽게. 각진 띠는 유리판이지 빛이 아니다 */
  const side = c.createLinearGradient(0, 0, size, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.25, 'rgba(0,0,0,0)');
  side.addColorStop(0.75, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  c.globalCompositeOperation = 'destination-out';
  c.fillStyle = side;
  c.fillRect(0, 0, size, size);
  return cv;
}

/**
 * 가죽. 주사위 컵과 쟁반 테두리. 잔 주름과 모공.
 * 매끈하게 칠하면 플라스틱 컵이다. 불규칙한 그물 주름이 있어야 손때 묻은 가죽
 */
export function leatherTexture(seed = 47, size = 256): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  c.fillStyle = '#4a2416';
  c.fillRect(0, 0, size, size);
  /* 모공. 어두운 점이 촘촘히 */
  for (let i = 0; i < 9000; i += 1) {
    const x = r() * size;
    const y = r() * size;
    c.fillStyle = `rgba(${r() > 0.6 ? '110,70,45' : '18,8,4'},${(r() * 0.22).toFixed(3)})`;
    c.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  /* 주름. 짧은 굽은 선이 사방으로 */
  for (let i = 0; i < 260; i += 1) {
    const x = r() * size;
    const y = r() * size;
    c.strokeStyle = `rgba(14,6,3,${(0.08 + r() * 0.18).toFixed(3)})`;
    c.lineWidth = 0.5 + r();
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + (r() - 0.5) * 24, y + (r() - 0.5) * 24, x + (r() - 0.5) * 40, y + (r() - 0.5) * 40);
    c.stroke();
  }
  return cv;
}

/**
 * 주사위 한 면. 상아빛 바탕에 검은 눈. 눈 배치는 `die.ts` 와 같다(홀수는 가운데, 6은 두 줄).
 * 가장자리를 살짝 어둡게. 모서리가 둥근 것처럼 보이는 효과(기하는 상자)
 */
export function dieFaceTexture(n: number, size = 128): HTMLCanvasElement {
  const { cv, c } = make(size);
  const g = c.createRadialGradient(size * 0.45, size * 0.4, size * 0.1, size * 0.5, size * 0.5, size * 0.78);
  g.addColorStop(0, '#fbf6ea');
  g.addColorStop(0.8, '#efe6d2');
  g.addColorStop(1, '#cdbfa4');
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  const spots: number[][] = [[], [4], [0, 8], [0, 4, 8], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];
  const on = spots[Math.max(0, Math.min(6, n))] ?? [];
  const pad = size * 0.24;
  const step = (size - pad * 2) / 2;
  for (const s of on) {
    const x = pad + (s % 3) * step;
    const y = pad + Math.floor(s / 3) * step;
    /* 눈은 파인 자리다. 아래쪽에 옅은 빛이 있어야 오목하다 */
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath();
    c.arc(x, y + size * 0.012, size * 0.085, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#17120f';
    c.beginPath();
    c.arc(x, y, size * 0.082, 0, Math.PI * 2);
    c.fill();
  }
  return cv;
}

/** 종이. 상아빛에 섬유 자국. 점수표를 그 위에 그린다 */
export function paperTexture(seed = 53, size = 256): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  c.fillStyle = '#f4ecd8';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i += 1) {
    const x = r() * size;
    const y = r() * size;
    c.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '120,90,50'},${(r() * 0.09).toFixed(3)})`;
    c.fillRect(x, y, 1 + r() * 3, 1);
  }
  return cv;
}

/** 쪽매 마루(헤링본). 서재 바닥. 밝은 참나무 조각이 어긋나게 맞물린다 */
export function parquetTexture(seed = 53, size = 512): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  c.fillStyle = '#b8916a';
  c.fillRect(0, 0, size, size);
  const w = size / 8;
  const h = w * 4;
  for (let row = -4; row < 12; row += 1) {
    for (let col = -2; col < 10; col += 1) {
      const x = col * w * 2;
      const y = row * w;
      const dir = (row + col) % 2 === 0 ? 1 : -1;
      c.save();
      c.translate(x, y);
      c.rotate((dir * Math.PI) / 4);
      const tone = 190 + Math.floor(r() * 40);
      c.fillStyle = `rgb(${tone},${Math.floor(tone * 0.78)},${Math.floor(tone * 0.56)})`;
      c.fillRect(-w / 2, -h / 2, w, h);
      c.strokeStyle = 'rgba(70,40,15,.45)';
      c.lineWidth = 1.2;
      c.strokeRect(-w / 2, -h / 2, w, h);
      /* 결 */
      for (let k = 0; k < 6; k += 1) {
        c.strokeStyle = `rgba(90,55,20,${(0.06 + r() * 0.08).toFixed(3)})`;
        c.beginPath();
        const yy = -h / 2 + r() * h;
        c.moveTo(-w / 2, yy);
        c.lineTo(w / 2, yy + (r() - 0.5) * 6);
        c.stroke();
      }
      c.restore();
    }
  }
  return cv;
}

/** 융단. 깊은 붉은 바탕에 금실 테두리와 잔무늬 */
export function rugTexture(seed = 61, size = 512): HTMLCanvasElement {
  const { cv, c } = make(size);
  const r = rng(seed);
  c.fillStyle = '#6e1f22';
  c.fillRect(0, 0, size, size);
  for (let i = 0; i < 5000; i += 1) {
    c.fillStyle = `rgba(${r() > 0.5 ? '255,220,180' : '20,5,5'},${(r() * 0.07).toFixed(3)})`;
    c.fillRect(r() * size, r() * size, 2, 2);
  }
  const b = size * 0.06;
  c.strokeStyle = '#c9a15a';
  c.lineWidth = size * 0.012;
  c.strokeRect(b, b, size - b * 2, size - b * 2);
  c.lineWidth = size * 0.004;
  c.strokeRect(b * 1.8, b * 1.8, size - b * 3.6, size - b * 3.6);
  /* 안쪽 잔무늬. 마름모 격자 */
  c.strokeStyle = 'rgba(201,161,90,.35)';
  c.lineWidth = 1;
  const g = size / 10;
  for (let x = b * 2; x < size - b * 2; x += g) {
    for (let y = b * 2; y < size - b * 2; y += g) {
      c.beginPath();
      c.moveTo(x + g / 2, y);
      c.lineTo(x + g, y + g / 2);
      c.lineTo(x + g / 2, y + g);
      c.lineTo(x, y + g / 2);
      c.closePath();
      c.stroke();
    }
  }
  return cv;
}
