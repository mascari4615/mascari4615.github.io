/**
 * 영토. 이 자리의 주인은 어느 브랜드인가 (TASK-KL-334)
 *
 * 우리 동네엔 GS25 밖에 없다는 체감을 지도로 만든다. 방법은 하나뿐이다 . 
 * **땅의 한 점을 잡고, 가장 가까운 가게의 브랜드를 물으면 그 점의 주인**이다.
 * 그 점을 촘촘히 깔면 브랜드마다 자기 땅(보로노이 영역)이 생긴다.
 *
 * 여기는 그 계산만 한다. 화면, 타일, 색은 위젯이 정한다. 대신 이 알맹이가 세 가지를 책임진다:
 *
 * ① **상호명 → 브랜드.** 원자료는 CU가락점, 씨유 신촌, 지에스25강남역점처럼 온다.
 *    이걸 못 묶으면 지도가 통째로 틀린다. 이 프로젝트의 정확도는 사실상 여기서 결정된다.
 * ② **가장 가까운 가게.** 점이 5만 개고 화면 픽셀마다 물으므로, 전부 훑으면(5만 × 수십만) 안 끝난다.
 *    격자에 미리 나눠 담고 가까운 칸부터 본다.
 * ③ **면적 점유.** 점포 수 1등과 땅 넓이 1등은 다르다. 원본(ConbiniWars)이 안 센 것이 이것이다.
 *    도심에 100개 몰아넣은 브랜드보다, 시골에 10개 흩뿌린 브랜드가 땅은 더 넓다.
 *
 * 거리는 **평면 근사**로 잰다(위도 1도 ≈ 111km, 경도는 cos φ 만큼 짧다). 한반도 범위에서
 * 대권거리와의 차이는 0.1% 미만이라 순위가 뒤집히지 않는다. 그리고 픽셀마다 삼각함수를
 * 부르지 않아도 된다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'territory',
  ops: {
    brand: {
      desc:
        'Normalize a Korean store name into a brand id (e.g. "CU가락점" -> "cu").' +
        ' industry = convenience | cafe | burger. Returns the brand id, or "?" when unknown.',
      in: { name: 'string', industry: 'string?' },
      out: 'string'
    },
    share: {
      desc:
        'Territory share by brand: which brand owns how much of the land, by nearest-store.' +
        ' points = lines "lat,lng,name". Returns a table of brand, store count, land %.',
      in: { points: 'string', industry: 'string?', steps: 'number?' },
      out: 'string'
    },
    nearest: {
      desc:
        'Who owns this exact spot: the brand of the closest store, and how far it is.' +
        ' points = lines "lat,lng,name".',
      in: { points: 'string', lat: 'number', lng: 'number', industry: 'string?' },
      out: 'string'
    }
  }
};

/* ────────────────────────────── 브랜드 사전 ────────────────────────────── */

export type Industry = 'convenience' | 'cafe' | 'burger';

/** 브랜드 하나. `id` 는 코드가 쓰는 이름, `label` 은 사람에게 보이는 이름. */
export interface Brand {
  id: string;
  label: string;
  /** 지도에서 이 브랜드의 색 */
  color: string;
  /**
   * 상호명에서 이 브랜드를 알아보는 조각들. **공백, 구두점을 뗀 소문자**와 대조한다.
   * 긴 것을 먼저 적는다. 메가엠지씨커피가 메가커피보다 먼저 걸려야 한다.
   */
  match: string[];
}

/**
 * 업종별 브랜드표.
 *
 * 상위 몇 개만 담는다. 꼬리(1인 카페 수만 곳)까지 색을 주면 지도가 모래알이 되고,
 * 애초에 물음이 어느 대기업 땅인가다. 표에 없는 가게는 영토 계산에서 **빠진다** . 
 * 남의 땅으로 세지 않는다(그게 더 큰 거짓말이다).
 */
export const BRANDS: Record<Industry, Brand[]> = {
  convenience: [
    { id: 'cu', label: 'CU', color: '#7b2d8e', match: ['cu편의점', 'cu', '씨유'] },
    { id: 'gs25', label: 'GS25', color: '#00a6e2', match: ['gs25', 'gs 25', '지에스25', 'gs편의점'] },
    { id: 'seven', label: '세븐일레븐', color: '#f37021', match: ['세븐일레븐', '세븐 일레븐', '7eleven', '7-eleven', 'seveneleven', '세븐', 'seven'] },
    { id: 'emart24', label: '이마트24', color: '#ffb600', match: ['이마트24', 'emart24', 'emart 24', '위드미', 'withme'] },
    { id: 'ministop', label: '미니스톱', color: '#0a2f7d', match: ['미니스톱', '미니스탑', 'ministop', 'mini stop'] },
    { id: 'storyway', label: '스토리웨이', color: '#00874f', match: ['스토리웨이', 'storyway'] }
  ],
  cafe: [
    { id: 'starbucks', label: '스타벅스', color: '#00704a', match: ['스타벅스', 'starbucks'] },
    { id: 'mega', label: '메가커피', color: '#f7c600', match: ['메가엠지씨커피', '메가mgc커피', '메가커피', 'megacoffee', 'mega mgc'] },
    { id: 'compose', label: '컴포즈커피', color: '#2b2b2b', match: ['컴포즈커피', '컴포즈', 'composecoffee'] },
    { id: 'ediya', label: '이디야', color: '#1a3a8f', match: ['이디야', 'ediya'] },
    { id: 'twosome', label: '투썸플레이스', color: '#c8102e', match: ['투썸플레이스', '투썸', 'twosome'] },
    { id: 'paik', label: '빽다방', color: '#ffd400', match: ['빽다방', 'paikdabang', "paik's coffee"] },
    { id: 'hollys', label: '할리스', color: '#a4262c', match: ['할리스', 'hollys'] },
    { id: 'coffeebean', label: '커피빈', color: '#4b2e2b', match: ['커피빈', 'coffeebean', 'coffee bean'] },
    { id: 'venti', label: '더벤티', color: '#00a4a6', match: ['더벤티', 'theventi'] },
    { id: 'mammoth', label: '매머드커피', color: '#6b4423', match: ['매머드커피', '매머드익스프레스', 'mammoth'] }
  ],
  burger: [
    { id: 'mcdonalds', label: '맥도날드', color: '#ffc72c', match: ['맥도날드', 'mcdonald', "mcdonald's", '맥날'] },
    { id: 'lotteria', label: '롯데리아', color: '#e60012', match: ['롯데리아', 'lotteria'] },
    { id: 'burgerking', label: '버거킹', color: '#d62300', match: ['버거킹', 'burgerking', 'burger king'] },
    { id: 'momstouch', label: '맘스터치', color: '#f04e23', match: ['맘스터치', "mom's touch", 'momstouch'] },
    { id: 'kfc', label: 'KFC', color: '#a8101a', match: ['kfc', '케이에프씨'] },
    { id: 'nobrand', label: '노브랜드버거', color: '#111111', match: ['노브랜드버거', 'nobrand burger', 'no brand burger'] },
    { id: 'frank', label: '프랭크버거', color: '#0057b8', match: ['프랭크버거', 'frankburger'] },
    { id: 'shake', label: '쉐이크쉑', color: '#84c443', match: ['쉐이크쉑', 'shake shack', 'shakeshack'] }
  ]
};

/** 표에 없는 가게. 색이 없고 영토도 없다. */
export const UNKNOWN = '?';

/**
 * 대조용으로 상호명을 깎는다. 공백, 구두점, 괄호를 떼고 소문자로.
 * (주)비지에프리테일 CU 가락-점 같은 것이 원자료에 그대로 온다.
 */
export function fold(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(주\)|\(유\)|주식회사/g, '')
    .replace(/[\s.,'`, \-_()[\]{}]/g, '');
}

/**
 * 상호명 → 브랜드 id. 못 알아보면 `'?'`.
 *
 * 업종을 알면 그 표만 본다(빠르고, 빽다방 편의점 같은 헛매칭이 없다).
 * 업종을 모르면 세 표를 다 본다. 원자료에 업종 칸이 없을 때가 있다.
 */
export function brandOf(name: string, industry?: Industry): string {
  const folded = fold(name);
  if (folded === '') return UNKNOWN;
  const tables = industry !== undefined ? [BRANDS[industry]] : [BRANDS.convenience, BRANDS.cafe, BRANDS.burger];
  for (const table of tables) {
    for (const b of table) {
      for (const m of b.match) {
        if (folded.includes(fold(m))) return b.id;
      }
    }
  }
  return UNKNOWN;
}

/** 브랜드 id 로 표 항목 찾기 (색, 이름). */
export function brandInfo(id: string, industry: Industry): Brand | undefined {
  return BRANDS[industry].find((b) => b.id === id);
}

/* ────────────────────────────── 점과 격자 ────────────────────────────── */

export interface Store {
  lat: number;
  lng: number;
  /** 브랜드 id (이미 정규화된 것) */
  brand: string;
}

/**
 * 격자 색인.
 *
 * 왜 필요한가: 화면 한 장을 칠하려면 수만~수십만 번 가장 가까운 가게를 묻는다.
 * 물음 한 번에 5만 개를 다 재면 곱셈이 감당이 안 된다. 그래서 위경도를 **칸**으로 나눠
 * 담아 두고, 물음이 오면 그 칸과 이웃 칸만 본다. 대개 수십 개만 재고 끝난다.
 *
 * 칸 크기는 위도 기준 도(degree)다. 0.02도 ≈ 2.2km. 도심에서 한 칸에 수 개가 들어간다.
 */
export interface Grid {
  cell: number;
  minLat: number;
  minLng: number;
  cols: number;
  rows: number;
  /** 칸마다 그 칸에 든 가게들 (없으면 undefined) */
  buckets: Array<Store[] | undefined>;
  /**
   * 칸마다 가게가 든 가장 가까운 칸이 몇 칸 떨어져 있나.
   *
   * ★ 이 한 줄이 이 지도를 쓸 만하게 만든다. 이게 없으면 **바다 한가운데 픽셀**이
   * 고리를 스무 겹 넓히며 수천 칸을 훑고서야 없다고 답한다. 화면의 절반이 바다인
   * 전국 지도에서 그 값이 곧 멎는 시간이 됐다 (2026-08-20: 너무 느려서 쓸 수가 없다).
   * 미리 재 두면 그런 자리는 **한 번 보고 바로 없다**고 답한다.
   *
   * 재는 법 = 두 번 훑는 체스판 거리 변환. 왼위→오아래로 한 번, 반대로 한 번.
   */
  emptyDist: Int32Array;
  stores: Store[];
}

export function buildGrid(stores: Store[], cell = 0.02): Grid {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const s of stores) {
    if (s.lat < minLat) minLat = s.lat;
    if (s.lat > maxLat) maxLat = s.lat;
    if (s.lng < minLng) minLng = s.lng;
    if (s.lng > maxLng) maxLng = s.lng;
  }
  if (stores.length === 0) {
    minLat = 0;
    minLng = 0;
    maxLat = 0;
    maxLng = 0;
  }
  const cols = Math.max(1, Math.ceil((maxLng - minLng) / cell) + 1);
  const rows = Math.max(1, Math.ceil((maxLat - minLat) / cell) + 1);
  const buckets: Array<Store[] | undefined> = new Array(cols * rows);
  const grid: Grid = { cell, minLat, minLng, cols, rows, buckets, emptyDist: new Int32Array(0), stores };
  for (const s of stores) {
    const i = cellIndex(grid, s.lat, s.lng);
    if (i < 0) continue;
    const bucket = buckets[i];
    if (bucket === undefined) buckets[i] = [s];
    else bucket.push(s);
  }
  grid.emptyDist = distanceToStore(buckets, cols, rows);
  return grid;
}

/** 체스판(체비쇼프) 거리 변환. 고리 몇 겹을 넓혀야 가게가 나오는지를 칸마다 미리 적어 둔다. */
function distanceToStore(buckets: Array<Store[] | undefined>, cols: number, rows: number): Int32Array {
  const BIG = cols + rows;
  const d = new Int32Array(cols * rows);
  for (let i = 0; i < d.length; i++) d[i] = buckets[i] === undefined ? BIG : 0;
  /* 왼위 → 오아래 */
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      if (d[i] === 0) continue;
      let best = d[i];
      if (r > 0) {
        if (d[i - cols] + 1 < best) best = d[i - cols] + 1;
        if (c > 0 && d[i - cols - 1] + 1 < best) best = d[i - cols - 1] + 1;
        if (c + 1 < cols && d[i - cols + 1] + 1 < best) best = d[i - cols + 1] + 1;
      }
      if (c > 0 && d[i - 1] + 1 < best) best = d[i - 1] + 1;
      d[i] = best;
    }
  }
  /* 오아래 → 왼위 */
  for (let r = rows - 1; r >= 0; r--) {
    for (let c = cols - 1; c >= 0; c--) {
      const i = r * cols + c;
      if (d[i] === 0) continue;
      let best = d[i];
      if (r + 1 < rows) {
        if (d[i + cols] + 1 < best) best = d[i + cols] + 1;
        if (c > 0 && d[i + cols - 1] + 1 < best) best = d[i + cols - 1] + 1;
        if (c + 1 < cols && d[i + cols + 1] + 1 < best) best = d[i + cols + 1] + 1;
      }
      if (c + 1 < cols && d[i + 1] + 1 < best) best = d[i + 1] + 1;
      d[i] = best;
    }
  }
  return d;
}

function cellIndex(g: Grid, lat: number, lng: number): number {
  const c = Math.floor((lng - g.minLng) / g.cell);
  const r = Math.floor((lat - g.minLat) / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return -1;
  return r * g.cols + c;
}

/** 위도 1도 = 111.32km. 경도 1도는 cos φ 만큼 짧다. 제곱거리 비교에만 쓰므로 단위는 km². */
const KM_PER_DEG = 111.32;

function sqDistKm(aLat: number, aLng: number, bLat: number, bLng: number, cosLat: number): number {
  const dy = (aLat - bLat) * KM_PER_DEG;
  const dx = (aLng - bLng) * KM_PER_DEG * cosLat;
  return dy * dy + dx * dx;
}

/**
 * 이 자리의 주인. 가장 가까운 가게.
 *
 * 자기 칸부터 보고, 없으면 고리를 한 칸씩 넓힌다. **한 번 찾았다고 바로 멈추지 않는다**:
 * 대각선 칸에 더 가까운 가게가 있을 수 있어서, 찾은 거리를 칸으로 환산해 그만큼만 더 본다.
 * (이 한 줄이 없으면 경계선이 칸 모양으로 각지게 나온다. 눈에 바로 보이는 버그다.)
 *
 * `maxKm` 를 넘으면 아무도 주인이 아니다(`null`). 산속까지 편의점 땅으로 칠하지 않기 위한 선이다.
 */
export function nearest(g: Grid, lat: number, lng: number, maxKm = 8): Store | null {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const c0 = Math.floor((lng - g.minLng) / g.cell);
  const r0 = Math.floor((lat - g.minLat) / g.cell);

  /* 격자 밖이거나, 미리 재 둔 가장 가까운 가게 칸이 이미 상한 밖이면 훑지 않고 끝낸다.
     바다, 산이 여기서 걸러진다. 훑을 때와 안 훑을 때가 수천 배 차이다. */
  if (c0 < 0 || r0 < 0 || c0 >= g.cols || r0 >= g.rows) return null;
  const kmPerCell = g.cell * KM_PER_DEG * Math.min(1, cosLat);
  const hops = g.emptyDist[r0 * g.cols + c0];
  if ((hops - 1) * kmPerCell > maxKm) return null;

  let best: Store | null = null;
  let bestSq = maxKm * maxKm;
  const maxRing = Math.max(g.cols, g.rows);

  for (let ring = 0; ring <= maxRing; ring++) {
    /* 더 볼 필요가 없으면 멈춘다. 고리 ring 의 가장 가까운 지점은 (ring-1) 칸 거리 이상 떨어져 있으므로,
       ① 이미 그보다 가까운 것을 찾았거나 ② 그 거리가 `maxKm` 를 넘었으면 끝이다.

       ★ ②가 없으면 **가게가 하나도 없는 자리에서 격자 전체를 훑는다**(바다, 산). 전국 자료는
       고리가 600겹이라 픽셀 하나에 십수만 칸을 보게 되고, 화면 한 장이 몇 분이 된다 . 
       2026-08-20 에 실제로 브라우저가 멎었다. 못 찾으면 일찍 포기한다가 이 줄이다. */
    if (ring > 1) {
      const ringKm = (ring - 1) * g.cell * KM_PER_DEG * Math.min(1, cosLat);
      if (ringKm * ringKm > bestSq) break;
    }
    let touched = false;
    for (let r = r0 - ring; r <= r0 + ring; r++) {
      if (r < 0 || r >= g.rows) continue;
      for (let c = c0 - ring; c <= c0 + ring; c++) {
        /* 고리 = 테두리만. 안쪽은 지난 번에 봤다. */
        if (ring > 0 && r !== r0 - ring && r !== r0 + ring && c !== c0 - ring && c !== c0 + ring) continue;
        if (c < 0 || c >= g.cols) continue;
        touched = true;
        const bucket = g.buckets[r * g.cols + c];
        if (bucket === undefined) continue;
        for (const s of bucket) {
          const d = sqDistKm(lat, lng, s.lat, s.lng, cosLat);
          if (d < bestSq) {
            bestSq = d;
            best = s;
          }
        }
      }
    }
    if (!touched && ring > 0) break;
  }
  return best;
}

/** 가장 가까운 가게까지의 거리(km). 주인이 없으면 `null`. */
export function nearestKm(g: Grid, lat: number, lng: number, maxKm = 8): number | null {
  const s = nearest(g, lat, lng, maxKm);
  if (s === null) return null;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  return Math.sqrt(sqDistKm(lat, lng, s.lat, s.lng, cosLat));
}

/* ────────────────────────────── 영토 면적 ────────────────────────────── */

export interface BBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface ShareRow {
  brand: string;
  /** 이 범위 안 점포 수 */
  stores: number;
  /** 이 브랜드가 먹은 땅 넓이 (km²) */
  areaKm2: number;
  /** 주인 있는 땅 중 이 브랜드의 몫 (0~1) */
  ratio: number;
}

/**
 * 범위 안의 땅을 격자로 훑어 브랜드별 넓이를 센다.
 *
 * 칸 하나의 넓이는 **위도마다 다르다**(위로 갈수록 경도 한 칸이 짧다). 그래서 칸 수를 세지 않고
 * 넓이를 더한다. 안 그러면 북쪽 땅을 과대평가한다.
 *
 * `steps` = 한 변을 몇 칸으로 자를지. 크게 잡을수록 정확하고 느리다(비용은 제곱으로 는다).
 */
export function share(g: Grid, box: BBox, steps = 200, maxKm = 8): ShareRow[] {
  const latStep = (box.maxLat - box.minLat) / steps;
  const lngStep = (box.maxLng - box.minLng) / steps;
  const area = new Map<string, number>();
  const counts = new Map<string, number>();

  for (let i = 0; i < steps; i++) {
    const lat = box.minLat + latStep * (i + 0.5);
    const cellKm2 = latStep * KM_PER_DEG * lngStep * KM_PER_DEG * Math.cos((lat * Math.PI) / 180);
    for (let j = 0; j < steps; j++) {
      const lng = box.minLng + lngStep * (j + 0.5);
      const owner = nearest(g, lat, lng, maxKm);
      if (owner === null) continue;
      area.set(owner.brand, (area.get(owner.brand) ?? 0) + cellKm2);
    }
  }
  for (const s of g.stores) {
    if (s.lat < box.minLat || s.lat > box.maxLat || s.lng < box.minLng || s.lng > box.maxLng) continue;
    counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
  }

  let total = 0;
  for (const v of area.values()) total += v;
  const rows: ShareRow[] = [];
  const ids = new Set([...area.keys(), ...counts.keys()]);
  for (const brand of ids) {
    const areaKm2 = area.get(brand) ?? 0;
    rows.push({
      brand,
      stores: counts.get(brand) ?? 0,
      areaKm2,
      ratio: total > 0 ? areaKm2 / total : 0
    });
  }
  rows.sort((a, b) => b.areaKm2 - a.areaKm2);
  return rows;
}

/* ────────────────────────────── 원자료 읽기 ────────────────────────────── */

/**
 * `위도,경도,상호명` 줄들을 읽는다. 상호명은 브랜드로 바꿔 담는다.
 * 브랜드를 못 알아본 줄은 **버린다**. 색 없는 점이 영토를 먹으면 지도가 거짓말을 한다.
 */
export function parsePoints(text: string, industry?: Industry): Store[] {
  const out: Store[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const parts = line.split(',');
    if (parts.length < 2) continue;
    const lat = Number(parts[0]);
    const lng = Number(parts[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const name = parts.slice(2).join(',').trim();
    const brand = name === '' ? UNKNOWN : brandOf(name, industry);
    if (brand === UNKNOWN) continue;
    out.push({ lat, lng, brand });
  }
  return out;
}

function asIndustry(v: unknown): Industry | undefined {
  const s = String(v ?? '').trim();
  return s === 'convenience' || s === 'cafe' || s === 'burger' ? s : undefined;
}

function bboxOf(stores: Store[]): BBox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const s of stores) {
    if (s.lat < minLat) minLat = s.lat;
    if (s.lat > maxLat) maxLat = s.lat;
    if (s.lng < minLng) minLng = s.lng;
    if (s.lng > maxLng) maxLng = s.lng;
  }
  return { minLat, minLng, maxLat, maxLng };
}

export const run: ToolRunner = (op, args) => {
  const industry = asIndustry(args.industry);

  if (op === 'brand') {
    const name = String(args.name ?? '').trim();
    if (name === '') throw new Error('territory: 상호명이 비었습니다');
    return brandOf(name, industry);
  }

  if (op === 'nearest') {
    const stores = parsePoints(String(args.points ?? ''), industry);
    if (stores.length === 0) throw new Error('territory: 읽을 수 있는 점이 없습니다');
    const lat = Number(args.lat);
    const lng = Number(args.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('territory: 위경도가 필요합니다');
    const g = buildGrid(stores);
    const owner = nearest(g, lat, lng);
    if (owner === null) return 'none';
    const km = nearestKm(g, lat, lng) ?? 0;
    return owner.brand + '  ' + km.toFixed(2) + 'km';
  }

  if (op === 'share') {
    const stores = parsePoints(String(args.points ?? ''), industry);
    if (stores.length === 0) throw new Error('territory: 읽을 수 있는 점이 없습니다');
    const steps = Math.min(500, Math.max(20, Math.round(Number(args.steps ?? 200))));
    const g = buildGrid(stores);
    const rows = share(g, bboxOf(stores), steps);
    return rows
      .map((r) => r.brand + '\t' + r.stores + '\t' + r.areaKm2.toFixed(1) + 'km2\t' + (r.ratio * 100).toFixed(1) + '%')
      .join('\n');
  }

  throw new Error('territory: 모르는 연산 ' + op);
};
