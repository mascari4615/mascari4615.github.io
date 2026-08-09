/**
 * 지구에 입힐 그림 받아오기 (TASK-KL-206 단위 2)
 *
 * 세 장이다:
 *   day / night = 우리가 담아 둔 것(`data/earth/`). 인터넷 없이도 지구는 뜬다.
 *   cloud       = **오늘의 진짜 구름**. NASA GIBS 가 위성 사진을 한 장으로 이어 붙여 준다.
 *
 * 구름은 「오늘」을 먼저 부른다. 다만 오늘 판은 위성이 아직 지구를 다 돌지 않았으면 **반쪽**이다
 * (아침 UTC 에 받으면 태평양만 있고 나머지는 검다 — 실측). 그래서 얼마나 찼는지 세어 보고,
 * 덜 찼으면 어제 판을 밑에 깔고 오늘 것을 그 위에 얹는다. 결과 = **있는 곳은 오늘, 없는 곳은 어제**.
 * 「최신이지만 절반이 빈 지구」와 「하루 늦었지만 온전한 지구」 중 하나를 고르지 않아도 된다.
 */
import { cloudMaskFrom, type Tex } from './surface';

const SNAPSHOT = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot';
const LAYER = 'VIIRS_NOAA20_CorrectedReflectance_TrueColor';

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 픽셀을 읽어야 하므로 교차 출처 허가를 받고 받아온다 (안 받으면 캔버스가 오염돼 못 읽는다)
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed: ' + url));
    img.src = url;
  });
}

function pixelsOf(img: HTMLImageElement, w: number, h: number): ImageData | null {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true });
  if (!c) return null;
  c.drawImage(img, 0, 0, w, h);
  try {
    return c.getImageData(0, 0, w, h);
  } catch (_) {
    return null; // 오염된 캔버스 — 그림 없이 간다
  }
}

export async function loadTex(url: string, w: number, h: number): Promise<Tex | null> {
  try {
    const img = await loadImage(url);
    const px = pixelsOf(img, w, h);
    return px ? { w, h, d: px.data } : null;
  } catch (_) {
    return null;
  }
}

function ymd(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

function snapshotUrl(day: string, w: number, h: number): string {
  const q = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    LAYERS: LAYER,
    CRS: 'EPSG:4326',
    TIME: day,
    BBOX: '-90,-180,90,180',
    WIDTH: String(w),
    HEIGHT: String(h),
    FORMAT: 'image/jpeg'
  });
  return `${SNAPSHOT}?${q.toString()}`;
}

const CW = 1024;
const CH = 512;

/** 그림이 실제로 몇 퍼센트나 차 있나 (검은 자리 = 아직 안 지나간 곳). */
function coverage(d: Uint8ClampedArray): number {
  let filled = 0;
  let seen = 0;
  for (let k = 0; k < d.length; k += 4 * 29) {
    seen++;
    if (d[k] + d[k + 1] + d[k + 2] > 24) filled++;
  }
  return seen ? filled / seen : 0;
}

export async function loadClouds(): Promise<{ w: number; h: number; a: Uint8ClampedArray } | null> {
  const today = await loadOne(ymd(0));
  if (today && coverage(today.data) > 0.82) return cloudMaskFrom(today.data, CW, CH);

  const yday = await loadOne(ymd(1));
  if (!yday) return today ? cloudMaskFrom(today.data, CW, CH) : null;
  if (!today) return cloudMaskFrom(yday.data, CW, CH);

  // 어제 위에 오늘을 얹는다 — 오늘 그림에서 검지 않은 자리만
  const base = yday.data;
  const fresh = today.data;
  for (let k = 0; k < base.length; k += 4) {
    if (fresh[k] + fresh[k + 1] + fresh[k + 2] <= 24) continue;
    base[k] = fresh[k];
    base[k + 1] = fresh[k + 1];
    base[k + 2] = fresh[k + 2];
  }
  return cloudMaskFrom(base, CW, CH);
}

async function loadOne(day: string): Promise<ImageData | null> {
  try {
    const img = await loadImage(snapshotUrl(day, CW, CH));
    return pixelsOf(img, CW, CH);
  } catch (_) {
    return null;
  }
}
