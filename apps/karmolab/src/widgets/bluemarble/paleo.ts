/**
 * 옛 지구 (TASK-KL-206 · 지질 시대)
 *
 * 위성 사진은 2000년까지다. 그보다 뒤로 가면 사진이 아니라 **재구성**이다 — 판이 어떻게
 * 움직였는지를 되감아 그린 그 시대의 대륙(GPlates, `scripts/gen-paleo.mjs` 로 미리 구움).
 *
 * 그리는 방법에 한 가지 요령이 있다. 대륙을 **폴리곤으로 지구본에 직접 그리지 않는다** —
 * 예전에 그렇게 했다가 뒤로 넘어간 점을 가장자리에 붙이는 꼼수 때문에 땅이 화면을 통째로
 * 덮었다(`surface.ts` 머리말). 대신 폴리곤을 **등장방형 그림 한 장으로 한 번 구워** 두고,
 * 지금 쓰는 표면 샘플러에 그대로 태운다. 그러면 자를 것이 없고, 명암·회전·확대가 전부 공짜다.
 */
import type { Tex } from './surface';

export interface PaleoAge {
  ma: number;
  rings: number[][];
}

const cache = new Map<number, Tex>();

/** 그 시대의 대륙 그림. 한 번 구우면 다시 안 굽는다. */
export async function paleoTex(ma: number, url: string): Promise<Tex | null> {
  const hit = cache.get(ma);
  if (hit) return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as PaleoAge;
    if (!Array.isArray(data.rings)) return null;
    const tex = bake(data.rings);
    if (tex) cache.set(ma, tex);
    return tex;
  } catch (_) {
    return null;
  }
}

const W = 1024;
const H = 512;

/**
 * 대륙을 그림으로 굽는다.
 *
 * 색은 지금 지구를 흉내 내지 않는다 — 그 시대의 식생을 우리는 모른다. 아는 것은 「여기가
 * 물 위였다」뿐이라, 땅은 한 가지 마른 색으로 두고 가장자리만 밝힌다. 아는 만큼만 그린다.
 */
function bake(rings: number[][]): Tex | null {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return null;

  // 바다
  const sea = c.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, '#123a63');
  sea.addColorStop(0.5, '#0f2f57');
  sea.addColorStop(1, '#123a63');
  c.fillStyle = sea;
  c.fillRect(0, 0, W, H);

  c.fillStyle = '#6b6046';
  c.strokeStyle = 'rgba(190,180,150,.5)';
  c.lineWidth = 1;
  for (const ring of rings) {
    c.beginPath();
    for (let i = 0; i < ring.length; i += 2) {
      const x = ((ring[i] + 180) / 360) * W;
      const y = ((90 - ring[i + 1]) / 180) * H;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    c.stroke();
  }

  try {
    const px = c.getImageData(0, 0, W, H);
    return { w: W, h: H, d: px.data };
  } catch (_) {
    return null;
  }
}
