/**
 * 당첨 확률. 숫자는 한 곳에서만 (TASK-KL-088 확장)
 *
 * 화면 세 군데(확률 표, 안내문, 채점 결과)가 같은 수를 말한다. 손으로 세 번 적으면 한 곳만
 * 고쳐지고 나머지가 옛 수로 남는다. 그래서 여기 한 벌만 둔다.
 *
 * 값의 출처:
 *  - 로또 6/45 = 조합수 C(45,6) = 8,145,060 에서 직접 센다 (동행복권 공식 1등 1/8,145,060,
 *    전체 1/42 와 일치). https://www.dhlottery.co.kr/lt645/intro
 *  - 연금복권720+ = 5조 × 1,000,000 = 5,000,000 조합. 끝자리부터 연속으로 맞는 개수가 등위다
 *    (공식 1등 1/5,000,000, 전체 1/10). https://www.dhlottery.co.kr/pt720/intro
 */

export interface Odds {
  /** 등위 이름 열쇠의 꼬리 (`lotto.rank.1` 처럼 쓴다) */
  key: string;
  /** 당첨 조건 설명 열쇠의 꼬리 */
  cond: string;
  /** 1게임당 당첨 확률 (배타적. 그 등위에만 걸릴 확률) */
  p: number;
  /** 당첨금 안내 열쇠의 꼬리 */
  prize: string;
}

/* ── 로또 6/45 ────────────────────────────────────────
   경우의 수: 1등 1, 2등 6, 3등 228, 4등 11,115, 5등 182,780 / 8,145,060 */
const C645 = 8145060;
export const ODDS_645: Odds[] = [
  { key: '1', cond: '645.1', p: 1 / C645, prize: '645.1' },
  { key: '2', cond: '645.2', p: 6 / C645, prize: '645.2' },
  { key: '3', cond: '645.3', p: 228 / C645, prize: '645.3' },
  { key: '4', cond: '645.4', p: 11115 / C645, prize: '645.4' },
  { key: '5', cond: '645.5', p: 182780 / C645, prize: '645.5' }
];

/* ── 연금복권720+ ──────────────────────────────────────
   경우의 수: 1등 1, 2등 4(다른 조 6자리 일치), 3등 45, 4등 450, 5등 4,500, 6등 45,000
  , 7등 450,000, 보너스 5 / 5,000,000 */
const CP = 5000000;
export const ODDS_PENSION: Odds[] = [
  { key: '1', cond: 'p.1', p: 1 / CP, prize: 'p.1' },
  { key: '2', cond: 'p.2', p: 4 / CP, prize: 'p.2' },
  { key: 'b', cond: 'p.b', p: 5 / CP, prize: 'p.b' },
  { key: '3', cond: 'p.3', p: 45 / CP, prize: 'p.3' },
  { key: '4', cond: 'p.4', p: 450 / CP, prize: 'p.4' },
  { key: '5', cond: 'p.5', p: 4500 / CP, prize: 'p.5' },
  { key: '6', cond: 'p.6', p: 45000 / CP, prize: 'p.6' },
  { key: '7', cond: 'p.7', p: 450000 / CP, prize: 'p.7' }
];

/** 아무 등위라도 걸릴 확률 (1게임). 645 = 1/41.96, 연금 = 1/10 */
export const anyWin = (table: Odds[]): number => table.reduce((s, o) => s + o.p, 0);

/**
 * **게임을 여러 판 사면** 확률이 어떻게 되나.
 *
 * `p × n` 이 아니다. 판마다 따로 지는 확률을 곱한 뒤 뒤집는다. n 이 작을 땐 차이가 안 보이지만
 * 그럼 만 판 사면 되겠네 같은 오해를 이 식이 막는다 (10,000 판을 사도 1등은 여전히 1/815).
 */
export const atLeastOnce = (p: number, n: number): number => 1 - Math.pow(1 - p, n);

/** 0.00000012 → "1/8,145,060". 사람은 소수점을 못 읽는다. */
export function asOneIn(p: number): string {
  if (p <= 0) return '. ';
  const n = 1 / p;
  const rounded = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return '1/' + rounded.toLocaleString('en-US');
}
