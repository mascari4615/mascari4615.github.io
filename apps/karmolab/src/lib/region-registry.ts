/**
 * ⚠ 자동 생성 — 손으로 고치지 말 것 (TASK-KL-203 S10).
 * 정본은 `data/regions.json` 이고, `node scripts/build-i18n.mjs` 가 여기에 찍는다.
 */
export interface RegionMeta {
  code: string;
  /** 그 나라 사람이 부르는 이름 — 지역 단추에 보여 준다. */
  endonym: string;
  flag: string;
  /** 이 나라로 짚어 주는 시간대들. 브라우저는 나라를 안 알려 주지만 시간대는 알려 준다. */
  timeZones: string[];
  measure: 'metric' | 'us';
  currency: string;
  /** 한 주의 첫 요일 (0=일요일). */
  weekStart: number;
  hour12: boolean;
}

export const DEFAULT_REGION = "KR";

export const REGIONS: RegionMeta[] = [
  {
    "code": "KR",
    "endonym": "대한민국",
    "flag": "🇰🇷",
    "timeZones": [
      "Asia/Seoul"
    ],
    "measure": "metric",
    "currency": "KRW",
    "weekStart": 0,
    "hour12": false
  },
  {
    "code": "JP",
    "endonym": "日本",
    "flag": "🇯🇵",
    "timeZones": [
      "Asia/Tokyo"
    ],
    "measure": "metric",
    "currency": "JPY",
    "weekStart": 0,
    "hour12": false
  },
  {
    "code": "US",
    "endonym": "United States",
    "flag": "🇺🇸",
    "timeZones": [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Anchorage",
      "Pacific/Honolulu",
      "America/Detroit"
    ],
    "measure": "us",
    "currency": "USD",
    "weekStart": 0,
    "hour12": true
  },
  {
    "code": "XX",
    "endonym": "그 밖의 나라",
    "flag": "🌍",
    "timeZones": [],
    "measure": "metric",
    "currency": "USD",
    "weekStart": 1,
    "hour12": false
  }
];
