/**
 * 지구가 지금 무슨 일을 겪고 있나 — 바깥에서 받아오는 것들 (TASK-KL-206)
 *
 * 채택 기준 딱 둘: **열쇠(API key)가 필요 없을 것**, **브라우저에서 바로 부를 수 있을 것**
 * (`Access-Control-Allow-Origin`). 이 위젯은 뒷단이 없다 — 정적 페이지 하나가 전부다.
 *
 * 이 기준을 *문서*가 아니라 *응답 헤더*로 확인했다. 실제로 한 곳(pocketworld.org)은
 * 문서에 「CORS 개방」이라 적어 두고도 응답에 그 헤더가 없었다. 그대로 믿고 붙였으면
 * 화면이 빈 채로 배포됐을 것이다. 새 출처를 더할 때도 **재 보고** 더한다.
 *
 * 못 받아오는 것은 **조용히 없는 셈**으로 둔다. 지구본은 계속 돌아야 한다 — 창문 하나가
 * 안 열렸다고 방을 나가지는 않는다.
 */

/** 한 번 받아온 것을 얼마 동안 다시 안 받나 (ms). */
const TTL = {
  quakes: 3 * 60 * 1000,
  aurora: 15 * 60 * 1000,
  kp: 10 * 60 * 1000,
  launches: 60 * 60 * 1000,
  iss: 5 * 1000
};

interface CacheEntry {
  at: number;
  value: unknown;
}
const cache = new Map<string, CacheEntry>();

/**
 * 받아오기 한 겹 — 실패는 `null` 이고 예외를 밖으로 안 던진다.
 * 실패했을 때 **직전에 받아 둔 것을 그대로 쓴다**: 인터넷이 잠깐 끊겼다고 지진이 화면에서
 * 사라지면 「방금 아무 일도 없었던 것」처럼 보인다 — 그게 더 나쁜 거짓말이다.
 */
async function fetchJson<T>(key: string, url: string, ttl: number): Promise<T | null> {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttl) return hit.value as T;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const value = (await res.json()) as T;
    cache.set(key, { at: now, value });
    return value;
  } catch (_) {
    return hit ? (hit.value as T) : null;
  }
}

/* ── 지진 ──────────────────────────────────────────────────────────────── */

export interface Quake {
  id: string;
  mag: number;
  place: string;
  lat: number;
  lon: number;
  depth: number;
  time: number;
}

interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number };
  geometry: { coordinates: [number, number, number] } | null;
}

/**
 * 지난 하루 · 규모 2.5 이상. 「전부」(all_day)는 하루 수천 건이라 화면이 파문으로 덮인다 —
 * 느낌이 「지구가 살아있다」에서 「경보판」으로 바뀐다. 2.5 는 사람이 느끼기 시작하는 언저리다.
 */
export async function quakes(): Promise<Quake[] | null> {
  const data = await fetchJson<{ features: UsgsFeature[] }>(
    'quakes',
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson',
    TTL.quakes
  );
  if (!data?.features) return null;
  return data.features
    .filter((f) => f.geometry && f.properties.mag != null)
    .map((f) => ({
      id: f.id,
      mag: f.properties.mag as number,
      place: f.properties.place || '',
      lon: f.geometry!.coordinates[0],
      lat: f.geometry!.coordinates[1],
      depth: f.geometry!.coordinates[2],
      time: f.properties.time
    }))
    .sort((a, b) => a.time - b.time);
}

/* ── 오로라 ────────────────────────────────────────────────────────────── */

export interface AuroraPoint {
  lat: number;
  lon: number;
  v: number;
}

/**
 * NOAA OVATION — 1° 격자로 「지금부터 30~90분 뒤 오로라가 보일 확률」. 원본이 920KB 라
 * **받자마자 걸러서 버린다**(6만5천 점 → 보통 수백 점). 원본을 들고 있으면 매 프레임
 * 훑게 되고, 그건 자취방 노트북 팬이 도는 이유가 된다.
 */
export async function aurora(): Promise<AuroraPoint[] | null> {
  const data = await fetchJson<{ coordinates: [number, number, number][] }>(
    'aurora',
    'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
    TTL.aurora
  );
  if (!data?.coordinates) return null;
  const out: AuroraPoint[] = [];
  for (const [lon, lat, v] of data.coordinates) {
    if (v < 12) continue; // 12 미만은 눈으로 못 보는 수준이라 점을 찍어도 잡티만 된다
    out.push({ lat, lon: lon > 180 ? lon - 360 : lon, v });
  }
  return out;
}

/* ── 지자기 교란 (Kp) ──────────────────────────────────────────────────── */

/** 0~9. 5 이상이면 자기폭풍이다. 오로라가 위도 낮은 곳까지 내려온다. */
export async function kpIndex(): Promise<number | null> {
  const rows = await fetchJson<string[][]>(
    'kp',
    'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    TTL.kp
  );
  if (!rows || rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const v = Number(last[1]);
  return Number.isFinite(v) ? v : null;
}

/* ── 국제우주정거장 ────────────────────────────────────────────────────── */

export interface IssFix {
  lat: number;
  lon: number;
  alt: number;
  vel: number;
}

export async function iss(): Promise<IssFix | null> {
  const d = await fetchJson<{ latitude: number; longitude: number; altitude: number; velocity: number }>(
    'iss',
    'https://api.wheretheiss.at/v1/satellites/25544',
    TTL.iss
  );
  if (!d || typeof d.latitude !== 'number') return null;
  return { lat: d.latitude, lon: d.longitude, alt: d.altitude, vel: d.velocity };
}

/* ── 로켓 발사 예정 ────────────────────────────────────────────────────── */

export interface Launch {
  name: string;
  provider: string;
  padName: string;
  lat: number;
  lon: number;
  net: number;
}

interface LlLaunch {
  name: string;
  net: string;
  launch_service_provider?: { name?: string };
  pad?: { name?: string; latitude?: number | string; longitude?: number | string };
}

/**
 * TheSpaceDevs — 다음에 사람이 지구 밖으로 뭘 보낼 예정인가.
 * 지구본 위 발사대에 표를 하나 꽂아 두는 용도라 열 건이면 충분하다.
 */
export async function launches(): Promise<Launch[] | null> {
  const d = await fetchJson<{ results: LlLaunch[] }>(
    'launches',
    'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=10&mode=list',
    TTL.launches
  );
  if (!d?.results) return null;
  const out: Launch[] = [];
  for (const r of d.results) {
    const lat = Number(r.pad?.latitude);
    const lon = Number(r.pad?.longitude);
    const net = Date.parse(r.net);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(net)) continue;
    out.push({
      name: r.name,
      provider: r.launch_service_provider?.name || '',
      padName: r.pad?.name || '',
      lat,
      lon,
      net
    });
  }
  return out;
}
