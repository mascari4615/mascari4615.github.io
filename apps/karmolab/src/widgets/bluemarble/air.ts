/**
 * 지금 저 하늘 (TASK-KL-336 / 흡혈 원장 21 flightradar24)
 *
 * `radio.ts` 가 거기 누가 살고 있나라면 여기는 **거기 지금 누가 지나가고 있나**다.
 * 그 파일이 스스로 *나중에 같은 모양으로 다른 것(비행기 같은)을 얹을 때 본이 된다*고
 * 적어 두었으니, 그 본을 그대로 따른다.
 *
 * 이 조각은 **지구본을 모른다.** 좌표와 비행기만 안다. 그래서 화면 없이도 검사할 수 있다.
 * 그리는 일은 지구본이 한다.
 *
 * 재료 = `api.adsb.lol` / `opendata.adsb.fi` (열쇠 0, 계정 0, 2026-08-20 실측).
 * 둘 다 **CORS 헤더가 없어** 브라우저가 직접 못 붙는다 → 뒷단이 대신 받는다
 * (`yawnbot/kl/air`, `sats`, `launches` 와 같은 길). 받는 자리에서 이미 한 모양으로 펴 주므로
 * 여기서는 어디를 물을지와 사람에게 어떻게 말할지만 정한다.
 *
 * ★ 이 겹의 유일한 거짓말 위험: **온 하늘이 아니다.** 이 원천들은 자원봉사 수신기 망이라
 * 바다 한가운데, 수신기 없는 나라는 그냥 안 보인다. 비행기가 없다와 우리가 못 본다는
 * 다르므로 화면 문구도 그렇게 적는다.
 */
import { t } from '../../lib/i18n';

const RELAY = 'https://yawnbot.mascari4615.com/kl/air';

/** 뒷단이 펴서 주는 모양 그대로. (`karmo-air-api.ts` 의 `Plane` 과 한 벌이다) */
export interface Plane {
  hex: string;
  label: string;
  lat: number;
  lon: number;
  /** 피트. **땅에 서 있으면 `null`**. 0 과 다르다. */
  altFt: number | null;
  onGround: boolean;
  /** 도(0=북). 모르면 null. 0 으로 채우면 온 하늘이 북쪽을 본다. */
  trackDeg: number | null;
  speedKt: number | null;
}

/** 한 번에 얼마나 넓게 볼까 (해리). 250 이 원천의 상한이다. */
export const LOOK_NM = 200;
/** 이만큼 지나면 다시 묻는다. 비행기는 분 단위로 움직인다. */
export const REFRESH_MS = 20000;

/**
 * 조금 돌릴 때마다 새로 묻지 않도록 자리를 눈금에 맞춘다. 뒷단 곳간 열쇠와 **같은 눈금**이라야
 * 뜻이 있다. 다르면 우리는 새로 묻는데 저쪽은 옛것을 주는 어긋남이 생긴다.
 */
export function sameSky(a: { lat: number; lon: number }, b: { lat: number; lon: number }, step = 1): boolean {
  const snap = (v: number): number => Math.round(v / step) * step;
  if (snap(a.lat) !== snap(b.lat)) return false;
  const d = Math.abs(snap(a.lon) - snap(b.lon));
  /* 360 도를 한 바퀴 돌면 −180 과 180 이 붙는다. 그냥 빼면 날짜변경선에서 갈린다. */
  return Math.min(d, 360 - d) < step / 2 + 1e-9;
}

/** 고도를 사람 말로. 항공에서 쓰는 비행고도(FL)는 100피트 단위다. */
export function heightSay(p: Plane): string {
  if (p.onGround) return t('bluemarble.air.ground', undefined, '땅에');
  if (p.altFt === null) return t('bluemarble.air.unknownAlt', undefined, '고도 모름');
  const km = Math.round((p.altFt * 0.3048) / 100) / 10;
  return t('bluemarble.air.alt', { km: String(km) }, `${km}km`);
}

/** 한 대를 한 줄로. 모르는 값은 **안 적는다**. 0노트로 난다는 거짓말이다. */
export function planeSay(p: Plane): string {
  const bits = [p.label, heightSay(p)];
  if (p.speedKt !== null && !p.onGround) {
    bits.push(t('bluemarble.air.speed', { kmh: String(Math.round(p.speedKt * 1.852)) }, `${Math.round(p.speedKt * 1.852)}km/h`));
  }
  return bits.join(', ');
}

/**
 * 가장 가까운 한 대. 잡이 범위는 **도(°)** 로 받는다. 화면 기준 범위를 도로 바꿔 넘기는 것은
 * 부르는 쪽(지구본)의 일이다. 여기서 화면을 알면 검사할 수 없게 된다.
 */
export function nearestPlane(list: Plane[], lat: number, lon: number, withinDeg: number): Plane | null {
  let best: Plane | null = null;
  let bestD = Infinity;
  for (const p of list) {
    const dLat = p.lat - lat;
    /* 경도 1도는 극으로 갈수록 짧아진다. 안 곱하면 북유럽에서 엉뚱한 기체가 잡힌다. */
    let dLon = p.lon - lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    dLon *= Math.cos((lat * Math.PI) / 180);
    const d = Math.hypot(dLat, dLon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return bestD <= withinDeg ? best : null;
}

/**
 * 저 자리 하늘을 받아 온다. **실패는 `null`, 진짜로 0대는 빈 배열**. 태평양 한가운데는
 * 정말로 0대일 수 있고 그건 고장이 아니다. 둘을 뭉치면 화면이 못 받았다와 없다를
 * 같은 말로 하게 된다.
 */
export async function loadSky(lat: number, lon: number, dist = LOOK_NM): Promise<Plane[] | null> {
  try {
    const url = `${RELAY}/near?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&dist=${Math.round(dist)}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { planes?: unknown };
    return Array.isArray(data.planes) ? (data.planes as Plane[]) : null;
  } catch (_) {
    return null;
  }
}
