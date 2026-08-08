/**
 * 시간여행 표 — 우물을 매일 한 장씩 찍어 둔다 (TASK-KL-190 ②).
 *
 * 왜 있나: 우물(KL-153)은 **지금**만 말한다. 그런데 재미있는 건 「지금 1등」이 아니라
 * **「지난주보다 뭐가 올라왔나」**다 — 그건 아무 API 도 안 준다. 우리가 쌓아야만 생긴다.
 * 오늘 시작하지 않으면 한 달 뒤에도 데이터가 0 이다. 그래서 기능보다 **적재를 먼저** 켠다.
 *
 * 언제 찍나: 누가 그 우물을 열 때(= 표를 길어 올 때) **오늘 것이 없으면** 한 장 찍는다.
 * 따로 시각을 잡지 않는 이유 — 시각 트리거는 노트북이 자거나 배포로 재시작하면 그날이
 * 통째로 빈다. 「열릴 때 찍기」는 스스로 낫는다(누가 한 번만 열면 그날이 채워진다).
 *
 * 무엇을 버리나: 그림 주소·분류 글자는 안 남긴다. 남기는 것은 **이름 + 숫자 칸**뿐이다.
 * 표 한 장이 100개짜리라도 몇 KB 다 — 그래야 90일을 들고 있어도 원장이 안 터진다.
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';
import type { WellPack, WellItem } from './karmolab-wells';

const STATE_FILE = 'karmolab-well-snapshots-state.json';
/** 며칠까지 들고 있나. 「작년 오늘」까지 가면 좋지만, 먼저 90일로 시작한다. */
export const KEEP_DAYS = 90;

/** 하루치 한 장 — 이름 → 숫자 칸들. */
export interface DaySnapshot {
  day: string;
  items: Record<string, Record<string, number>>;
}

export interface Mover {
  name: string;
  field: string;
  now: number;
  before: number;
  /** 얼마나 변했나 (%). 0 에서 출발한 것은 %로 말할 수 없어 안 담는다. */
  changePct: number;
  /** 순위가 몇 칸 움직였나 (음수 = 위로). 그 칸이 없으면 null. */
  rankDelta: number | null;
}

interface State {
  /** 우물 id → 날짜 오름차순 스냅샷. */
  wells: Record<string, DaySnapshot[]>;
}

/** 오늘(KST). 서버 전체가 같은 모양을 써야 하루가 안 어긋난다. */
export function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
}

export function dayBefore(day: string, n = 1): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

/** 표 한 벌 → 숫자만 남긴 하루치. 숫자가 하나도 없는 항목은 안 담는다. */
export function compact(items: WellItem[]): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const item of items) {
    const numbers: Record<string, number> = {};
    for (const [key, value] of Object.entries(item)) {
      if (key === 'name' || key === 'img') continue;
      if (typeof value === 'number' && isFinite(value)) numbers[key] = value;
    }
    if (Object.keys(numbers).length) out[item.name] = numbers;
  }
  return out;
}

/**
 * 두 날을 견줘서 **많이 움직인 것**을 뽑는다.
 *
 * 왜 %인가: 접속자 1000 → 2000 과 1,000,000 → 1,001,000 은 같은 +1000 이지만 전혀 다른
 * 사건이다. 그리고 **0 에서 시작한 것은 아예 안 담는다** — 0 → 5 는 무한% 라서 표를 통째로
 * 차지해 버린다(실제로 그런 목록은 아무 정보가 없다).
 */
export function movers(now: DaySnapshot, before: DaySnapshot, field: string, limit = 5): Mover[] {
  const rankOf = (snap: DaySnapshot): Map<string, number> => {
    const rows = Object.entries(snap.items)
      .filter(([, v]) => typeof v[field] === 'number')
      .sort((a, b) => b[1][field] - a[1][field]);
    return new Map(rows.map(([name], i) => [name, i + 1]));
  };
  const nowRank = rankOf(now);
  const beforeRank = rankOf(before);

  const rows: Mover[] = [];
  for (const [name, values] of Object.entries(now.items)) {
    const nowValue = values[field];
    const beforeValue = before.items[name]?.[field];
    if (typeof nowValue !== 'number' || typeof beforeValue !== 'number' || beforeValue <= 0) continue;
    if (nowValue === beforeValue) continue;
    const a = nowRank.get(name);
    const b = beforeRank.get(name);
    rows.push({
      name,
      field,
      now: nowValue,
      before: beforeValue,
      changePct: Math.round(((nowValue - beforeValue) / beforeValue) * 1000) / 10,
      rankDelta: a !== undefined && b !== undefined ? a - b : null,
    });
  }
  rows.sort((x, y) => Math.abs(y.changePct) - Math.abs(x.changePct));
  return rows.slice(0, limit);
}

export class WellSnapshotStore {
  private state: State = { wells: {} };

  constructor(private readonly file: string = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object' && raw.wells) this.state = raw as State;
    } catch {
      /* 처음이거나 깨졌다 — 오늘부터 다시 쌓는다. 여기서 죽으면 우물 전체가 멈춘다. */
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.state), 'utf8');
    } catch {
      /* 못 적어도 표는 나간다 — 적재는 곁가지고 놀이가 본체다 */
    }
  }

  days(well: string): string[] {
    return (this.state.wells[well] ?? []).map((s) => s.day);
  }

  snapshot(well: string, day: string): DaySnapshot | null {
    return (this.state.wells[well] ?? []).filter((s) => s.day === day)[0] ?? null;
  }

  /**
   * 오늘 것이 없으면 한 장 찍는다. 이미 있으면 **덮어쓰지 않는다** —
   * 하루에도 여러 번 열리는데 그때마다 덮으면 「그날의 값」이 마지막 열람 시각 값이 된다.
   */
  record(pack: WellPack, day: string = kstDay()): boolean {
    const list = (this.state.wells[pack.well] ??= []);
    if (list.some((s) => s.day === day)) return false;
    // 바깥이 죽어서 지난 표를 주는 중이면 찍지 않는다 — 어제 숫자를 오늘로 적게 된다.
    if (pack.stale) return false;
    const items = compact(pack.items);
    if (!Object.keys(items).length) return false;

    list.push({ day, items });
    list.sort((a, b) => a.day.localeCompare(b.day));
    if (list.length > KEEP_DAYS) list.splice(0, list.length - KEEP_DAYS);
    this.save();
    return true;
  }

  /**
   * 「며칠 전과 견줘서 많이 움직인 것」.
   *
   * 딱 그날이 없으면 **가장 가까운 이전 날**을 쓴다 — 노트북이 자서 하루가 비어도
   * 「비교할 게 없다」로 끝나면 안 된다. 대신 어느 날과 견줬는지 함께 돌려준다.
   */
  movers(well: string, field: string, back = 1, limit = 5): { since: string; rows: Mover[] } | null {
    const list = this.state.wells[well] ?? [];
    if (list.length < 2) return null;
    const latest = list[list.length - 1];
    const target = dayBefore(latest.day, back);
    const older = list.filter((s) => s.day <= target);
    const before = older.length ? older[older.length - 1] : list[0];
    if (before.day === latest.day) return null;
    return { since: before.day, rows: movers(latest, before, field, limit) };
  }
}

let shared: WellSnapshotStore | null = null;
export function getWellSnapshotStore(): WellSnapshotStore {
  return (shared ??= new WellSnapshotStore());
}
