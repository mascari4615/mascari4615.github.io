/**
 * 하늘 데이터 중계 — 지금 저 위에 뭐가 떠 있나 (TASK-KL-336 / 흡혈 원장 21)
 *
 * 왜 생겼나 (2026-08-20 실측):
 *   - OpenSky 는 이제 **계정 없이 거의 못 쓴다**(익명 한도 축소). 그래서 원장에서 「계정
 *     하나 필요」로 멈춰 있었다.
 *   - 그런데 `api.adsb.lol` 과 `opendata.adsb.fi` 는 **열쇠 없이 200 을 준다** (서울 상공
 *     100NM 에 48대). 막는 것은 한도가 아니라 **CORS 헤더가 없다**는 것뿐이었다.
 *
 * CORS 가 없다 = 브라우저가 직접 못 붙는다. 그건 `sats`·`launches` 에서 이미 푼 문제다
 * (`karmolab-space-api.ts`) — **여기가 대신 받아 여럿이 나눠 쓴다.** 곳간·다중 원천·
 * 「낡은 값이라도 준다」 규칙은 그 파일 것을 그대로 쓴다. 두 벌 만들지 않는다.
 *
 * ★ 좌표는 **반올림해서** 곳간 열쇠로 쓴다. 안 그러면 사람이 지구본을 조금씩 돌릴 때마다
 * 새 열쇠가 생겨 곳간이 무의미해지고, 바깥 서버는 초당 한 번 넘게 맞는다. 1° ≈ 111km 라
 * 그 안이면 「같은 하늘」로 봐도 된다 — 우리가 그리는 건 항로도가 아니라 지구본 위의 점이다.
 *
 * 붙는 자리: `main.ts` 가 `registerKarmolabApi(app)` **다음에** 부른다 — `/kl` CORS
 * 미들웨어가 거기서 달리고 Express 는 먼저 달린 것부터 태운다.
 */
import type { Application, Request, Response } from 'express';
import { SharedCache, firstOf } from './karmolab-space-api';

/** 화면이 쓰는 최소한. 원본은 필드가 40개가 넘는데 그걸 다 나를 이유가 없다. */
export interface Plane {
  /** 기체 고유 번호(ICAO 24비트). 편명이 없어도 이건 있다. */
  hex: string;
  /** 사람이 읽는 이름 — 편명 → 등록기호 → hex 순으로 있는 것. */
  label: string;
  lat: number;
  lon: number;
  /** 고도(피트). **땅에 서 있으면 `null`** — 0 과 다르다. */
  altFt: number | null;
  /** 땅에 서 있나. `alt_baro: "ground"` 를 숫자로 읽으면 NaN 이 되던 자리다. */
  onGround: boolean;
  /** 진행 방향(도, 0=북). 모르면 null — 0(북)으로 채우면 전부 북쪽을 본다. */
  trackDeg: number | null;
  /** 대지속도(노트). */
  speedKt: number | null;
}

/* ── 받은 것을 한 모양으로 ────────────────────────────────────────────── */

interface RawPlane {
  hex?: string;
  flight?: string;
  r?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  track?: number;
  gs?: number;
}

/** 원천마다 목록 열쇠가 다르다 — adsb.lol 은 `ac`, adsb.fi 는 `aircraft`. */
export function rowsOf(payload: unknown): RawPlane[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as { ac?: unknown; aircraft?: unknown };
  const list = Array.isArray(p.ac) ? p.ac : Array.isArray(p.aircraft) ? p.aircraft : [];
  return list as RawPlane[];
}

/**
 * 한 줄을 우리 모양으로. **못 쓰는 줄은 `null`** 이다.
 *
 * 여기서 갈리는 것 넷 — 전부 오류 없이 조용히 틀리는 종류라 한 곳에 모아 둔다:
 *   ① `alt_baro` 가 문자열 `"ground"` 로 온다. 숫자로 읽으면 NaN 이고, NaN 을 높이로 쓰면
 *      점이 사라지거나 지구 중심에 박힌다. **땅은 땅이라고 들고 있는다.**
 *   ② `flight` 에 꼬리 공백이 붙는다(`"FDX5928 "`). 안 자르면 같은 편이 둘로 보인다.
 *   ③ 편명이 아예 없는 기체가 있다(등록기호만). 버리지 않는다 — 그것도 하늘에 떠 있다.
 *   ④ 좌표가 없는 줄이 섞인다. 0,0 으로 채우면 기니만에 유령 편대가 뜬다. **버린다.**
 */
export function toPlane(raw: RawPlane): Plane | null {
  const lat = raw.lat;
  const lon = raw.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  const hex = String(raw.hex || '').trim();
  const flight = String(raw.flight || '').trim();
  const reg = String(raw.r || '').trim();
  const label = flight || reg || hex;
  if (!label) return null; // 이름도 번호도 없으면 화면에서 가리킬 방법이 없다

  const onGround = raw.alt_baro === 'ground';
  let altFt: number | null = null;
  if (!onGround) {
    const n = typeof raw.alt_baro === 'number' ? raw.alt_baro : typeof raw.alt_geom === 'number' ? raw.alt_geom : NaN;
    altFt = Number.isFinite(n) ? n : null;
  }

  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { hex, label, lat, lon, altFt, onGround, trackDeg: num(raw.track), speedKt: num(raw.gs) };
}

/** 목록 통째로. 못 쓰는 줄은 빠지고, 같은 기체가 두 번 오면 하나만 남는다. */
export function toPlanes(payload: unknown, max = 400): Plane[] {
  const seen = new Set<string>();
  const out: Plane[] = [];
  for (const raw of rowsOf(payload)) {
    const p = toPlane(raw);
    if (!p) continue;
    const key = p.hex || p.label;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= max) break;
  }
  return out;
}

/* ── 좌표를 곳간 열쇠로 ───────────────────────────────────────────────── */

/**
 * 지구본을 조금 돌릴 때마다 새로 묻지 않도록 자리를 **눈금에 맞춘다**.
 *
 * 경도는 −180 과 180 이 같은 자리다 — 그냥 반올림하면 날짜변경선에서 두 열쇠가 생긴다.
 * 위도는 극을 넘지 않으니 자르기만 한다.
 */
export function gridKey(lat: number, lon: number, step = 1): string {
  const snap = (v: number): number => Math.round(v / step) * step;
  const la = Math.max(-90, Math.min(90, snap(lat)));
  let lo = snap(lon);
  if (lo <= -180) lo += 360;
  if (lo > 180) lo -= 360;
  /* `-0` 과 `0` 이 다른 글자가 되면 곳간이 갈린다. 0 을 더해 하나로 만든다. */
  return `${la + 0},${lo + 0}`;
}

/* ── 원천들 ───────────────────────────────────────────────────────────── */

const UA = 'KarmoLab/1.0 (+https://mascari4615.github.io/)';

async function getJson(url: string, ms = 12000): Promise<unknown | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: ac.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** 이 두 곳은 열쇠를 안 받는다 (2026-08-20 실측 · 둘 다 200). 앞이 죽으면 뒤로 간다. */
export async function loadNear(lat: number, lon: number, distNm: number): Promise<Plane[] | null> {
  const d = Math.max(10, Math.min(250, Math.round(distNm)));
  const got = await firstOf<Plane[]>([
    async () => {
      const raw = await getJson(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${d}`);
      const list = toPlanes(raw);
      return list.length ? list : null;
    },
    async () => {
      const raw = await getJson(`https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${d}`);
      const list = toPlanes(raw);
      return list.length ? list : null;
    },
  ]);
  /* **빈 배열과 실패를 가른다.** 태평양 한가운데는 진짜로 0대일 수 있고, 그건 고장이 아니다.
     위에서 `null` 로 온 것만 실패다 — 여기서 `[]` 를 돌려주면 곳간이 「받았다」로 친다. */
  return got;
}

/* ── 라우트 ───────────────────────────────────────────────────────────── */

export function registerAirRoutes(app: Application): void {
  /* 비행기는 **분 단위로 움직인다.** 곳간은 20초 — 그보다 짧게 두면 바깥 서버를 때리고,
     길게 두면 점이 뚝뚝 끊겨 보인다. 못 받으면 5분까지는 낡은 값이라도 준다:
     3분 전 자리라도 「저 하늘에 뭐가 있다」는 맞다. */
  const boxes = new Map<string, SharedCache<Plane[]>>();

  app.get('/kl/air/near', (req: Request, res: Response) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const dist = Number(req.query.dist || 150);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      res.status(400).json({ error: 'bad coords' });
      return;
    }

    const key = gridKey(lat, lon);
    let cache = boxes.get(key);
    if (!cache) {
      /* 눈금에 맞춘 자리로 묻는다 — 사람이 준 좌표 그대로 물으면 곳간 열쇠와 어긋나
         「같은 열쇠인데 다른 곳을 받아 둔」 상태가 된다. */
      const [gLat, gLon] = key.split(',').map(Number);
      cache = new SharedCache<Plane[]>(20 * 1000, 5 * 60 * 1000, () => loadNear(gLat, gLon, dist));
      boxes.set(key, cache);
      /* 지구본을 오래 돌리면 열쇠가 계속 는다. 넉넉히 두되 무한히 두지는 않는다. */
      if (boxes.size > 512) {
        const oldest = boxes.keys().next().value;
        if (oldest !== undefined) boxes.delete(oldest);
      }
    }

    void cache.get().then(({ value, fresh, ageMs }) => {
      res.setHeader('Cache-Control', 'public, max-age=15');
      if (ageMs !== null) res.setHeader('X-KL-Age', String(Math.round(ageMs / 1000)));
      if (!fresh) res.setHeader('X-KL-Stale', '1');
      /* 못 받았으면 빈 목록. 겹 하나가 조용히 비는 게 맞지, 지구본이 멎으면 안 된다. */
      res.json({ planes: value ?? [], at: key });
    });
  });
}
