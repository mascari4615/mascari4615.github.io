/**
 * 끝까지 확대하기 — 담아 둔 그림이 한계에 닿으면 **진짜 위성 타일**로 갈아탄다 (TASK-KL-206 단위 3)
 *
 * 담아 둔 표면 그림은 가로 2048px 다. 지구 한 바퀴가 2048px 이니 한 픽셀이 20km 쯤 된다 —
 * 지구 전체를 볼 땐 넘치지만, 조금만 당겨도 뭉갠 그림이 된다. 「끝까지 들어가면 우리 집 지붕」이
 * 되려면 5만 배가 더 필요하고, 그건 담아 둘 수 있는 크기가 아니다.
 *
 * 그래서 **보고 있는 곳만** 받아 온다. NASA GIBS 가 위성 사진을 타일로 잘라 두었고
 * (EPSG:4326, 512px, 최대 250m/px), 열쇠도 등록도 필요 없다.
 *
 * 받은 타일은 화면에 바로 그리지 않는다 — 우리 표면은 픽셀마다 위경도를 되짚어 색을 읽으므로,
 * **등장방형 한 장**으로 이어 붙여 두고 거기서 읽는다. 그래야 지구본이 돌아도, 타일 경계가
 * 화면 어디에 걸리든 상관이 없다.
 *
 * 한 번에 받는 타일 수를 묶어 둔다(기본 24장). 확대할수록 타일이 잘게 쪼개지므로 안 막으면
 * 한 번 당길 때 수백 장이 나간다 — 자취방 회선으로.
 */
import type { Region } from './surface';

const HOST = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best';
/** 시간을 되감으면 위성도 되감는다 (`textures.ts` 와 같은 규칙). */
function layerFor(day: string): string {
  return day >= '2018-01-01'
    ? 'VIIRS_NOAA20_CorrectedReflectance_TrueColor'
    : 'MODIS_Terra_CorrectedReflectance_TrueColor';
}
const MATRIX = '250m';
const TILE = 512;

/** 층마다 가로로 몇 장인가 (GIBS 가 스스로 말하는 값 — 2의 거듭제곱이 아니다). */
const COLS = [2, 3, 5, 10, 20, 40, 80, 160, 320];
const MAX_TILES = 12;

/* 조각을 만들 때 쓰는 판은 **하나만 두고 다시 쓴다**. 새로 만들면 2048×1536 짜리 픽셀 묶음이
   매번 새로 생겨 (12MB 씩) 자전 중에 몇 초 만에 수백 MB 가 된다 — 실측으로 화면이 멎었다. */
let scratch: HTMLCanvasElement | null = null;

const span = (z: number): number => 360 / COLS[z];
/** 그 층의 한 픽셀이 몇 도인가. */
export const degPerPx = (z: number): number => span(z) / TILE;

/** 화면 한 픽셀이 몇 도인지에 맞춰 층을 고른다 (더 잘게 받아 봐야 안 보인다). */
export function levelFor(degPerScreenPx: number): number {
  for (let z = COLS.length - 1; z >= 0; z--) {
    if (degPerPx(z) >= degPerScreenPx * 0.75) return z;
  }
  return 0;
}

function ymdUTC(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);
}

function tileUrl(z: number, row: number, col: number, day: string): string {
  return `${HOST}/${layerFor(day)}/default/${day}/${MATRIX}/${z}/${row}/${col}.jpg`;
}

function loadTile(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 아직 안 찍힌 자리 = 그냥 비운다
    img.src = url;
  });
}

export interface BBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

/** 같은 자리를 두 번 받지 않게 하는 이름표. */
export function regionKey(b: BBox, z: number, day: string): string {
  const s = span(z);
  const c0 = Math.floor((b.west + 180) / s);
  const c1 = Math.floor((b.east + 180) / s);
  const r0 = Math.floor((90 - b.north) / s);
  const r1 = Math.floor((90 - b.south) / s);
  return `${day}/${z}/${r0}-${r1}/${c0}-${c1}`;
}

/**
 * 보이는 자리를 덮는 타일을 받아 등장방형 한 장으로 잇는다.
 * 어제 것을 받는다 — 오늘 판은 위성이 아직 안 지나간 곳이 검다(구름 그림에서 겪은 것과 같은 이유).
 */
export async function loadRegion(b: BBox, z: number, dayStr?: string): Promise<Region | null> {
  const s = span(z);
  const day = dayStr || ymdUTC(1);
  const c0 = Math.floor((b.west + 180) / s);
  const c1 = Math.floor((b.east + 180) / s);
  const r0 = Math.max(0, Math.floor((90 - b.north) / s));
  const r1 = Math.min(Math.ceil(180 / s) - 1, Math.floor((90 - b.south) / s));
  const cols = c1 - c0 + 1;
  const rows = r1 - r0 + 1;
  if (cols <= 0 || rows <= 0 || cols * rows > MAX_TILES) return null;

  const cv = scratch || (scratch = document.createElement('canvas'));
  cv.width = cols * TILE;
  cv.height = rows * TILE;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, cv.width, cv.height);

  const jobs: Array<Promise<void>> = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const col = ((c % COLS[z]) + COLS[z]) % COLS[z]; // 날짜변경선을 넘어가도 이어진다
      jobs.push(
        loadTile(tileUrl(z, r, col, day)).then((img) => {
          if (img) ctx.drawImage(img, (c - c0) * TILE, (r - r0) * TILE, TILE, TILE);
        })
      );
    }
  }
  await Promise.all(jobs);

  let px: ImageData;
  try {
    px = ctx.getImageData(0, 0, cv.width, cv.height);
  } catch (_) {
    return null;
  }
  return {
    lon0: -180 + c0 * s,
    lat0: 90 - r0 * s,
    dpp: degPerPx(z),
    w: cv.width,
    h: cv.height,
    d: px.data
  };
}
