/**
 * 지역(사는 곳) — **언어와 다른 축** (TASK-KL-203 S10)
 *
 * 언어는 「화면에 무슨 말을 쓰나」, 지역은 「어느 나라 규칙으로 계산하나」다. 둘을 하나로 누르면
 * **한국 사는 영어 사용자**가 평당 가격·자소서 한도·한국 공휴일을 못 본다 — 정작 그게 제일
 * 필요한 사람인데. 반대로 원고지(原稿用紙)·평(坪)은 한국 전용이 아니라 일본에도 있는 것이라
 * 「한국어일 때만」으로 막으면 일본 사람에게서 쓸모를 빼앗는다.
 *
 * 주소에는 **안 넣는다**. 검색엔진에 올라가는 장은 언어별로 하나씩이고(`/en/…`), 지역은 같은
 * 장을 보는 사람마다 다르다 — 주소에 넣으면 같은 글이 나라 수만큼 복제된다. 지역은 브라우저에
 * 저장하는 취향값이고, 지역에 따라 달라지는 부분은 화면이 그릴 때 정한다.
 *
 * 정하는 순서 = **고른 값 > 시간대 > 언어 > 기본**. 시간대를 쓰는 이유: 브라우저는 「어느 나라에
 * 있나」를 안 알려 주지만 시간대는 알려 준다(Asia/Seoul → 한국). 위치 권한을 안 물어도 되고,
 * 여행 중이면 자동으로 그 나라가 된다 — 틀리면 머리띠에서 바꾸면 된다.
 */
import { REGIONS, DEFAULT_REGION, type RegionMeta } from './region-registry';
import { locale } from './i18n';

export { REGIONS, DEFAULT_REGION };
export type { RegionMeta };

const PREF_KEY = 'karmolab_region';

/** 언어만 알 때의 기본 지역. 영어는 어디서나 쓰이므로 나라를 못 찍는다(시간대가 정한다). */
const BY_LOCALE: Record<string, string> = { ko: 'KR', ja: 'JP' };

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}

/** 브라우저가 아는 시간대로 나라를 짚는다. 못 짚으면 `null`. */
function fromTimeZone(): string | null {
  let tz = '';
  try {
    tz = new Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return null;
  }
  if (!tz) return null;
  for (const r of REGIONS) {
    if (r.timeZones.indexOf(tz) >= 0) return r.code;
  }
  return null;
}

let current: string | null = null;

export function region(): string {
  if (current) return current;
  current = safeGet(PREF_KEY) || fromTimeZone() || BY_LOCALE[locale()] || DEFAULT_REGION;
  if (!REGIONS.some((r) => r.code === current)) current = DEFAULT_REGION;
  return current;
}

export function regionMeta(code: string = region()): RegionMeta {
  return REGIONS.find((r) => r.code === code) || REGIONS.find((r) => r.code === DEFAULT_REGION)!;
}

/** 이 사람이 **직접 골랐나**. 안 골랐으면 짐작한 값이라 물어볼 여지가 있다. */
export function hasExplicitRegion(): boolean {
  return !!safeGet(PREF_KEY);
}

/**
 * 지역을 바꾼다. 화면 곳곳(단위·공휴일·서류 규격)이 달라지므로 **다시 그린다** —
 * 지금 열린 도구만 살짝 고치면 안 바뀐 자리가 남아 「반만 바뀐 화면」이 된다.
 */
export function setRegion(code: string): void {
  try {
    localStorage.setItem(PREF_KEY, code);
  } catch {
    /* 저장을 막아 둔 브라우저 — 이번 화면에서만 적용된다. */
  }
  current = REGIONS.some((r) => r.code === code) ? code : DEFAULT_REGION;
  location.reload();
}

/** 「한국 규칙이 필요한가」 같은 물음을 한 줄로. */
export function inRegion(...codes: string[]): boolean {
  return codes.indexOf(region()) >= 0;
}

/** 미터법을 쓰는 곳인가 (아니면 인치·파운드·화씨). */
export function isMetric(): boolean {
  return regionMeta().measure === 'metric';
}
