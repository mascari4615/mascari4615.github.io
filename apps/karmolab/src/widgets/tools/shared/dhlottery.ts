/**
 * 동행복권 최신 회차 받아오기 + 내 번호 채점
 *
 * **왜 프록시가 없나** (2026-08-20 실측): 동행복권 신규 `.do` 엔드포인트는 요청 Origin 을
 * 그대로 되비춘다 (`Access-Control-Allow-Origin: <내 주소>`). 그래서 정적 사이트에서 바로
 * 부를 수 있다. 서버를 하나 더 세울 이유가 없다.
 *
 * **대신 지켜야 할 것 하나**: 헤더를 붙이지 마라. `Content-Type` 같은 걸 얹는 순간
 * 예비 요청(OPTIONS)이 나가는데 그쪽은 400 을 준다. 그래서 아래 fetch 는 **주소만** 넘긴다.
 *
 * 인터넷에 도는 `common.do?method=getLottoNumber` 는 **죽었다** (302 로 첫 화면으로 튕긴다).
 * 그걸 쓰는 글이 아직 많으니, 되살릴 생각이 들면 이 줄을 먼저 읽어라.
 *
 * 못 받아도 도구는 그대로 돈다. 번호 뽑기는 인터넷이 필요 없다. 채점 칸만 접힌다.
 */

const HOST = 'https://www.dhlottery.co.kr';

/** 로또 1회차 추첨일 = 2002-12-07 (토). 이후 7일마다 한 회. */
const EPOCH_645 = Date.UTC(2002, 11, 7);

export interface Draw645 {
  round: number;
  date: string;
  nums: number[];
  bonus: number;
  /** 1등 당첨자 수, 1인당 금액. 이번 주엔 23명이 12억씩 같은 실감용 */
  firstCount: number;
  firstAmount: number;
}

export interface DrawPension {
  round: number;
  date: string;
  /** 조 (1~5) */
  bnd: number;
  /** 1등 6자리 */
  digits: string;
  /** 보너스 6자리 (조 무관) */
  bonus: string;
}

/** "20260815" → "2026-08-15" */
const ymd = (s: string): string =>
  /^\d{8}$/.test(s) ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) : s;

/**
 * 지금쯤 몇 회차인지 날짜로 짐작한다.
 *
 * 회차 목록을 주는 창구가 없어서(커서 없이 `latest` 를 부르면 빈 배열이 온다) **가운데를
 * 찍어** 창을 받는다. 창은 찍은 수의 +4 회차까지 온다. 그래서 짐작보다 4 를 빼서 찍으면
 * 짐작이 하루 이틀 어긋나도 최신 회차가 창 안에 들어온다.
 */
function guessRound645(now: number): number {
  return Math.floor((now - EPOCH_645) / (7 * 86400000)) + 1;
}

async function getJson(url: string): Promise<unknown> {
  /* 헤더 0개 = 예비 요청 0개. 아래 주석의 이유대로 절대 얹지 마라. */
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

export async function latest645(): Promise<Draw645> {
  const guess = guessRound645(Date.now());
  for (const center of [guess - 4, guess - 14, guess - 30]) {
    const raw = (await getJson(
      `${HOST}/lt645/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd=${Math.max(1, center)}`
    )) as { data?: { list?: Record<string, number | string>[] } };
    const list = raw?.data?.list || [];
    if (!list.length) continue;
    /* 창은 내림차순으로 오지만 믿지 않는다. 가장 큰 회차를 직접 고른다. */
    const top = list.reduce((a, b) => (Number(b.ltEpsd) > Number(a.ltEpsd) ? b : a));
    return {
      round: Number(top.ltEpsd),
      date: ymd(String(top.ltRflYmd)),
      nums: [top.tm1WnNo, top.tm2WnNo, top.tm3WnNo, top.tm4WnNo, top.tm5WnNo, top.tm6WnNo]
        .map(Number)
        .sort((a, b) => a - b),
      bonus: Number(top.bnsWnNo),
      firstCount: Number(top.rnk1WnNope) || 0,
      firstAmount: Number(top.rnk1WnAmt) || 0
    };
  }
  throw new Error('no round');
}

export async function latestPension(): Promise<DrawPension> {
  const raw = (await getJson(`${HOST}/pt720/selectPstPt720WnList.do`)) as {
    data?: { result?: Record<string, string | number>[] };
  };
  const list = raw?.data?.result || [];
  if (!list.length) throw new Error('no round');
  const top = list.reduce((a, b) => (Number(b.psltEpsd) > Number(a.psltEpsd) ? b : a));
  return {
    round: Number(top.psltEpsd),
    date: ymd(String(top.psltRflYmd)),
    bnd: Number(top.wnBndNo),
    digits: String(top.wnRnkVl),
    bonus: String(top.bnsRnkVl)
  };
}

/* ── 채점 ─────────────────────────────────────────────
   등위 0 = 꽝. 문자열이 아니라 수로 돌려준다. 화면 말은 부르는 쪽이 붙인다. */

export interface Score {
  /** 1~5 (로또) / 1~7 (연금), 0 = 꽝 */
  rank: number;
  /** 로또: 맞은 개수 / 연금: 뒤에서 몇 자리가 맞았나 */
  hit: number;
  /** 로또 보너스 일치 / 연금 보너스번호 당첨 */
  bonus: boolean;
  /** 화면에서 그 공만 빛나게 할 번호 (로또 전용) */
  hitNums?: number[];
}

export function score645(mine: number[], bonusOf: number, win: Draw645): Score {
  const hitNums = mine.filter((n) => win.nums.indexOf(n) >= 0);
  const hit = hitNums.length;
  const bonusHit = bonusOf > 0 && bonusOf === win.bonus;
  let rank = 0;
  if (hit === 6) rank = 1;
  else if (hit === 5 && bonusHit) rank = 2;
  else if (hit === 5) rank = 3;
  else if (hit === 4) rank = 4;
  else if (hit === 3) rank = 5;
  return { rank, hit, bonus: bonusHit, hitNums };
}

/** 뒤에서부터 몇 글자가 같은가. "644513" vs "123513" → 3 */
function tailMatch(a: string, b: string): number {
  let n = 0;
  while (n < a.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

export function scorePension(bnd: number, digits: string, win: DrawPension): Score {
  if (digits === win.bonus) return { rank: 0, hit: 6, bonus: true };
  const hit = tailMatch(digits, win.digits);
  if (hit === 6) return { rank: bnd === win.bnd ? 1 : 2, hit, bonus: false };
  /* 3등부터는 조를 안 본다. 뒤 5, 4, 3, 2, 1 자리만 맞으면 된다. */
  const rank = hit >= 1 ? 8 - hit : 0;
  return { rank, hit, bonus: false };
}
