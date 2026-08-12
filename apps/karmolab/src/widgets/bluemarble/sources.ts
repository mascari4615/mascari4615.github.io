/**
 * 지구가 지금 무슨 일을 겪고 있나 — 바깥에서 받아오는 것들 (TASK-KL-206)
 *
 * 채택 기준 딱 둘: **열쇠(API key)가 필요 없을 것**, **브라우저에서 바로 부를 수 있을 것**
 * (`Access-Control-Allow-Origin`).
 *
 * **예외 둘 (2026-08-12, TASK-KL-241)**: 우주 관련 두 곳은 우리 서버를 거친다.
 * `celestrak.org` 는 자동 접근을 아예 잠갔고(403 — 우리 서버에서 쳐도 마찬가지),
 * `thespacedevs` 는 IP 당 한도라 **화면을 여는 사람마다 각자 부르는 구조 자체**가 한도를
 * 넘긴다(429). 사람이 늘수록 반드시 터지는 모양이었다. 그래서 그 둘만 뒷단이 대신 받아
 * 여럿이 나눠 쓴다 — 한도는 이제 사람 수가 아니라 서버 하나에만 걸린다.
 *
 * 이 기준을 *문서*가 아니라 *응답 헤더*로 확인했다. 실제로 한 곳(pocketworld.org)은
 * 문서에 「CORS 개방」이라 적어 두고도 응답에 그 헤더가 없었다. 그대로 믿고 붙였으면
 * 화면이 빈 채로 배포됐을 것이다. 새 출처를 더할 때도 **재 보고** 더한다.
 *
 * 못 받아오는 것은 **조용히 없는 셈**으로 둔다. 지구본은 계속 돌아야 한다 — 창문 하나가
 * 안 열렸다고 방을 나가지는 않는다.
 */

/** 우주 두 가지만 거쳐 가는 자리. 나머지는 여전히 브라우저가 바로 부른다. */
const RELAY = 'https://yawnbot.mascari4615.com/kl/space';

/** 한 번 받아온 것을 얼마 동안 다시 안 받나 (ms). */
const TTL = {
  quakes: 3 * 60 * 1000,
  aurora: 15 * 60 * 1000,
  kp: 10 * 60 * 1000,
  launches: 60 * 60 * 1000,
  iss: 5 * 1000,
  omm: 6 * 60 * 60 * 1000,
  wind: 10 * 60 * 1000
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
  /* 뒷단 경유 — 여기서 바로 부르면 사람마다 한 번씩이라 곧 429 다(위 § 예외 둘). */
  const d = await fetchJson<{ results: LlLaunch[] }>('launches', `${RELAY}/launches`, TTL.launches);
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

/* ── 궤도 요소 ─────────────────────────────────────────────────────────── */

/**
 * ISS 의 궤도 요소. **지금 자리**가 아니라 **앞으로의 자리**를 계산하기 위한 것이다
 * (`orbit.ts`). 하루쯤 지나도 쓸 만해서 여섯 시간에 한 번이면 충분하다.
 */
export async function issOmm(): Promise<import('./orbit').Omm | null> {
  /* 뒷단 경유 — 원래 자리(CelesTrak)는 자동 접근을 잠갔다(403). 뒷단이 열린 곳에서 받아
     **같은 모양**으로 돌려주므로 이 아래 코드는 그대로다. */
  const rows = await fetchJson<import('./orbit').Omm[]>('omm-iss', `${RELAY}/iss`, TTL.omm);
  return rows && rows.length ? rows[0] : null;
}

/**
 * 그날 하루의 지진 (시간을 되감았을 때). 규모 4.5 이상 — 과거를 볼 땐 「그날 무슨 일이
 * 있었나」가 궁금한 것이지 미세 지진 목록이 궁금한 게 아니다.
 *
 * **큰 것부터** 가져온다(`orderby=magnitude`). 기본값은 최신순이라, 400건 제한에 걸리는 날
 * (2011-03-11 같은 날)에는 **본진이 잘려 나가고 여진만 남는다** — 그날 최대가 규모 6.6 이라고
 * 말하게 된다. 실측으로 그랬다.
 */
export async function quakesOn(day: string): Promise<Quake[] | null> {
  const next = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
  const data = await fetchJson<{ features: UsgsFeature[] }>(
    'quakes-' + day,
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=${day}&endtime=${next}&minmagnitude=4.5&limit=400&orderby=magnitude`,
    24 * 3600 * 1000
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

/* ── 궤도 위의 것 전부 ─────────────────────────────────────────────────── */

const CATALOG_KEY = 'karmolab_bluemarble_catalog_v1';
/** CelesTrak 은 두 시간에 한 번 갱신하고, **그 사이 다시 받으면 403 을 준다**(실측).
 *  그래서 받은 것을 담아 두고 그동안은 안 묻는다 — 예의이기도 하고, 안 그러면 그냥 안 된다. */
const CATALOG_TTL = 2.5 * 3600 * 1000;

interface CachedCatalog {
  at: number;
  rows: Array<[string, number, string, number, number, number, number, number, number]>;
}

/**
 * 활동 중인 물체 전부(1만 개 남짓). 원본 JSON 이 6.9MB 라 **받자마자 줄여서** 담는다
 * (이름 + 요소 8개 = 1MB 남짓). 매번 6.9MB 를 다시 받게 두면 자취방 회선이 그걸로 찬다.
 */
export async function catalog(): Promise<import('./orbit').Omm[] | null> {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (raw) {
      const c = JSON.parse(raw) as CachedCatalog;
      if (Date.now() - c.at < CATALOG_TTL && Array.isArray(c.rows)) return c.rows.map(expand);
    }
  } catch (_) {
    /* 담아 둔 것이 깨졌으면 새로 받는다 */
  }

  /* CelesTrak 은 **두 시간 안에 같은 목록을 또 받으면 403** 을 준다 (실측 — 문서가 아니라
     응답으로 확인했다). 화면마다 각자 부르면 서로를 막는 구조라, 이제 **뒷단이 대신 받아
     나눠 준다**(TASK-KL-241). 무리(active)가 비면 밝은 것들(visual)로 내려가는 것은 그대로 —
     목록마다 셈이 따로다. 만 개가 아니라 백여 개지만, 「머리 위가 비어 있지 않다」는 보인다. */
  const GROUPS = ['active', 'visual'];
  let rows: import('./orbit').Omm[] | null = null;
  for (const g of GROUPS) {
    try {
      const res = await fetch(`${RELAY}/group/${g}`);
      if (!res.ok) continue;
      const got = (await res.json()) as import('./orbit').Omm[];
      if (Array.isArray(got) && got.length) {
        rows = got;
        break;
      }
    } catch (_) {
      /* 다음 목록으로 */
    }
  }

  try {
    if (!rows) return null;
    const small: CachedCatalog['rows'] = rows.map((o) => [
      o.OBJECT_NAME,
      o.NORAD_CAT_ID,
      o.EPOCH,
      o.MEAN_MOTION,
      o.ECCENTRICITY,
      o.INCLINATION,
      o.RA_OF_ASC_NODE,
      o.ARG_OF_PERICENTER,
      o.MEAN_ANOMALY
    ]);
    try {
      localStorage.setItem(CATALOG_KEY, JSON.stringify({ at: Date.now(), rows: small }));
    } catch (_) {
      /* 자리가 모자라면 그냥 이번만 쓰고 만다 */
    }
    return rows;
  } catch (_) {
    return null;
  }
}

function expand(r: CachedCatalog['rows'][number]): import('./orbit').Omm {
  return {
    OBJECT_NAME: r[0],
    NORAD_CAT_ID: r[1],
    EPOCH: r[2],
    MEAN_MOTION: r[3],
    ECCENTRICITY: r[4],
    INCLINATION: r[5],
    RA_OF_ASC_NODE: r[6],
    ARG_OF_PERICENTER: r[7],
    MEAN_ANOMALY: r[8]
  };
}

/* ── 태양 ──────────────────────────────────────────────────────────────── */

/**
 * 지금 부는 태양풍의 속도 (km/s). 재는 자리는 L1 — 지구에서 태양 쪽으로 150만 km 앞이다.
 * 그래서 이 바람이 **여기 닿기까지** 남은 시간을 셀 수 있다. 그게 이 값의 쓸모다.
 */
export async function solarWind(): Promise<{ speed: number; at: number } | null> {
  const rows = await fetchJson<Array<{ proton_speed: number; time_tag: string }>>(
    'wind',
    'https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json',
    TTL.wind
  );
  if (!rows || !rows.length) return null;
  const r = rows[0];
  const speed = Number(r.proton_speed);
  if (!Number.isFinite(speed) || speed <= 0) return null;
  return { speed, at: Date.parse(r.time_tag + (r.time_tag.endsWith('Z') ? '' : 'Z')) };
}

/** L1 에서 지구까지 남은 시간 (분). */
export function windEta(speedKmS: number): number {
  return Math.round(1500000 / speedKmS / 60);
}

/* ── 오늘의 우주 사진 ──────────────────────────────────────────────────── */

export interface Apod {
  title: string;
  url: string;
  hdurl?: string;
  thumbnail_url?: string;
  media_type: string;
  date: string;
  copyright?: string;
}

const APOD_KEY = 'karmolab_bluemarble_apod_v1';

/**
 * NASA 가 매일 한 장씩 고르는 우주 사진.
 *
 * 열쇠 없이 쓰는 `DEMO_KEY` 는 **한 시간에 열 번**이 한도다(응답 헤더로 확인). 화면을 몇 번
 * 열었다 닫으면 금방 닿는다 — 그래서 **날짜별로 담아 두고 하루에 한 번만 묻는다**.
 * 어차피 하루에 한 장 바뀌는 것이라 이게 맞는 주기이기도 하다.
 */
export async function apod(): Promise<Apod | null> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(APOD_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Apod;
      if (c && c.date === today) return c;
    }
  } catch (_) {
    /* 담아 둔 것이 깨졌으면 새로 묻는다 */
  }
  try {
    const res = await fetch('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&thumbs=true');
    if (!res.ok) return null;
    const d = (await res.json()) as Apod;
    if (!d || !d.title) return null;
    try {
      localStorage.setItem(APOD_KEY, JSON.stringify(d));
    } catch (_) {
      /* 자리가 없으면 이번만 쓴다 */
    }
    return d;
  } catch (_) {
    return null;
  }
}
