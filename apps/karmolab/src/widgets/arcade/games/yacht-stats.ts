/**
 * 주사위 요트 내 기록. 이 브라우저에만 (change.arcade-redesign, 사용자 선택 "기록과 통계")
 *
 * 레퍼런스(bloob.io)는 등급과 경험치를 계정에 쌓는다. 계정은 온라인 Change 몫이라 여기서는 브라우저 기록만.
 * 보존 계약(`features/play.md`)을 따른다. 최고 1줄 + 날짜별 최고 30일 + 최근 판 200. 판 전체 축적 금지
 */
const KEY = 'karmolab.arcade.yacht.stats';

export interface YachtStats {
  games: number;
  best: number;
  /** 합계의 합. 평균은 total / games */
  total: number;
  yachts: number;
  bonuses: number;
  /** 최근 판. 오래된 것부터 버린다 */
  recent: Array<{ at: number; score: number }>;
  /** KST 날짜별 최고. 30일 */
  daily: Record<string, number>;
}

const empty = (): YachtStats => ({ games: 0, best: 0, total: 0, yachts: 0, bonuses: 0, recent: [], daily: {} });

export function readYachtStats(): YachtStats {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<YachtStats> | null;
    if (!raw || typeof raw !== 'object') return empty();
    return { ...empty(), ...raw, recent: Array.isArray(raw.recent) ? raw.recent : [], daily: raw.daily && typeof raw.daily === 'object' ? raw.daily : {} };
  } catch {
    return empty();
  }
}

const kstDay = (at: number): string => new Date(at + 9 * 3600 * 1000).toISOString().slice(0, 10);

/** 한 판 끝. 새 최고면 true */
export function noteYachtGame(score: number, yacht: boolean, bonus: boolean, at = Date.now()): { stats: YachtStats; newBest: boolean } {
  const s = readYachtStats();
  const newBest = score > s.best && s.games > 0;
  s.games += 1;
  s.total += score;
  if (score > s.best) s.best = score;
  if (yacht) s.yachts += 1;
  if (bonus) s.bonuses += 1;
  s.recent.push({ at, score });
  if (s.recent.length > 200) s.recent.splice(0, s.recent.length - 200);
  const day = kstDay(at);
  s.daily[day] = Math.max(s.daily[day] ?? 0, score);
  const keep = Object.keys(s.daily).sort().slice(-30);
  s.daily = Object.fromEntries(keep.map((k) => [k, s.daily[k]]));
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 자리가 모자라면 기록은 포기. 판은 그대로 */
  }
  return { stats: s, newBest };
}

export const avgOf = (s: YachtStats): number => (s.games ? Math.round(s.total / s.games) : 0);
