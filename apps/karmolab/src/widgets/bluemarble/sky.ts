/**
 * 해가 지금 어디 바로 위에 있나 (TASK-KL-206)
 *
 * 낮과 밤의 경계를 그리려면 **태양이 지구의 어느 점 바로 위에 있는지**(subsolar point)만
 * 알면 된다. 그 점을 알면 지구 위 아무 점의 밝기는 두 벡터의 내적 하나로 끝난다.
 *
 * 받아오지 않고 계산한다 — 요청 0, 인터넷이 끊겨도 낮과 밤은 계속 흐른다.
 * 식은 천문연감(Astronomical Almanac)의 저정밀 태양 위치 근사다. 오차는 각도로 1분 미만이고,
 * 지구본 한 화면에서는 1px 도 안 된다.
 */

const RAD = Math.PI / 180;

export interface Sun {
  /** 태양이 바로 위에 있는 지점 */
  lat: number;
  lon: number;
}

export function subsolar(at: Date = new Date()): Sun {
  // J2000.0 이후 경과일 (율리우스일 기준)
  const n = at.getTime() / 86400000 - 10957.5;

  const L = (280.46 + 0.9856474 * n) % 360; // 평균 황경
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD; // 평균 근점이각
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // 황경
  const eps = (23.439 - 0.0000004 * n) * RAD; // 황도 경사

  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) / RAD;

  // 균시차 — 「시계의 정오」와 「해가 남중하는 정오」의 차이(분). 이걸 빼먹으면
  // 경계선이 계절에 따라 최대 16분(경도 4°) 어긋난다.
  let ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / RAD;
  ra = ((ra % 360) + 360) % 360;
  let eot = L - ra;
  if (eot > 180) eot -= 360;
  if (eot < -180) eot += 360;
  eot *= 4; // 도 → 분

  const utcHours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600;
  let lon = -15 * (utcHours + eot / 60 - 12);
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;

  return { lat: dec, lon };
}

/** 위경도를 단위 구면 위 벡터로. z 가 북극이다. */
export function toVec(lat: number, lon: number): [number, number, number] {
  const a = lat * RAD;
  const b = lon * RAD;
  const c = Math.cos(a);
  return [c * Math.cos(b), c * Math.sin(b), Math.sin(a)];
}

/** 두 지점 사이 대원 거리 (km). */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}
