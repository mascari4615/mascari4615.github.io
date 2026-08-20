/**
 * **사람이 말하는 때**를 한 순간으로 (TASK-KL-267)
 *
 * 때 도구는 여덟인데(날짜 계산·D-Day·타이머·시차·타임스탬프·생일·영업일·시간 더하기)
 * 전부 **칸을 채워 넣는 양식**이었다. 그런데 사람이 들고 오는 건 늘 하나다 — **「그 때」**.
 * 「내일 오후 3시」·「2026-09-01」·「1755043200」·「3주 뒤」 는 전부 **같은 것을 가리키는 다른 말**이다.
 *
 * 그래서 말을 한 순간으로 옮기는 자리를 하나 둔다. 그 순간이 정해지면 나머지는 전부
 * **그 순간의 다른 얼굴**이다: 요일 · 몇 주차 · 유닉스 초 · ISO · 남은 날 · 다른 도시의 시각.
 *
 * 바깥에 안 기댄다 — 도시별 시각은 브라우저가 가진 시간대 표(`Intl`)로 낸다.
 * 서머타임도 그쪽이 안다(직접 표를 들고 있으면 해마다 틀린다).
 */

export interface WhenParsed {
  /** 알아들은 순간 (못 알아들었으면 null) */
  at: Date | null;
  /** 어떻게 알아들었는지 — 사람에게 보여 준다(틀리게 읽었으면 바로 알아채게) */
  how: string;
  /** 시각까지 말했나 (안 말했으면 그 날 0시로 둔다 — 「하루」를 가리킨 것이다) */
  hasTime: boolean;
}

const DAY = 86400_000;
const WEEKDAYS: Record<string, number> = {
  일: 0, '월': 1, '화': 2, '수': 3, '목': 4, '금': 5, '토': 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
};

function atMidnight(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** 「오후 3시」·「15:30」·「3시 20분」 — 있으면 날짜에 얹는다. */
function applyTime(base: Date, src: string): { at: Date; had: boolean } {
  const hm = src.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (hm) {
    const c = new Date(base);
    c.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return { at: c, had: true };
  }
  const ko = src.match(/(오전|오후|아침|저녁|밤)?\s*(\d{1,2})\s*시\s*(?:(\d{1,2})\s*분)?/);
  if (ko) {
    let h = Number(ko[2]);
    const ampm = ko[1];
    /* 「오후 3시」 는 15시. 「오후 12시」 는 12시(0시가 아니다) — 여기서 자주 틀린다. */
    if ((ampm === '오후' || ampm === '저녁' || ampm === '밤') && h < 12) h += 12;
    if ((ampm === '오전' || ampm === '아침') && h === 12) h = 0;
    const c = new Date(base);
    c.setHours(h, Number(ko[3] || 0), 0, 0);
    return { at: c, had: true };
  }
  return { at: base, had: false };
}

/**
 * 사람 말을 한 순간으로. `now` 를 받는 이유는 **검사할 수 있게** 하기 위해서다 —
 * 「내일」이 무엇인지는 오늘이 언제냐에 달렸는데, 그걸 안에서 몰래 읽으면 검사가 날마다 달라진다.
 */
export function parseWhen(raw: string, now: Date = new Date()): WhenParsed {
  const src = raw.trim();
  if (!src) return { at: null, how: '', hasTime: false };

  /* ① 유닉스 시각 — 숫자만 있는 줄 */
  if (/^\d{10}$/.test(src)) return { at: new Date(Number(src) * 1000), how: '유닉스 초', hasTime: true };
  if (/^\d{13}$/.test(src)) return { at: new Date(Number(src)), how: '유닉스 밀리초', hasTime: true };

  /* ② 적어 놓은 날짜 — 2026-09-01 · 2026.9.1 · 2026/09/01 · 9/1 */
  const ymd = src.match(/(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})/);
  if (ymd) {
    const base = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    const { at, had } = applyTime(base, src.slice(ymd[0].length));
    return { at, how: '적어 놓은 날짜', hasTime: had };
  }
  const md = src.match(/^(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?/);
  if (md) {
    const base = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    const { at, had } = applyTime(base, src.slice(md[0].length));
    return { at, how: '올해의 날짜', hasTime: had };
  }

  /* ③ 오늘·내일 같은 말 */
  const rel: Record<string, number> = {
    '오늘': 0, today: 0, '내일': 1, tomorrow: 1, '모레': 2, '글피': 3, '어제': -1, yesterday: -1, '그저께': -2
  };
  for (const [word, off] of Object.entries(rel)) {
    if (src.includes(word)) {
      const base = atMidnight(new Date(now.getTime() + off * DAY));
      const { at, had } = applyTime(base, src.replace(word, ''));
      return { at, how: word, hasTime: had };
    }
  }

  /* ④ 며칠 뒤·전 — 「3일 뒤」·「2주 후」·「6개월 전」·「1년 뒤」 */
  const shift = src.match(/(-?\d+)\s*(일|주|개월|달|년|년간|day|days|week|weeks|month|months|year|years)\s*(뒤|후|전|이내|later|ago)?/i);
  if (shift) {
    const n = Number(shift[1]) * (/전|ago/.test(shift[3] || '') ? -1 : 1);
    const unit = shift[2].toLowerCase();
    const c = atMidnight(now);
    if (/^(일|day)/.test(unit)) c.setDate(c.getDate() + n);
    else if (/^(주|week)/.test(unit)) c.setDate(c.getDate() + n * 7);
    else if (/^(개월|달|month)/.test(unit)) c.setMonth(c.getMonth() + n);
    else c.setFullYear(c.getFullYear() + n);
    const { at, had } = applyTime(c, src);
    return { at, how: `${shift[1]}${shift[2]} ${/전|ago/.test(shift[3] || '') ? '전' : '뒤'}`, hasTime: had };
  }

  /* ⑤ 요일 — 「다음 주 월요일」·「이번 주 금요일」·「금요일」(다음에 오는 그 요일) */
  const wd = src.match(/(다음|이번|저번|지난)?\s*주?\s*([월화수목금토일]|mon|tue|wed|thu|fri|sat|sun)(?:요일|day)?/i);
  if (wd) {
    const want = WEEKDAYS[wd[2].toLowerCase()];
    if (want !== undefined) {
      const c = atMidnight(now);
      let delta = (want - c.getDay() + 7) % 7;
      /* 「금요일」 만 말했는데 오늘이 금요일이면 **오늘**이다(다음 주가 아니다) */
      if (wd[1] === '다음') delta += 7;
      else if (wd[1] === '저번' || wd[1] === '지난') delta -= 7;
      c.setDate(c.getDate() + delta);
      const { at, had } = applyTime(c, src);
      return { at, how: `${wd[1] || '다음'} ${wd[2]}요일`, hasTime: had };
    }
  }

  /* ⑥ 시각만 — 「오후 3시」 는 오늘의 그 시각 */
  const onlyTime = applyTime(atMidnight(now), src);
  if (onlyTime.had) return { at: onlyTime.at, how: '오늘의 시각', hasTime: true };

  /* ⑦ 마지막으로 브라우저에게 물어본다 (「2026-09-01T12:00:00Z」 같은 것) */
  const d = new Date(src);
  if (!Number.isNaN(d.getTime())) return { at: d, how: '적어 놓은 시각', hasTime: true };

  return { at: null, how: '', hasTime: false };
}

/* ── 그 순간의 여러 얼굴 ───────────────────────────────────────── */

export interface WhenFace {
  label: string;
  value: string;
}

const KO_DAY = ['일', '월', '화', '수', '목', '금', '토'];

/** ISO 주차 — 「몇 주차」는 나라마다 세는 법이 달라 **표준(ISO 8601)**으로 못 박는다. */
export function isoWeek(d: Date): number {
  const c = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  c.setUTCDate(c.getUTCDate() + 4 - (c.getUTCDay() || 7));
  const jan1 = new Date(Date.UTC(c.getUTCFullYear(), 0, 1));
  return Math.ceil(((c.getTime() - jan1.getTime()) / DAY + 1) / 7);
}

/** 며칠 남았나 — **날짜 단위**로 센다(시각까지 빼면 「내일」이 0일 남음으로 나온다). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((atMidnight(b).getTime() - atMidnight(a).getTime()) / DAY);
}

export function facesOf(at: Date, now: Date = new Date()): WhenFace[] {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const d = daysBetween(now, at);
  return [
    {
      label: '날짜',
      value: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} (${KO_DAY[at.getDay()]})`
    },
    { label: '시각', value: `${pad(at.getHours())}:${pad(at.getMinutes())}` },
    { label: 'D-Day', value: d === 0 ? '오늘' : d > 0 ? `D-${d}` : `D+${-d}` },
    { label: '주차', value: `${at.getFullYear()}년 ${isoWeek(at)}주차` },
    { label: '유닉스 초', value: String(Math.floor(at.getTime() / 1000)) },
    { label: 'ISO', value: at.toISOString() }
  ];
}

/** 다른 도시에서는 몇 시인가. 시간대 표는 **브라우저 것**을 쓴다(서머타임까지 그쪽이 안다). */
export function inZones(at: Date, zones: string[]): WhenFace[] {
  return zones.map((zone) => {
    try {
      const f = new Intl.DateTimeFormat('ko-KR', {
        timeZone: zone,
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return { label: zone.split('/').pop() || zone, value: f.format(at) };
    } catch {
      return { label: zone, value: '—' };
    }
  });
}

/* ── 시간 격자 (TASK-KL-287 — World Time Buddy·timeanddate 회의 계획표) ── */

export interface HourCell {
  /** 그 도시의 그때 시각 (0~23) */
  hour: number;
  /** 편한 정도 — 일하는 때 / 그럭저럭 / 자는 때 */
  ease: 'ok' | 'meh' | 'bad';
  /** 날짜가 넘어갔나 (-1 어제 · 0 같은 날 · +1 내일) */
  dayShift: number;
}

export interface HourRow {
  zone: string;
  label: string;
  cells: HourCell[];
}

/** 09~18 = 일하는 때, 07~22 = 그럭저럭, 나머지는 자는 때. */
export function easeOf(hour: number): HourCell['ease'] {
  if (hour >= 9 && hour < 18) return 'ok';
  if (hour >= 7 && hour < 22) return 'meh';
  return 'bad';
}

/**
 * **하루치 시간 격자.**
 *
 * 「지금 저기가 몇 시인가」(변환)와 「**언제 다 같이 깨어 있나**」(계획)는 다른 물음이다.
 * 뒤엣것에는 한 순간이 아니라 **하루가 통째로** 필요하다 — 그래서 24칸을 만든다.
 * 기준은 **여기(브라우저) 시각**이다: 내가 잡을 수 있는 시간대 위에 남들 시각을 겹쳐 본다.
 */
export function hourGrid(at: Date, zones: string[], span = 24): HourRow[] {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  return zones.map((zone) => {
    const cells: HourCell[] = [];
    for (let i = 0; i < span; i++) {
      const when = new Date(start.getTime() + i * 3600_000);
      let hour = when.getHours();
      let day = when.getDate();
      try {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: zone,
          hour: '2-digit',
          day: '2-digit',
          hour12: false
        }).formatToParts(when);
        hour = Number(parts.find((p) => p.type === 'hour')?.value ?? hour);
        day = Number(parts.find((p) => p.type === 'day')?.value ?? day);
        if (hour === 24) hour = 0;
      } catch {
        /* 모르는 시간대면 여기 시각 그대로 — 화면이 죽는 것보다 낫다 */
      }
      const here = new Date(start.getTime() + i * 3600_000).getDate();
      cells.push({ hour, ease: easeOf(hour), dayShift: day === here ? 0 : day > here || day === 1 ? 1 : -1 });
    }
    return { zone, label: zone.split('/').pop()?.replace(/_/g, ' ') || zone, cells };
  });
}

/**
 * **다 같이 편한 때**를 고른다 — 회의 잡기의 진짜 답.
 * 한 칸이라도 자는 때면 뺀다. 하나도 없으면 「그럭저럭」까지 받아 준다(그래도 없으면 빈손).
 */
export interface BestHours {
  /** 짚어 줄 칸들 (없을 수도 있다) */
  hours: number[];
  /** 어느 수준으로 찾았나 — 「다 편함 / 그럭저럭 / 누군가는 힘듦」 */
  level: 'ok' | 'meh' | 'least';
}

export function bestHours(rows: HourRow[]): BestHours {
  const span = rows[0]?.cells.length || 0;
  const pick = (allow: Array<HourCell['ease']>): number[] => {
    const out: number[] = [];
    for (let i = 0; i < span; i++) if (rows.every((r) => allow.includes(r.cells[i].ease))) out.push(i);
    return out;
  };
  const good = pick(['ok']);
  if (good.length) return { hours: good, level: 'ok' };
  const soso = pick(['ok', 'meh']);
  if (soso.length) return { hours: soso, level: 'meh' };

  /* **아무 때도 다 편하지 않을 수 있다** (서울↔로스앤젤레스처럼 반대편이면 늘 그렇다).
   * 그때 빈손으로 두면 화면이 「불가능」이라고 말하는 셈인데, 실제로는 **덜 나쁜 때**가 답이다 —
   * 자는 사람이 가장 적은 칸을 짚어 준다. 「없다」가 아니라 「이만큼은 감수해야 한다」가 진짜 답. */
  let bestScore = Infinity;
  let out: number[] = [];
  for (let i = 0; i < span; i++) {
    const score = rows.reduce((n, r) => n + (r.cells[i].ease === 'bad' ? 2 : r.cells[i].ease === 'meh' ? 1 : 0), 0);
    if (score < bestScore) {
      bestScore = score;
      out = [i];
    } else if (score === bestScore) out.push(i);
  }
  return { hours: out, level: 'least' };
}
