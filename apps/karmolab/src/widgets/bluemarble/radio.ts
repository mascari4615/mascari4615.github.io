/**
 * 사람의 소리 (TASK-KL-241)
 *
 * 지구본은 여태 **이 별의 소리만** 냈다 — 우주는 조용하니 녹음을 트는 척은 안 하고
 * 그 자리에서 합성했다(`sound.ts`). 여기서 하나를 더 연다: **지금 저 도시에서 실제로
 * 나가고 있는 방송**. 합성음이 「이 별이 어떤 곳인가」라면, 이쪽은 「거기 누가 살고 있나」다.
 *
 * 이 조각은 **지구본을 모른다.** 좌표와 방송국만 안다 — 그래서 화면 없이도 검사할 수 있고,
 * 나중에 같은 모양으로 다른 것(비행기 같은)을 얹을 때 본이 된다. 그리는 일은 지구본이 한다.
 *
 * 재료 = radio-browser.info (열쇠 없음 · 비용 없음 · CORS 열림, 2026-08-12 실측).
 * 실측에서 나온 제약 셋이 그대로 이 파일의 규칙이 됐다:
 *   ① 스트림의 21%는 http — 브라우저가 막는다. **받는 자리에서 버린다**(고쳐 쓸 방법이 없다).
 *   ② 한 좌표에 방송국이 최대 182개까지 뭉친다(방송사 그룹·나라 기본 좌표).
 *      → 점 하나에 여럿을 담고, 담는 수에 상한을 둔다(고를 수 없이 긴 목록은 목록이 아니다).
 *   ③ 남태평양 한가운데(Point Nemo) 같은 장난 좌표가 섞인다 — 알려진 자리는 걸러 낸다.
 */

/** 화면이 쓰는 최소한. 원본 응답은 필드가 30개가 넘는데, 저장까지 그걸 들고 갈 이유는 없다. */
export interface Station {
  id: string;
  name: string;
  url: string;
  lat: number;
  lon: number;
  cc: string;
}

/** 한 자리(뭉친 좌표) — 지구본이 고리 하나로 그리는 단위. */
export interface Spot {
  lat: number;
  lon: number;
  stations: Station[];
}

const API_HOSTS = ['de1.api.radio-browser.info', 'nl1.api.radio-browser.info', 'at1.api.radio-browser.info'];
const CACHE_KEY = 'karmolab_radio_v1';
const CACHE_MS = 24 * 60 * 60 * 1000;
/** 한 자리에 담는 상한. 넘치면 인기 많은 쪽부터 — 182개를 훑게 하는 건 고르라는 게 아니다. */
const PER_SPOT_MAX = 24;
/** 좌표를 이만큼 반올림해 같은 자리로 본다. 0.05° ≈ 5km — 한 도시 안이면 같은 자리다. */
const SPOT_GRID = 0.05;
/** 길이 0 짜리 무음 WAV — 소리를 내려는 게 아니라 브라우저의 허락을 받으려고 트는 것. */
const SILENCE =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';

/** 알려진 가짜 좌표 (반지름 1°). 늘어나면 여기 한 줄씩. */
const FAKE_SPOTS: Array<[number, number]> = [
  [-48.876667, -123.393333], // Point Nemo — 가장 가까운 육지가 2,600km
  [0, 0] // Null Island — 좌표를 안 넣었다는 뜻
];

function isFake(lat: number, lon: number): boolean {
  return FAKE_SPOTS.some(([a, b]) => Math.abs(lat - a) < 1 && Math.abs(lon - b) < 1);
}

interface RawStation {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  url?: string;
  geo_lat?: number | null;
  geo_long?: number | null;
  countrycode?: string;
}

/** 원본 → 우리가 쓰는 모양. 걸러지면 null. */
export function slim(r: RawStation): Station | null {
  const url = r.url_resolved || r.url || '';
  // http 스트림은 https 페이지에서 소리가 안 난다. 여기서 버리지 않으면 나중에 「왜 조용하지」가 된다.
  if (!url.startsWith('https:')) return null;
  const lat = typeof r.geo_lat === 'number' ? r.geo_lat : NaN;
  const lon = typeof r.geo_long === 'number' ? r.geo_long : NaN;
  if (!isFinite(lat) || !isFinite(lon) || isFake(lat, lon)) return null;
  const name = (r.name || '').trim().slice(0, 60);
  if (!name || !r.stationuuid) return null;
  return { id: r.stationuuid.slice(0, 8), name, url, lat: +lat.toFixed(3), lon: +lon.toFixed(3), cc: r.countrycode || '' };
}

/* ── 목록 ──────────────────────────────────────────────────────────────── */

function readCache(): Station[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const box = JSON.parse(raw) as { at: number; list: Station[] };
    if (!box || Date.now() - box.at > CACHE_MS || !Array.isArray(box.list)) return null;
    return box.list;
  } catch {
    return null;
  }
}

function writeCache(list: Station[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), list }));
  } catch {
    /* 자리가 없으면 그냥 다음에 다시 받는다 — 목록 때문에 지구본이 멈추면 안 된다. */
  }
}

/**
 * 방송국 목록. 하루에 한 번만 받는다 — 6천 개를 켤 때마다 받으면 그건 지구본이 아니라 내려받기다.
 * 서버가 한 대 죽어도 다음 대로 넘어간다(이 목록은 원래 자원봉사 서버들이다).
 */
export async function loadStations(limit = 6000): Promise<Station[]> {
  const cached = readCache();
  if (cached && cached.length) return cached;

  const path = `/json/stations/search?limit=${limit}&has_geo_info=true&hidebroken=true&order=clickcount&reverse=true`;
  for (const host of API_HOSTS) {
    try {
      const res = await fetch(`https://${host}${path}`, { headers: { Accept: 'application/json' } });
      if (!res.ok) continue;
      const raw = (await res.json()) as RawStation[];
      const list: Station[] = [];
      for (const r of raw) {
        const s = slim(r);
        if (s) list.push(s);
      }
      if (!list.length) continue;
      writeCache(list);
      return list;
    } catch {
      /* 다음 서버 */
    }
  }
  return cached || [];
}

/**
 * 뭉친 좌표를 한 자리로 묶는다. 인기 순으로 들어오므로 **먼저 온 것이 그 자리의 대표**가 된다
 * — 따로 정렬하지 않아도 목록 맨 위가 가장 많이 듣는 방송이다.
 */
export function toSpots(list: Station[]): Spot[] {
  const map = new Map<string, Spot>();
  for (const s of list) {
    const gl = Math.round(s.lat / SPOT_GRID) * SPOT_GRID;
    const go = Math.round(s.lon / SPOT_GRID) * SPOT_GRID;
    const key = gl.toFixed(2) + ',' + go.toFixed(2);
    const spot = map.get(key);
    if (spot) {
      if (spot.stations.length < PER_SPOT_MAX) spot.stations.push(s);
    } else {
      map.set(key, { lat: s.lat, lon: s.lon, stations: [s] });
    }
  }
  return [...map.values()];
}

/** 화면에서 가장 가까운 자리 찾기 — 지구본이 클릭을 받아 이걸 부른다. */
export function nearestSpot(spots: Spot[], lat: number, lon: number, withinDeg: number): Spot | null {
  let best: Spot | null = null;
  let bestD = withinDeg * withinDeg;
  for (const s of spots) {
    const dLat = s.lat - lat;
    let dLon = s.lon - lon;
    while (dLon > 180) dLon -= 360;
    while (dLon < -180) dLon += 360;
    // 고위도에서는 경도 1° 가 짧다 — 안 줄이면 극지방 방송국이 사방 500km 를 먹는다
    const k = Math.cos((lat * Math.PI) / 180);
    const dx = dLon * k;
    const d = dLat * dLat + dx * dx;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/* ── 재생 ──────────────────────────────────────────────────────────────── */

export type RadioState =
  | { kind: 'idle' }
  | { kind: 'tuning'; spot: Spot; station: Station; tried: number }
  | { kind: 'playing'; spot: Spot; station: Station }
  | { kind: 'dead'; spot: Spot };

/**
 * 한 자리를 틀어 준다. **죽은 방송국이 걸려도 손이 안 가는 것**이 이 클래스의 존재 이유다 —
 * 실측 기준 목록의 일부는 이미 꺼진 서버다. 정한 시간 안에 소리가 안 나면 말없이 다음 국으로 넘어간다.
 * (사람이 「안 나오네」를 알아채기 전에 다음이 나오는 게 목표다.)
 */
export class RadioPlayer {
  /**
   * 소리 내는 요소는 **하나를 계속 쓴다.**
   *
   * 방송국마다 새로 만들면, 목록을 받아 온 뒤(=누른 손가락에서 이미 멀어진 뒤) 만들어진 요소는
   * 브라우저가 「제스처 밖의 소리」로 보고 막는다. 켜자마자 한 곳이 울려야 하는 이 기능에서는
   * 그게 곧 **아무 소리도 안 나는 것**이다. 한 번 허락받은 요소는 계속 허락된 채로 남으므로,
   * 누른 그 순간에 만들어 두고 이후에는 `src` 만 갈아 끼운다.
   */
  private audio: HTMLAudioElement | null = null;
  private spot: Spot | null = null;
  private idx = 0;
  private tried = 0;
  private timer: number | null = null;
  private readonly onState: (s: RadioState) => void;
  /** 시간 초과를 얼마로 둘지 — 검사에서 줄여 쓴다. */
  private readonly waitMs: number;
  /** 소리를 만드는 자리. 검사에서는 진짜 `Audio` 대신 가짜를 끼운다. */
  private readonly make: (url: string) => HTMLAudioElement;
  /**
   * 지금 기다리고 있는 주소.
   *
   * 그릇 하나를 계속 쓰면 **지난 시도의 메아리**가 뒤늦게 도착한다 — 앞 주소가 낸 실패가
   * 다음 방송이 막 시작된 뒤에 와서, 멀쩡한 방송을 「죽었다」고 넘겨 버린다(2026-08-12 실측:
   * 이것 때문에 켜자마자 아무 소리도 안 났다). 그래서 알림이 올 때마다 **그게 지금 주소에
   * 대한 것인지** 확인한다.
   */
  private expect = '';

  constructor(onState: (s: RadioState) => void, waitMs = 6000, make?: (url: string) => HTMLAudioElement) {
    this.onState = onState;
    this.waitMs = waitMs;
    this.make =
      make ||
      ((url: string): HTMLAudioElement => {
        const el = new Audio();
        el.preload = 'none';
        el.src = url;
        return el;
      });
  }

  get playing(): boolean {
    return !!this.audio && !this.audio.paused;
  }

  get current(): Station | null {
    return this.spot ? this.spot.stations[this.idx] || null : null;
  }

  get spotNow(): Spot | null {
    return this.spot;
  }

  /**
   * **사용자가 누른 그 순간에** 부른다. 소리 낼 그릇을 미리 만들어 브라우저의 허락을 받아 둔다 —
   * 목록을 받아 오는 사이에 그 허락이 사라지기 때문이다. 아직 틀 방송이 없어도 상관없다.
   */
  unlock(): void {
    if (this.audio) return;
    /* 길이 0 짜리 무음. **빈 주소를 넣으면 안 된다** — 그건 실패로 처리돼 알림이 하나 날아간다. */
    const el = this.make(SILENCE);
    this.audio = el;
    this.bind(el);
    const p = el.play() as unknown as Promise<void> | undefined;
    // 여기서 얻는 것은 소리가 아니라 **허락**이다
    if (p && typeof p.catch === 'function') p.catch(() => undefined);
  }

  /** 자리를 틀어 준다. 같은 자리를 다시 누르면 **그 자리 안에서 다음 방송국**으로 넘어간다. */
  play(spot: Spot): void {
    if (this.spot === spot) {
      this.tried = 0;
      this.hop();
      return;
    }
    this.spot = spot;
    this.idx = 0;
    this.tried = 0;
    this.tune();
  }

  /** 소리가 안 나서 넘어가는 자리. 한 바퀴를 다 돌면 그 자리는 죽은 것으로 본다. */
  next(): void {
    if (!this.spot) return;
    this.tried += 1;
    if (this.tried >= this.spot.stations.length) {
      const dead = this.spot;
      this.silence();
      this.spot = null;
      this.idx = 0;
      this.tried = 0;
      this.onState({ kind: 'dead', spot: dead });
      return;
    }
    this.hop();
  }

  private hop(): void {
    if (!this.spot) return;
    this.idx = (this.idx + 1) % this.spot.stations.length;
    this.tune();
  }

  /** 이벤트는 요소마다 **한 번만** 건다 — 방송국을 옮길 때마다 걸면 같은 알림이 여러 번 온다. */
  private bind(el: HTMLAudioElement): void {
    el.addEventListener('playing', () => {
      const spot = this.spot;
      const station = this.current;
      if (!spot || !station || !this.mine(el)) return;
      this.clearTimer();
      this.tried = 0; // 소리가 났으면 「몇 번 실패했나」는 없던 일이다
      this.onState({ kind: 'playing', spot, station });
    });
    el.addEventListener('error', () => {
      if (this.spot && this.mine(el)) this.next();
    });
    el.addEventListener('stalled', () => {
      if (this.spot && this.mine(el)) this.next();
    });
  }

  /** 이 알림이 **지금 기다리는 주소**에 대한 것인가. 아니면 지난 시도의 메아리다. */
  private mine(el: HTMLAudioElement): boolean {
    const now = el.currentSrc || el.src || '';
    return !this.expect || now === this.expect;
  }

  private tune(): void {
    const spot = this.spot;
    const station = this.current;
    if (!spot || !station) return;
    this.clearTimer();
    this.expect = station.url;

    if (!this.audio) {
      const el = this.make(station.url);
      this.audio = el;
      this.bind(el);
    } else {
      this.audio.src = station.url;
    }
    const el = this.audio;

    this.onState({ kind: 'tuning', spot, station, tried: this.tried });
    // 시간 안에 소리가 안 나면 다음 — `error` 는 서버가 조용히 안 끊으면 영영 안 온다
    this.timer = setTimeout(() => {
      if (!this.audio || this.audio.paused || !this.audio.currentTime) this.next();
    }, this.waitMs) as unknown as number;

    const p = el.play() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === 'function') p.catch(() => this.next());
  }

  stop(): void {
    this.silence();
    if (this.audio) {
      this.audio.remove?.(); // 화면에 붙여 쓰는 경우가 있다 — 떼지 않으면 조용한 요소가 쌓인다
      this.audio = null;
    }
    this.spot = null;
    this.idx = 0;
    this.tried = 0;
    this.onState({ kind: 'idle' });
  }

  /** 소리만 멈춘다 — 그릇(허락받은 요소)은 남긴다. */
  private silence(): void {
    this.clearTimer();
    this.expect = '';
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
