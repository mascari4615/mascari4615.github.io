/**
 * 구면에 그림 입히기 — 픽셀 하나하나를 지구 위 한 점으로 되돌린다 (TASK-KL-206 단위 2)
 *
 * 첫 판은 해안선을 **폴리곤으로** 그렸다. 세 가지가 한꺼번에 걸렸다:
 *   ① 뒤로 넘어간 점을 원 가장자리에 붙이는 꼼수 때문에, 고리가 반대편으로 넘어가는 각도에서
 *      땅이 원판 전체를 덮었다 (「돌리다 보면 초록색만 보인다」).
 *   ② 땅이 한 색이었다. 지구는 사막·숲·얼음이 같이 있는 별인데 초록 하나로 칠하고 있었다.
 *   ③ 구름을 얹을 자리가 없었다 — 구름은 선이 아니라 면이다.
 *
 * 셋 다 **폴리곤이라는 선택**에서 나온 것이라, 그리는 방식을 바꿨다. 화면의 픽셀에서 거꾸로
 * 쏜다: 원 안의 점 (nx, ny) 은 그 지점의 법선이고, nz = √(1-nx²-ny²) 이다. 그걸 카메라 축으로
 * 되돌리면 위경도가 나오고, 그 자리의 그림 색을 그대로 읽어 오면 된다. 자를 것이 없으니
 * ① 은 아예 생길 수 없고, 색은 그림이 정해 주니 ②·③ 이 같이 풀린다.
 *
 * 비용: 한 점마다 asin·atan2 가 한 번씩 든다. 그래서 **화면 해상도로 안 그린다** — 작은 판
 * (기본 320²) 에 그린 뒤 늘여 덮는다. 지구는 부드러운 물체라 늘여도 티가 안 나고, 대신
 * 계산량이 화면 크기와 무관해진다(자취방 노트북에서 팬이 안 돌아야 한다).
 */

/** 등장방형(equirectangular) 그림 한 장 — 왼쪽 위가 (서경 180°, 북위 90°). */
export interface Tex {
  w: number;
  h: number;
  d: Uint8ClampedArray;
}

export interface SurfaceInput {
  /** 맨 지구 (구름 없음) */
  day: Tex | null;
  /** 도시 불빛 */
  night: Tex | null;
  /** 오늘의 구름 — 0~255 한 겹 */
  cloud: { w: number; h: number; a: Uint8ClampedArray } | null;
  /** 카메라 축 (지구 중심 좌표계) */
  ex: [number, number, number];
  ey: [number, number, number];
  ez: [number, number, number];
  /** 태양 방향 (같은 좌표계) */
  sun: [number, number, number];
}

/** 그림을 못 받았을 때 쓰는 맨색 — 「아무것도 안 뜸」보다 「파란 구슬」이 낫다. */
const FALLBACK_SEA: [number, number, number] = [18, 54, 102];

export function paintSurface(img: ImageData, size: number, s: SurfaceInput): void {
  const out = img.data;
  const { ex, ey, ez, sun } = s;
  const day = s.day;
  const night = s.night;
  const cloud = s.cloud;
  const inv = 2 / size;

  let k = 0;
  for (let j = 0; j < size; j++) {
    const ny = 1 - (j + 0.5) * inv;
    for (let i = 0; i < size; i++, k += 4) {
      const nx = (i + 0.5) * inv - 1;
      const r2 = nx * nx + ny * ny;
      if (r2 >= 1) {
        out[k + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(1 - r2);

      // 화면 좌표계의 법선을 지구 좌표계로 되돌린다
      const px = nx * ex[0] + ny * ey[0] + nz * ez[0];
      const py = nx * ex[1] + ny * ey[1] + nz * ez[1];
      const pz = nx * ex[2] + ny * ey[2] + nz * ez[2];

      const lat = Math.asin(pz < -1 ? -1 : pz > 1 ? 1 : pz);
      const lon = Math.atan2(py, px);
      const u = lon / (Math.PI * 2) + 0.5;
      const v = 0.5 - lat / Math.PI;

      let r: number;
      let g: number;
      let b: number;
      if (day) {
        const tx = (u * day.w) | 0;
        const ty = (v * day.h) | 0;
        const t = ((ty < 0 ? 0 : ty >= day.h ? day.h - 1 : ty) * day.w + (tx % day.w)) * 4;
        r = day.d[t];
        g = day.d[t + 1];
        b = day.d[t + 2];
      } else {
        r = FALLBACK_SEA[0];
        g = FALLBACK_SEA[1];
        b = FALLBACK_SEA[2];
      }

      // 구름 — 흰색을 위에 얹는다. 해가 비치는 쪽에서만 보인다(밤 구름은 눈에 안 보인다)
      let cl = 0;
      if (cloud) {
        const cx2 = (u * cloud.w) | 0;
        const cy2 = (v * cloud.h) | 0;
        const ci = (cy2 < 0 ? 0 : cy2 >= cloud.h ? cloud.h - 1 : cy2) * cloud.w + (cx2 % cloud.w);
        cl = cloud.a[ci] / 255;
        if (cl > 0.004) {
          r += (247 - r) * cl;
          g += (250 - g) * cl;
          b += (255 - b) * cl;
        }
      }

      // 밝기 = 법선·태양. 여명 구간을 넓게 둬야 종이 오린 자국이 안 난다
      const lam = px * sun[0] + py * sun[1] + pz * sun[2];
      let dayw = (lam + 0.12) / 0.34;
      dayw = dayw < 0 ? 0 : dayw > 1 ? 1 : dayw;
      dayw = dayw * dayw * (3 - 2 * dayw);

      // 해가 낮게 걸린 띠는 붉게 — 이 한 줄이 「지금 저기가 노을」을 만든다
      const dusk = dayw * (1 - dayw) * 4;
      r += dusk * 46;
      g += dusk * 8;
      b -= dusk * 26;

      // 밤 — 도시 불빛. 구름이 두꺼우면 불빛이 가려진다
      let nr = 4;
      let ng = 6;
      let nb = 14;
      if (night) {
        const tx = (u * night.w) | 0;
        const ty = (v * night.h) | 0;
        const t = ((ty < 0 ? 0 : ty >= night.h ? night.h - 1 : ty) * night.w + (tx % night.w)) * 4;
        const lit = (night.d[t] * 0.6 + night.d[t + 1] * 0.3 + night.d[t + 2] * 0.1) / 255;
        const glow = lit * lit * (1 - cl * 0.75);
        nr += glow * 250;
        ng += glow * 196;
        nb += glow * 110;
      }

      const w = dayw;
      out[k] = r * w + nr * (1 - w);
      out[k + 1] = g * w + ng * (1 - w);
      out[k + 2] = b * w + nb * (1 - w);
      // 가장자리 한 겹은 알파를 눌러 톱니를 없앤다
      const edge = (1 - Math.sqrt(r2)) * size * 0.5;
      out[k + 3] = edge < 1 ? edge * 255 : 255;
    }
  }
}

/**
 * 참색(true color) 사진에서 **구름만** 뽑는다.
 *
 * 구름은 밝고 **색이 없다**. 사하라도 밝지만 노랗다 — 밝기만 보면 사막이 통째로 하얘진다
 * (실제로 첫 시도에서 그랬다). 그래서 밝기와 «무채색인 정도»를 같이 본다.
 */
export function cloudMaskFrom(d: Uint8ClampedArray, w: number, h: number): { w: number; h: number; a: Uint8ClampedArray } {
  const full = new Uint8ClampedArray(w * h);
  for (let i = 0, k = 0; i < full.length; i++, k += 4) {
    const r = d[k];
    const g = d[k + 1];
    const b = d[k + 2];
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (max < 96) continue; // 바다·그늘·빈 자리
    const sat = (max - min) / max;
    // 문턱을 높게 잡는다 — 낮게 잡았더니 옅은 안개까지 잡혀 **대륙이 통째로 하얘졌다**(실측).
    // 우리가 보고 싶은 건 「저기 태풍이 있다」지 「대기 중에 수증기가 있다」가 아니다.
    const bright = (min - 96) / 116;
    const neutral = 1 - sat / 0.18;
    const v = (bright > 1 ? 1 : bright) * (neutral > 1 ? 1 : neutral);
    full[i] = v > 0 ? v * 216 : 0;
  }

  /* 절반으로 줄이며 뭉갠다 — 원본은 jpeg 자국과 관측 띠 때문에 오돌토돌하다. 구름은
     경계가 없는 물건이라, 부드럽게 만드는 쪽이 실제에 더 가깝다(그리고 더 가볍다). */
  const hw = w >> 1;
  const hh = h >> 1;
  const a = new Uint8ClampedArray(hw * hh);
  for (let y = 0; y < hh; y++) {
    const r0 = y * 2 * w;
    const r1 = r0 + w;
    for (let x = 0; x < hw; x++) {
      const c0 = x * 2;
      a[y * hw + x] = (full[r0 + c0] + full[r0 + c0 + 1] + full[r1 + c0] + full[r1 + c0 + 1]) >> 2;
    }
  }
  return { w: hw, h: hh, a };
}
