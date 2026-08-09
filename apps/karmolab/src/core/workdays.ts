/**
 * 영업일 계산 — 알맹이 (TASK-KL-088 / S1)
 *
 * 「접수일로부터 영업일 7일 이내」 같은 기한은 **주말만 빼서는 안 맞는다.** 공휴일과 대체공휴일까지
 * 빼야 진짜 날짜가 나온다.
 *
 * MCP 로 내놓는 이유(B등급 — 우리 해자): LLM 은 대체공휴일을 거의 못 맞힌다. 설·추석이 주말과
 * 겹쳐 밀리는 규칙, 2025-01-27 처럼 **그 해에만 있는 임시공휴일** 같은 건 규칙으로 안 나오고
 * 표에 있어야 안다. 게다가 모르는 해까지 그럴듯한 날짜를 지어낸다 — 사람은 그 날짜로 기한을 잡는다.
 * 그래서 여기선 **담지 않은 해는 「모른다」고 말한다.**
 *
 * 쉬는 날 표는 `src/lib/holidays.ts` 가 소유한다(나라별, TASK-KL-203). 여기서 베끼지 않는다 —
 * 두 벌이 되면 어느 날 한쪽만 갱신돼 조용히 갈린다. 이름은 열쇠로 오므로 MCP 답에는
 * 아래 `HOLIDAY_KO` 로 한국어를 붙인다(화면은 자기 말로 붙인다).
 *
 * 「오늘」과 지역은 인자로 받는다 — 알맹이가 시계·설정을 직접 보면 같은 입력에 답이 달라진다.
 */
import { hasCalendar, holidayKeys, knowsYear } from '../lib/holidays';
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'workdays',
  ops: {
    after: {
      desc:
        '시작일로부터 영업일 N일 뒤가 며칠인지 계산한다 (주말 + 공휴일 + 대체공휴일 제외).' +
        ' 「영업일 7일 이내」 같은 기한 계산. region 기본 KR, saturday 를 켜면 토요일도 영업일.',
      in: { start: 'string', days: 'number', region: 'string?', saturday: 'boolean?' },
      out: 'string'
    },
    between: {
      desc: '두 날짜 사이의 영업일 수를 센다. 어떤 날을 뺐는지도 함께 알려 준다.',
      in: { start: 'string', end: 'string', region: 'string?', saturday: 'boolean?' },
      out: 'string'
    }
  }
};

/** 열쇠 → 한국어. 글로 답하는 쪽(MCP)이 쓴다. 모르는 열쇠는 열쇠 그대로 내보낸다. */
const HOLIDAY_KO: Record<string, string> = {
  newYear: '신정',
  substitute: '대체공휴일',
  temporary: '임시공휴일',
  // 한국
  krMarchFirst: '삼일절',
  krChildren: '어린이날',
  krMemorial: '현충일',
  krLiberation: '광복절',
  krFoundation: '개천절',
  krHangul: '한글날',
  christmas: '성탄절',
  seollal: '설날',
  seollalEve: '설날 연휴',
  chuseok: '추석',
  chuseokEve: '추석 연휴',
  buddha: '부처님오신날',
  // 일본 (region=JP 로 부를 때)
  jpComingOfAge: '성인의 날',
  jpFoundation: '건국기념일',
  jpEmperor: '천황탄생일',
  jpShowa: '쇼와의 날',
  jpConstitution: '헌법기념일',
  jpGreenery: '녹색의 날',
  jpChildren: '어린이날',
  jpMarine: '바다의 날',
  jpMountain: '산의 날',
  jpRespect: '경로의 날',
  jpSports: '스포츠의 날',
  jpCulture: '문화의 날',
  jpLabor: '근로감사의 날',
  // 미국 (region=US)
  usMlk: '마틴 루터 킹 데이',
  usPresidents: '대통령의 날',
  usMemorial: '메모리얼 데이',
  usJuneteenth: '준틴스',
  usIndependence: '독립기념일',
  usLabor: '노동절',
  usColumbus: '콜럼버스 데이',
  usVeterans: '재향군인의 날',
  usThanksgiving: '추수감사절'
};

export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

const parseDate = (raw: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (m === null) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
};

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 그 해 쉬는 날 → 한국어 이름. 표는 `lib/holidays` 것을 쓴다. */
export function holidaysOf(regionCode: string, year: number): Map<string, string> {
  const named = new Map<string, string>();
  for (const [at, key] of holidayKeys(regionCode, year)) named.set(at, HOLIDAY_KO[key] ?? key);
  return named;
}

/** 쉬는 날이면 이유, 일하는 날이면 빈 문자열. */
export function restReason(d: Date, regionCode: string, saturdayWorks: boolean): string {
  const wd = d.getDay();
  if (wd === 0) return '일요일';
  if (wd === 6 && saturdayWorks === false) return '토요일';
  return holidaysOf(regionCode, d.getFullYear()).get(dayKey(d)) ?? '';
}

export interface Skipped {
  date: string;
  why: string;
}

export interface AfterResult {
  end: Date;
  skipped: Skipped[];
  /** 표에 없는 해가 섞였으면 여기에. 그 구간의 답은 믿으면 안 된다. */
  unknownYears: number[];
}

/** 시작일 **다음 날부터** 세어 영업일 N일 뒤. (「7영업일 이내」의 관례) */
export function addWorkdays(start: Date, days: number, regionCode = 'KR', saturdayWorks = false): AfterResult {
  const skipped: Skipped[] = [];
  const years = new Set<number>([start.getFullYear()]);
  const cur = new Date(start.getTime());
  let left = days;
  let guard = 0;
  while (left > 0 && guard++ < 4000) {
    cur.setDate(cur.getDate() + 1);
    years.add(cur.getFullYear());
    const why = restReason(cur, regionCode, saturdayWorks);
    if (why === '') left--;
    else skipped.push({ date: iso(cur), why });
  }
  return {
    end: cur,
    skipped,
    unknownYears: [...years].filter((y) => knowsYear(regionCode, y) === false)
  };
}

export interface BetweenResult {
  workdays: number;
  total: number;
  skipped: Skipped[];
  unknownYears: number[];
}

/** 두 날짜 **사이**(끝날 포함)의 영업일 수. */
export function countWorkdays(start: Date, end: Date, regionCode = 'KR', saturdayWorks = false): BetweenResult {
  const [from, to] = start.getTime() <= end.getTime() ? [start, end] : [end, start];
  const skipped: Skipped[] = [];
  const years = new Set<number>();
  const cur = new Date(from.getTime());
  let workdays = 0;
  let total = 0;
  let guard = 0;
  while (cur.getTime() <= to.getTime() && guard++ < 40000) {
    years.add(cur.getFullYear());
    total++;
    const why = restReason(cur, regionCode, saturdayWorks);
    if (why === '') workdays++;
    else skipped.push({ date: iso(cur), why });
    cur.setDate(cur.getDate() + 1);
  }
  return { workdays, total, skipped, unknownYears: [...years].filter((y) => knowsYear(regionCode, y) === false) };
}

const label = (d: Date): string => `${iso(d)} (${WEEKDAYS[d.getDay()]})`;

const warn = (regionCode: string, unknown: number[]): string =>
  unknown.length === 0
    ? ''
    : `\n⚠ ${unknown.join('·')}년 공휴일은 아직 안 담겨 있습니다 — 그 구간은 주말만 뺐습니다. 답을 그대로 믿지 마세요.`;

export const run: ToolRunner = (op, args) => {
  const regionCode = String(args.region ?? 'KR').toUpperCase();
  if (hasCalendar(regionCode) === false) throw new Error(`${regionCode} 공휴일은 아직 안 담겨 있습니다`);
  const saturday = args.saturday === true;

  const start = parseDate(String(args.start ?? ''));
  if (start === null) throw new Error('시작일을 YYYY-MM-DD 로 주세요');

  if (op === 'after') {
    const days = Math.round(Number(args.days));
    if (Number.isFinite(days) === false || days < 1) throw new Error('영업일 수를 1 이상으로 주세요');
    const r = addWorkdays(start, days, regionCode, saturday);
    const lines = [
      `${label(start)} 로부터 영업일 ${days}일 뒤 → ${label(r.end)}`,
      `건너뛴 날 ${r.skipped.length}일: ${r.skipped.map((s) => `${s.date}(${s.why})`).join(' · ') || '없음'}`
    ];
    return lines.join('\n') + warn(regionCode, r.unknownYears);
  }

  if (op === 'between') {
    const end = parseDate(String(args.end ?? ''));
    if (end === null) throw new Error('끝나는 날을 YYYY-MM-DD 로 주세요');
    const r = countWorkdays(start, end, regionCode, saturday);
    const lines = [
      `${label(start)} ~ ${label(end)}`,
      `영업일 ${r.workdays}일 (전체 ${r.total}일 중 ${r.skipped.length}일 쉼)`,
      `쉰 날: ${r.skipped.map((s) => `${s.date}(${s.why})`).join(' · ') || '없음'}`
    ];
    return lines.join('\n') + warn(regionCode, r.unknownYears);
  }

  throw new Error(`workdays 에 「${op}」 는 없습니다`);
};
