/**
 * 궤도 계산 — 「오늘 밤 내 머리 위로 언제 지나가나」 (TASK-KL-206 단위 4)
 *
 * ISS 의 **지금 자리**는 받아올 수 있다(wheretheiss.at). 하지만 「4분 뒤 네 머리 위를 지나간다」는
 * 받아올 수 없다 — 그건 계산이다. 그래서 궤도 요소(CelesTrak OMM)를 받아 우리가 굴린다.
 *
 * 완전한 SGP4 를 옮기지 않는다. 그건 대기 저항 모형까지 든 물건이고, 우리가 답하려는 질문은
 * 「오늘 밤 몇 시에 고개를 들면 되나」다 — 몇 초 오차는 아무 의미가 없다. 대신 **케플러 2체 +
 * J2 세속항**(지구가 완전한 구가 아니라 적도가 부푼 탓에 궤도면이 도는 것)까지 넣는다.
 * 이 항을 빼면 하루 만에 지상 궤적이 수백 km 어긋나 「안 지나간다」가 「지나간다」가 된다.
 *
 * 기준일(epoch)에서 며칠씩 멀어지면 오차가 커진다. 요소는 하루 한 번쯤 다시 받으면 된다.
 */

const MU = 398600.4418; // km³/s²
const RE = 6378.137; // km
const J2 = 1.08262668e-3;
const RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;

/** CelesTrak 이 JSON 으로 주는 궤도 요소 (OMM). */
export interface Omm {
  OBJECT_NAME: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number; // rev/day
  ECCENTRICITY: number;
  INCLINATION: number; // deg
  RA_OF_ASC_NODE: number; // deg
  ARG_OF_PERICENTER: number; // deg
  MEAN_ANOMALY: number; // deg
}

export interface Elements {
  name: string;
  id: number;
  epoch: number; // ms
  a: number; // km
  e: number;
  i: number; // rad
  raan0: number;
  argp0: number;
  m0: number;
  n: number; // rad/s
  raanDot: number;
  argpDot: number;
  mDot: number;
}

export function elementsFrom(o: Omm): Elements {
  const n = (o.MEAN_MOTION * TWO_PI) / 86400;
  const a = Math.cbrt(MU / (n * n));
  const e = o.ECCENTRICITY;
  const i = o.INCLINATION * RAD;
  const p = a * (1 - e * e);
  // 적도가 부푼 탓에 궤도면(Ω)과 근지점(ω)이 천천히 돈다
  const f = 1.5 * J2 * ((RE * RE) / (p * p)) * n;
  const si2 = Math.sin(i) * Math.sin(i);
  return {
    name: o.OBJECT_NAME,
    id: o.NORAD_CAT_ID,
    epoch: Date.parse(o.EPOCH.endsWith('Z') ? o.EPOCH : o.EPOCH + 'Z'),
    a,
    e,
    i,
    raan0: o.RA_OF_ASC_NODE * RAD,
    argp0: o.ARG_OF_PERICENTER * RAD,
    m0: o.MEAN_ANOMALY * RAD,
    n,
    raanDot: -f * Math.cos(i),
    argpDot: f * (2 - 2.5 * si2),
    mDot: n + f * Math.sqrt(1 - e * e) * (1 - 1.5 * si2)
  };
}

/** 그리니치 항성시 (rad) — 지구가 얼마나 돌아갔나. */
function gmst(at: number): number {
  const jd = at / 86400000 + 2440587.5;
  const d = jd - 2451545.0;
  let deg = 280.46061837 + 360.98564736629 * d;
  deg %= 360;
  if (deg < 0) deg += 360;
  return deg * RAD;
}

export interface SatFix {
  lat: number;
  lon: number;
  alt: number; // km
  /** 지구 고정 좌표계 위치 (km) */
  ecef: [number, number, number];
}

export function propagate(el: Elements, at: number): SatFix {
  const dt = (at - el.epoch) / 1000;
  const m = el.m0 + el.mDot * dt;
  const raan = el.raan0 + el.raanDot * dt;
  const argp = el.argp0 + el.argpDot * dt;

  // 케플러 방정식 — 뉴턴법 몇 번이면 수렴한다 (이심률이 거의 0이라 더 빠르다)
  let E = m;
  for (let k = 0; k < 8; k++) {
    const d = (E - el.e * Math.sin(E) - m) / (1 - el.e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-10) break;
  }
  const cosE = Math.cos(E);
  const sinE = Math.sin(E);
  const r = el.a * (1 - el.e * cosE);
  const nu = Math.atan2(Math.sqrt(1 - el.e * el.e) * sinE, cosE - el.e);

  // 궤도면 → 관성계
  const u = argp + nu;
  const cu = Math.cos(u);
  const su = Math.sin(u);
  const cr = Math.cos(raan);
  const sr = Math.sin(raan);
  const ci = Math.cos(el.i);
  const si = Math.sin(el.i);
  const x = r * (cr * cu - sr * su * ci);
  const y = r * (sr * cu + cr * su * ci);
  const z = r * (su * si);

  // 관성계 → 지구 고정계 (지구가 돌아간 만큼 되돌린다)
  const th = gmst(at);
  const cth = Math.cos(th);
  const sth = Math.sin(th);
  const ex = x * cth + y * sth;
  const ey = -x * sth + y * cth;

  return {
    lat: Math.asin(z / r) / RAD,
    lon: (((Math.atan2(ey, ex) / RAD + 180) % 360) + 360) % 360 - 180,
    alt: r - RE,
    ecef: [ex, ey, z]
  };
}

/** 관측자의 지구 고정 좌표 (km). */
function observerEcef(lat: number, lon: number): [number, number, number] {
  const c = Math.cos(lat * RAD);
  return [RE * c * Math.cos(lon * RAD), RE * c * Math.sin(lon * RAD), RE * Math.sin(lat * RAD)];
}

/** 관측자 머리 위에서 몇 도나 떠 있나 (도). 음수면 지평선 아래다. */
export function elevation(sat: [number, number, number], lat: number, lon: number): number {
  const o = observerEcef(lat, lon);
  const dx = sat[0] - o[0];
  const dy = sat[1] - o[1];
  const dz = sat[2] - o[2];
  const d = Math.hypot(dx, dy, dz) || 1;
  const up = Math.hypot(o[0], o[1], o[2]) || 1;
  const cosz = (dx * o[0] + dy * o[1] + dz * o[2]) / (d * up);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosz))) / RAD;
}

export interface Pass {
  start: number;
  peak: number;
  end: number;
  maxEl: number;
}

/**
 * 다음 통과. 30초 간격으로 훑어 지평선 위로 올라오는 구간을 찾고, 가장 높이 뜬 순간을 잡는다.
 * 24시간이면 ISS 는 열다섯 바퀴를 돈다 — 못 찾으면 그 위도에서는 안 지나간다는 뜻이다.
 */
export function nextPass(el: Elements, lat: number, lon: number, from = Date.now(), minEl = 12): Pass | null {
  const STEP = 30000;
  let start = 0;
  let peak = 0;
  let maxEl = -90;
  for (let t = from; t < from + 24 * 3600000; t += STEP) {
    const e = elevation(propagate(el, t).ecef, lat, lon);
    if (e > 0) {
      if (!start) {
        start = t;
        maxEl = -90;
      }
      if (e > maxEl) {
        maxEl = e;
        peak = t;
      }
    } else if (start) {
      if (maxEl >= minEl) return { start, peak, end: t, maxEl };
      start = 0;
    }
  }
  return null;
}

/* ── 무리 (17,000개) ───────────────────────────────────────────────────── */

/**
 * 궤도 위의 것 전부를 한 번에 굴린다.
 *
 * 한 개짜리 `propagate()` 를 만 번 부르면 객체가 만 개 생긴다 — 그것만으로 프레임이 튄다.
 * 그래서 결과를 **한 덩어리 배열**(km, 지구고정계)에 바로 쓴다. 케플러 반복도 3번으로 줄인다:
 * 이 목록의 거의 전부가 원에 가까운 궤도(e < 0.01)라 두 번이면 이미 수렴한다.
 */
export function propagateAll(els: Elements[], at: number, out: Float32Array): void {
  const th = gmstPublic(at);
  const cth = Math.cos(th);
  const sth = Math.sin(th);
  for (let k = 0; k < els.length; k++) {
    const el = els[k];
    const dt = (at - el.epoch) / 1000;
    const m = el.m0 + el.mDot * dt;
    let E = m;
    for (let it = 0; it < 3; it++) {
      E -= (E - el.e * Math.sin(E) - m) / (1 - el.e * Math.cos(E));
    }
    const cosE = Math.cos(E);
    const sinE = Math.sin(E);
    const r = el.a * (1 - el.e * cosE);
    const nu = Math.atan2(Math.sqrt(1 - el.e * el.e) * sinE, cosE - el.e);
    const u = el.argp0 + el.argpDot * dt + nu;
    const raan = el.raan0 + el.raanDot * dt;
    const cu = Math.cos(u);
    const su = Math.sin(u);
    const cr = Math.cos(raan);
    const sr = Math.sin(raan);
    const ci = Math.cos(el.i);
    const x = r * (cr * cu - sr * su * ci);
    const y = r * (sr * cu + cr * su * ci);
    const z = r * (su * Math.sin(el.i));
    const i3 = k * 3;
    out[i3] = x * cth + y * sth;
    out[i3 + 1] = -x * sth + y * cth;
    out[i3 + 2] = z;
  }
}

/** 위 함수가 쓰려고 밖으로 뺀 항성시. */
function gmstPublic(at: number): number {
  return gmst(at);
}

export const EARTH_RADIUS_KM = RE;
