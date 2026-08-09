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
import type { ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'epoch',
  ops: {
    toDate: {
      desc: '유닉스 타임스탬프를 사람이 읽는 시각으로 바꾼다. 초·밀리초·마이크로초·나노초를 자릿수로 자동 판별한다.',
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
  label: string;
}

/** 자릿수로 단위를 가린다. 부호는 자릿수에 안 넣는다. */
export function detectUnit(raw: string): Unit {
  const digits = raw.replace('-', '').length;
  if (digits >= 18) return { div: 1e6, label: '나노초 (19자리)' };
  if (digits >= 15) return { div: 1e3, label: '마이크로초 (16자리)' };
  if (digits >= 12) return { div: 1, label: '밀리초 (13자리)' };
  return { div: 0.001, label: '초 (10자리)' };
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

const pad = (n: number): string => String(n).padStart(2, '0');

/** `<input type="datetime-local">` 이 받는 모양. **로컬 시간대**로 적어야 한다 — UTC 로 밀면 한 번 더 틀린다. */
export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 화면이 줄줄이 보여 줄 값들. 여기서 만들어야 Node·브라우저가 같은 답을 낸다. */
export function stampRows(ms: number, now: number): Array<[string, string]> {
  const d = new Date(ms);
  return [
    ['내 시간대', d.toLocaleString('ko-KR')],
    ['UTC', d.toUTCString()],
    ['ISO 8601', d.toISOString()],
    ['요일', WEEKDAYS[d.getDay()] + '요일'],
    ['지금 기준', humanDelta(ms, now)],
    ['초 (10자리)', String(Math.floor(ms / 1000))],
    ['밀리초 (13자리)', String(Math.round(ms))],
    ['마이크로초 (16자리)', String(Math.round(ms * 1e3))],
    ['나노초 (19자리)', String(Math.round(ms * 1e6))]
  ];
}
