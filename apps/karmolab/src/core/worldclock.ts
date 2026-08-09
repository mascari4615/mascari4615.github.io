/**
 * 세계 시간 · 시차 — 알맹이 (TASK-KL-088 / S1)
 *
 * MCP 로 내놓는 이유(B등급): **서머타임(DST)** 이다. LLM 은 시차를 외운 숫자로 답하는데,
 * 그 숫자는 1년에 두 번 바뀐다 — 「서울과 뉴욕은 14시간」은 겨울엔 맞고 여름엔 13시간이다.
 * 회의 시간을 그렇게 잡으면 한 시간 어긋난 채로 잡힌다. 여기선 **그 순간의 실제 오프셋**을
 * `Intl` 에서 읽는다(브라우저·Node 둘 다 시간대 표를 갖고 있다).
 *
 * 「지금」은 인자로 받는다 — 알맹이가 시계를 직접 보면 같은 입력에 답이 매번 달라진다.
 */
import type { ToolRunner, ToolSpec } from './types';

export const spec: ToolSpec = {
  id: 'worldclock',
  ops: {
    convert: {
      desc:
        'Convert a time from one zone to another, applying DST as it stood on that date' +
        ' (not as it stands today). Zones are IANA names: Asia/Seoul, America/New_York.' +
        ' / 도시 간 시각 변환. 그 날짜의 서머타임 반영.',
      in: { time: 'string', from: 'string', to: 'string' },
      out: 'string'
    },
    offset: {
      desc:
        'Offset between two zones for a given date. It will disagree with the number you memorised:' +
        ' DST moves it twice a year, and the two hemispheres do not move together.' +
        ' / 두 시간대 시차. 그 날짜 기준 — 외운 숫자와 다를 수 있다.',
      in: { from: 'string', to: 'string', date: 'string?' },
      out: 'string'
    }
  }
};

/**
 * 그 시간대의 UTC 오프셋(분). `Intl` 이 **그 날짜의** 서머타임까지 반영해 준다.
 * (고정 표를 들고 있으면 여기서 틀린다 — 표는 매년 바뀐다.)
 */
export function offsetMinutes(zone: string, at: Date): number {
  const s = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).format(at);
  const m = /GMT([+-])(\d{1,2}):?(\d{2})?/.exec(s);
  if (m === null) return 0;
  return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? '0', 10));
}

/** 시간대 이름이 진짜 있는지. 없는 이름을 그냥 0 으로 처리하면 조용히 틀린 답이 나온다. */
export function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * 「그 도시의 벽시계로 이 시각」이 실제로 어느 순간인지.
 * 오프셋이 그 순간에 따라 달라져서 **두 번 접근**한다 — 서머타임 경계에서 한 번으로는 어긋난다.
 */
export function wallToInstant(wall: string, zone: string): Date {
  const asUtc = Date.parse(wall.length === 16 ? `${wall}:00Z` : `${wall}Z`);
  let ts = asUtc;
  for (let i = 0; i < 2; i++) ts = asUtc - offsetMinutes(zone, new Date(ts)) * 60000;
  return new Date(ts);
}

/** 그 시간대의 벽시계 표기. */
export function wallOf(at: Date, zone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    /* `hour12: false` 만 주면 **자정을 24:00 으로** 내는 판이 있다(ICU 판마다 다르다).
       `hourCycle: 'h23'` 을 함께 박아 뒀는데 **그것도 부족했다** — 실측 2026-08-09:
       CI(node 20)에서 `2026-01-09 24:00`, 로컬(node 24)에서 `00:00`. 둘을 같이 주면 판에 따라
       `hour12` 가 이겨서 h24 로 돌아간다.
       그래서 부탁만 하지 않고 **나온 값을 우리가 확인한다** — 24 시는 0 시다. */
    hour12: false,
    hourCycle: 'h23'
  }).formatToParts(at);
  const get = (t: string): string => p.find((x) => x.type === t)?.value ?? '';
  /* 이 한 줄이 없어서 배포가 며칠 막혔다. 서식기 설정은 「부탁」이고, 값 확인은 「보장」이다. */
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}`;
}

/** 서머타임이 그 날짜에 걸려 있나 — 1월과 7월의 오프셋이 다르면 그 지역은 DST 를 쓴다. */
export function usesDst(zone: string, year: number): boolean {
  return offsetMinutes(zone, new Date(Date.UTC(year, 0, 15))) !== offsetMinutes(zone, new Date(Date.UTC(year, 6, 15)));
}

const hours = (min: number): string => {
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  return `${sign}${Math.floor(a / 60)}${a % 60 === 0 ? '' : ':' + String(a % 60).padStart(2, '0')}`;
};

const needZone = (raw: unknown, label: string): string => {
  const z = String(raw ?? '');
  if (isZone(z) === false) throw new Error(`${label} 시간대를 못 찾았습니다: ${z} (예: Asia/Seoul · America/New_York)`);
  return z;
};

export const run: ToolRunner = (op, args) => {
  const from = needZone(args.from, '출발');
  const to = needZone(args.to, '도착');

  if (op === 'convert') {
    const wall = String(args.time ?? '').trim().replace(' ', 'T');
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(wall) === false) {
      throw new Error('시각을 「2026-08-09 14:00」 처럼 주세요');
    }
    const at = wallToInstant(wall, from);
    const diff = (offsetMinutes(to, at) - offsetMinutes(from, at)) / 60;
    return [
      `${from} ${wallOf(at, from)}`,
      `→ ${to} ${wallOf(at, to)}`,
      `시차 ${diff >= 0 ? '+' : ''}${diff}시간 (이 날짜 기준)`,
      usesDst(to, at.getFullYear()) || usesDst(from, at.getFullYear())
        ? '⚠ 둘 중 한쪽이 서머타임을 씁니다 — 시차가 계절마다 달라집니다. 외운 숫자를 쓰지 마세요.'
        : ''
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  if (op === 'offset') {
    const raw = String(args.date ?? '');
    const at = raw === '' ? new Date() : new Date(`${raw}T12:00:00Z`);
    if (Number.isNaN(at.getTime())) throw new Error('날짜를 YYYY-MM-DD 로 주세요');
    const y = at.getUTCFullYear();
    const diff = offsetMinutes(to, at) - offsetMinutes(from, at);
    const lines = [
      `${from} (UTC${hours(offsetMinutes(from, at))}) → ${to} (UTC${hours(offsetMinutes(to, at))})`,
      `시차 ${hours(diff)}시간 · 기준일 ${at.toISOString().slice(0, 10)}`
    ];
    for (const z of [from, to]) {
      if (usesDst(z, y)) {
        const jan = offsetMinutes(z, new Date(Date.UTC(y, 0, 15))) / 60;
        const jul = offsetMinutes(z, new Date(Date.UTC(y, 6, 15))) / 60;
        lines.push(`⚠ ${z} 는 서머타임을 씁니다 — 1월 UTC${jan >= 0 ? '+' : ''}${jan} · 7월 UTC${jul >= 0 ? '+' : ''}${jul}`);
      }
    }
    return lines.join('\n');
  }

  throw new Error(`worldclock 에 「${op}」 는 없습니다`);
};
