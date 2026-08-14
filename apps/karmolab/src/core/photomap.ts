/**
 * 사진이 찍힌 자리와 때 (TASK-KL-316 / 31)
 *
 * 사진첩에서 「그때 그 여행」을 찾는 가장 빠른 길은 **자리와 때**다. 그 값은 사진 안에 이미 있다
 * (`core/exif`). 여기서는 그걸 **모으고·묶고·그릴 수 있게** 만든다.
 *
 * ⚠ 지도 타일은 **안 불러온다.** 타일을 받으면 「내 사진이 어디서 찍혔는지」를 남의 서버에 알리게 된다.
 * 이 도구가 지키려는 것이 바로 그거라 앞뒤가 안 맞는다. 그래서 **점만 그린다** —
 * 진짜 지도가 필요하면 사람이 눌러서 지도 사이트로 나간다(그 순간은 사람이 고른 것이다).
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'photomap',
  ops: {
    describe: {
      desc: 'Explain what is grouped (places and days) and why no map tiles are fetched.',
      in: {},
      out: 'string'
    }
  }
};

export interface Shot {
  name: string;
  lat: number;
  lon: number;
  /** 밀리초. 없을 수 있다 */
  at?: number;
}

/** 두 자리가 몇 미터 떨어졌나 (하버사인). */
export function metersBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Place {
  lat: number;
  lon: number;
  shots: Shot[];
  /** 이 자리에서 가장 이른·늦은 때 */
  from?: number;
  to?: number;
}

/**
 * 가까운 것끼리 한 자리로 묶는다(기본 300m). 여행에서 한 골목을 여러 장 찍으면
 * 점 스무 개가 아니라 **자리 하나**로 보이는 게 맞다.
 */
export function places(shots: Shot[], meters = 300): Place[] {
  const out: Place[] = [];
  for (const shot of shots) {
    const near = out.find((p) => metersBetween(p.lat, p.lon, shot.lat, shot.lon) <= meters);
    if (near === undefined) {
      out.push({ lat: shot.lat, lon: shot.lon, shots: [shot], from: shot.at, to: shot.at });
      continue;
    }
    near.shots.push(shot);
    /* 자리는 **평균**으로 조금씩 옮긴다 — 첫 장이 어긋나 있어도 여러 장이 바로잡는다. */
    near.lat = near.shots.reduce((sum, s) => sum + s.lat, 0) / near.shots.length;
    near.lon = near.shots.reduce((sum, s) => sum + s.lon, 0) / near.shots.length;
    if (shot.at !== undefined) {
      near.from = near.from === undefined ? shot.at : Math.min(near.from, shot.at);
      near.to = near.to === undefined ? shot.at : Math.max(near.to, shot.at);
    }
  }
  return out.sort((a, b) => b.shots.length - a.shots.length);
}

export interface Day {
  /** `2026-08-14` */
  day: string;
  shots: Shot[];
}

/** 날짜별로 — 때를 모르는 사진은 **버리지 않고** 따로 모은다. */
export function days(shots: Shot[]): { days: Day[]; undated: Shot[] } {
  const map = new Map<string, Shot[]>();
  const undated: Shot[] = [];
  for (const shot of shots) {
    if (shot.at === undefined) {
      undated.push(shot);
      continue;
    }
    const d = new Date(shot.at);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const list = map.get(key) ?? [];
    list.push(shot);
    map.set(key, list);
  }
  return {
    days: [...map.entries()].map(([day, list]) => ({ day, shots: list })).sort((a, b) => (a.day < b.day ? -1 : 1)),
    undated
  };
}

export interface Frame {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export function frameOf(shots: Shot[], pad = 0.15): Frame {
  if (shots.length === 0) throw new Error('자리를 아는 사진이 없습니다');
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const s of shots) {
    minLat = Math.min(minLat, s.lat);
    maxLat = Math.max(maxLat, s.lat);
    minLon = Math.min(minLon, s.lon);
    maxLon = Math.max(maxLon, s.lon);
  }
  /* 한 자리뿐이면 넓이가 0 이라 그릴 수 없다 — 눈에 보이게 조금 벌린다. */
  const spanLat = Math.max(0.002, (maxLat - minLat) * (1 + pad));
  const spanLon = Math.max(0.002, (maxLon - minLon) * (1 + pad));
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  return {
    minLat: midLat - spanLat / 2,
    maxLat: midLat + spanLat / 2,
    minLon: midLon - spanLon / 2,
    maxLon: midLon + spanLon / 2
  };
}

/**
 * 위도·경도를 그림 자리로. **위도에 따라 가로를 줄인다**(메르카토르의 코사인 보정) —
 * 안 그러면 서울 같은 위도에서 동서가 실제보다 넓어 보인다.
 */
export function project(shot: { lat: number; lon: number }, frame: Frame, width: number, height: number): { x: number; y: number } {
  const midLat = (frame.minLat + frame.maxLat) / 2;
  const squeeze = Math.cos((midLat * Math.PI) / 180);
  const lonSpan = (frame.maxLon - frame.minLon) * squeeze;
  const latSpan = frame.maxLat - frame.minLat;
  const x = ((shot.lon - frame.minLon) * squeeze) / lonSpan;
  const y = 1 - (shot.lat - frame.minLat) / latSpan;
  return { x: Math.round(x * width), y: Math.round(y * height) };
}

/** 사람이 눌러서 나갈 지도 주소 — **누르기 전에는 아무 데도 안 알린다.** */
export function mapLink(lat: number, lon: number): string {
  return 'https://www.openstreetmap.org/?mlat=' + lat.toFixed(6) + '&mlon=' + lon.toFixed(6) + '#map=15/' + lat.toFixed(4) + '/' + lon.toFixed(4);
}

export const run: ToolRunner = (op) => {
  if (op !== 'describe') throw new Error('photomap: 모르는 연산 ' + op);
  return [
    'Groups photos by place (within a few hundred metres) and by day, from the EXIF already inside them.',
    'No map tiles are fetched: asking a tile server for your photo locations would defeat the point.',
    'A link opens a real map only when you click it.'
  ].join('\n');
};
