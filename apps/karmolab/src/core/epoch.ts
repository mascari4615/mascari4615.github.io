/**
 * 유닉스 타임스탬프 변환 — 알맹이 (TASK-KL-088 / S1)
 *
 * 로그와 API 응답의 시각은 대개 숫자로 온다. 이걸 읽으려면 **자릿수부터 가려야 한다** —
 * 10자리는 초, 13자리는 밀리초, 16자리는 마이크로초, 19자리는 나노초다.
 *
 * 예전에 여기서 크게 틀렸다: 「11자리 미만이면 초, 아니면 밀리초」 하나뿐이라 마이크로초·
 * 나노초를 밀리초로 읽고 **서기 5만 년을 자신 있게 내놓았다**. 게다가 「밀리초로 읽었습니다」
 * 까지 붙어 사람이 의심할 길이 없었다. 그 판단이 이 파일의 핵심이고, 그래서 시험 대상이다.
 *
 * 「지금」은 인자로 받는다(`now`). 알맹이가 시계를 직접 보면 같은 입력에 답이 매번 달라져
 * 시험이 못 잡는다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'epoch',
  ops: {
    toDate: {
      desc:
        'Turn a Unix timestamp into a readable time, detecting seconds / milliseconds / microseconds /' +
        ' nanoseconds from the digit count — guessing wrong lands you in 1970 or the year 55000.' +
        ' / 유닉스 타임스탬프 → 사람이 읽는 시각. 단위 자동 판별.',
      in: { ts: 'string' },
      out: 'string'
    },
    toStamp: {
      desc: 'ISO 8601 시각을 유닉스 타임스탬프(초)로 바꾼다.',
      in: { date: 'string' },
      out: 'number'
    }
  }
};

export interface Unit {
  /** 이 단위 값을 밀리초로 만들려면 나눌 수. (초는 0.001 로 나눔 = 1000 곱) */
  div: number;
  /** 이름 대신 쓰는 표식 — 화면은 이걸로 자기 말을 붙인다. */
  key: UnitKey;
}

/** 단위의 **표식**. 이름은 읽는 쪽이 붙인다 (TASK-KL-203). */
export type UnitKey = 'sec' | 'ms' | 'us' | 'ns';

const UNIT_KO: Record<UnitKey, string> = {
  ns: '나노초 (19자리)',
  us: '마이크로초 (16자리)',
  ms: '밀리초 (13자리)',
  sec: '초 (10자리)'
};

export function unitKo(key: UnitKey): string {
  return UNIT_KO[key];
}

/** 자릿수로 단위를 가린다. 부호는 자릿수에 안 넣는다. */
export function detectUnit(raw: string): Unit {
  const digits = raw.replace('-', '').length;
  const key: UnitKey = digits >= 18 ? 'ns' : digits >= 15 ? 'us' : digits >= 12 ? 'ms' : 'sec';
  const div = key === 'ns' ? 1e6 : key === 'us' ? 1e3 : key === 'ms' ? 1 : 0.001;
  return { div, key };
}

export interface ParsedStamp {
  ms: number;
  unit: Unit;
}

/** 사람이 붙여넣은 문자열에서 숫자만 골라 읽는다. 읽을 수 없으면 null — 「모르겠다」를 값으로 말한다. */
export function parseTimestamp(input: string): ParsedStamp | null {
  const raw = input.replace(/[^\d-]/g, '');
  if (raw === '' || raw === '-') return null;
  const n = Number(raw);
  if (Number.isFinite(n) === false) return null;
  const unit = detectUnit(raw);
  return { ms: n / unit.div, unit };
}

const DELTA_UNITS: Array<[number, string]> = [
  [1000, '초'],
  [60000, '분'],
  [3600000, '시간'],
  [86400000, '일'],
  [2592000000, '개월'],
  [31536000000, '년']
];

/** 「3일 전」 같은 말. `now` 를 받아야 같은 입력에 같은 답이 난다. */
export function humanDelta(ms: number, now: number): string {
  const diff = ms - now;
  const abs = Math.abs(diff);
  let out = '방금';
  for (let i = DELTA_UNITS.length - 1; i >= 0; i--) {
    if (abs >= DELTA_UNITS[i][0]) {
      out = `${Math.round(abs / DELTA_UNITS[i][0])}${DELTA_UNITS[i][1]}`;
      break;
    }
  }
  if (out === '방금') return out;
  return diff >= 0 ? `${out} 후` : `${out} 전`;
}

export type DeltaKey = 'now' | 'past' | 'future';

export function humanDeltaParts(ms: number, now: number): { amount: number; unitKo: string; tense: DeltaKey } {
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < 1000) return { amount: 0, unitKo: '', tense: 'now' };
  for (let i = DELTA_UNITS.length - 1; i >= 0; i--) {
    if (abs >= DELTA_UNITS[i][0]) {
      return {
        amount: Math.round(abs / DELTA_UNITS[i][0]),
        unitKo: DELTA_UNITS[i][1],
        tense: diff >= 0 ? 'future' : 'past'
      };
    }
  }
  return { amount: 0, unitKo: '', tense: 'now' };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** `<input type="datetime-local">` 이 받는 모양. **로컬 시간대**로 적어야 한다 — UTC 로 밀면 한 번 더 틀린다. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function weekdayKo(index: number): string {
  return WEEKDAYS_KO[index] ?? '';
}

/** 화면이 줄줄이 보여 줄 값들. 여기서 만들어야 Node·브라우저가 같은 답을 낸다. */
export function stampRows(ms: number, now: number): Array<[string, string]> {
  const d = new Date(ms);
  return [
    ['내 시간대', d.toLocaleString('ko-KR')],
    ['UTC', d.toUTCString()],
    ['ISO 8601', d.toISOString()],
    ['요일', weekdayKo(d.getDay()) + '요일'],
    ['지금 기준', humanDelta(ms, now)],
    ['초 (10자리)', String(Math.floor(ms / 1000))],
    ['밀리초 (13자리)', String(Math.round(ms))],
    ['마이크로초 (16자리)', String(Math.round(ms * 1e3))],
    ['나노초 (19자리)', String(Math.round(ms * 1e6))]
  ];
}

/**
 * 화면용 — **이름 대신 표식**과 값. 「지금 기준」은 값이 아니라 시각을 넘겨 화면이
 * `Intl.RelativeTimeFormat` 으로 그 언어답게 적게 한다 (TASK-KL-203).
 */
export function stampRowKeys(ms: number): Array<[string, string | number]> {
  const d = new Date(ms);
  return [
    ['local', ''],
    ['utc', d.toUTCString()],
    ['iso', d.toISOString()],
    ['weekday', ''],
    ['delta', ms],
    ['sec', String(Math.floor(ms / 1000))],
    ['ms', String(Math.round(ms))],
    ['us', String(Math.round(ms * 1e3))],
    ['ns', String(Math.round(ms * 1e6))]
  ];
}

/**
 * 이름으로 부르는 창구 (`types.ts` 의 ToolRunner).
 * 「지금」이 필요한 답(`지금 기준`)은 `deps.now` 로 받는다 — 안 주면 시계를 본다.
 */
export const run: ToolRunner = (op, args, deps) => {
  const now = typeof deps?.now === 'number' ? deps.now : Date.now();
  if (op === 'toDate') {
    const parsed = parseTimestamp(String(args.ts ?? ''));
    if (parsed === null) throw new Error('타임스탬프에서 숫자를 못 찾았습니다');
    // 기계가 읽을 답 = 무엇으로 읽었는지 + 값들. 사람이 봐도 바로 읽힌다.
    const rows = stampRows(parsed.ms, now);
    return [`${unitKo(parsed.unit.key)}로 읽음`, ...rows.map(([k, v]) => `${k}: ${v}`)].join('\n');
  }
  if (op === 'toStamp') {
    const t = new Date(String(args.date ?? '')).getTime();
    if (Number.isNaN(t)) throw new Error('시각을 못 읽었습니다 (ISO 8601 로 주세요)');
    return Math.floor(t / 1000);
  }
  throw new Error(`epoch 에 「${op}」 는 없습니다`);
};
