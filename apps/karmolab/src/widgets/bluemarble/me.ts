/**
 * 나는 지금 지구 어디에 있나 (TASK-KL-206 단위 4)
 *
 * 이 지구본의 주제는 「자취방에서 고독할 때, 지구는 살아있다」다. 그러려면 **내가 화면 안에
 * 있어야** 한다 — 내 자리가 지금 밤인지, 저 구름이 내 머리 위 구름인지, ISS 가 언제 내 위를
 * 지나가는지.
 *
 * 자리를 어떻게 아나. 순서가 있다:
 *   ① 브라우저 위치 권한 — 정확하지만 **묻는 창이 뜬다**. 켜자마자 창을 띄우지 않는다.
 *      창문 하나 열었을 뿐인데 권한을 요구받는 건 무례하다. 사용자가 단추를 누를 때만 묻는다.
 *   ② 시간대(IANA) — 아무것도 안 물어보고 알 수 있다. `Asia/Seoul` 이면 서울 어딘가다.
 *      도시 하나 정도의 오차는 지구본에서 1px 도 안 되고, ISS 통과 시각도 몇 초 안 바뀐다.
 *   ③ 그것도 없으면 표준시 오프셋으로 경도만 (위도는 0) — 없는 것보다 낫다.
 */

export interface Me {
  lat: number;
  lon: number;
  label: string;
  /** 권한을 받아 얻은 정확한 자리인가 */
  precise: boolean;
}

/**
 * 시간대 → 그 시간대를 대표하는 자리.
 * 전부 적지 않는다 — 사람이 실제로 사는 시간대 위주로, 없으면 오프셋으로 떨어진다.
 */
const TZ: Record<string, [number, number]> = {
  'Asia/Seoul': [37.57, 126.98],
  'Asia/Tokyo': [35.68, 139.69],
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Taipei': [25.03, 121.57],
  'Asia/Singapore': [1.35, 103.82],
  'Asia/Bangkok': [13.76, 100.5],
  'Asia/Jakarta': [-6.21, 106.85],
  'Asia/Manila': [14.6, 120.98],
  'Asia/Kolkata': [19.08, 72.88],
  'Asia/Calcutta': [19.08, 72.88],
  'Asia/Dubai': [25.2, 55.27],
  'Asia/Tehran': [35.69, 51.39],
  'Asia/Jerusalem': [31.78, 35.22],
  'Asia/Istanbul': [41.01, 28.98],
  'Europe/Istanbul': [41.01, 28.98],
  'Europe/Moscow': [55.76, 37.62],
  'Europe/Kyiv': [50.45, 30.52],
  'Europe/Warsaw': [52.23, 21.01],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/Paris': [48.86, 2.35],
  'Europe/London': [51.51, -0.13],
  'Europe/Madrid': [40.42, -3.7],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Stockholm': [59.33, 18.07],
  'Europe/Oslo': [59.91, 10.75],
  'Europe/Helsinki': [60.17, 24.94],
  'Europe/Lisbon': [38.72, -9.14],
  'Atlantic/Reykjavik': [64.15, -21.94],
  'Africa/Cairo': [30.04, 31.24],
  'Africa/Lagos': [6.52, 3.38],
  'Africa/Nairobi': [-1.29, 36.82],
  'Africa/Johannesburg': [-26.2, 28.05],
  'America/New_York': [40.71, -74.01],
  'America/Toronto': [43.65, -79.38],
  'America/Chicago': [41.88, -87.63],
  'America/Denver': [39.74, -104.99],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Vancouver': [49.28, -123.12],
  'America/Mexico_City': [19.43, -99.13],
  'America/Bogota': [4.71, -74.07],
  'America/Lima': [-12.05, -77.04],
  'America/Santiago': [-33.45, -70.67],
  'America/Sao_Paulo': [-23.55, -46.63],
  'America/Argentina/Buenos_Aires': [-34.6, -58.38],
  'Australia/Sydney': [-33.87, 151.21],
  'Australia/Melbourne': [-37.81, 144.96],
  'Australia/Perth': [-31.95, 115.86],
  'Australia/Brisbane': [-27.47, 153.03],
  'Pacific/Auckland': [-36.85, 174.76],
  'Pacific/Honolulu': [21.31, -157.86],
  'America/Anchorage': [61.22, -149.9]
};

/** 시간대 이름의 마지막 토막 = 도시 이름. `Asia/Seoul` → `Seoul`. */
function tzLabel(tz: string): string {
  const last = tz.split('/').pop() || tz;
  return last.replace(/_/g, ' ');
}

export function fromTimezone(): Me | null {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (_) {
    tz = '';
  }
  const hit = TZ[tz];
  if (hit) return { lat: hit[0], lon: hit[1], label: tzLabel(tz), precise: false };

  // 모르는 시간대 — 표준시 차이로 경도만 되짚는다 (한 시간 = 15°)
  const offsetMin = -new Date().getTimezoneOffset();
  if (!Number.isFinite(offsetMin)) return null;
  const lon = Math.max(-180, Math.min(180, (offsetMin / 60) * 15));
  return { lat: 0, lon, label: tz ? tzLabel(tz) : '', precise: false };
}

/** 사용자가 단추를 눌렀을 때만 부른다 — 여기서 브라우저 권한 창이 뜬다. */
export function askPrecise(): Promise<Me | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const base = fromTimezone();
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          label: base?.label || '',
          precise: true
        });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
    );
  });
}
