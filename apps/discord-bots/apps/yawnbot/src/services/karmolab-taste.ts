/**
 * 취향 지문 — 내가 고른 것들이 나를 설명한다 (TASK-KL-190 ④).
 *
 * 왜 있나: 월드컵·높은 쪽 고르기의 선택은 지금 **순위 말고 아무 데도 안 쓰인다.** 한 판 끝나면
 * 사라진다. 그런데 「무엇을 골랐나」는 순위보다 훨씬 많은 걸 말한다 — 누구와 취향이 같은지,
 * 정반대인 사람은 누구인지. 그게 사람을 다시 오게 하는 이유가 된다.
 *
 * 어떻게 재나: **맞대결 승률**이다. 한 판(월드컵)에서 A 가 B 를 이겼다 = 그 사람은 A 쪽이다.
 * 항목마다 (이긴 수 / 마주친 수) 를 쌓으면 그게 그 사람의 지문이다.
 * 우승 횟수로 세지 않는 이유: 대진운이 좋으면 약한 것도 우승한다(같은 이유로 승률을
 * **마주친 판**으로 나눈다 — KL-151 이 이미 판단한 자리다).
 *
 * 견주는 법: **둘 다 충분히 본 항목**만 견준다. 나는 100개를 봤고 상대는 4개만 봤다면
 * 그 4개로 「취향 100% 일치」라고 말할 수 없다. 겹치는 항목이 적으면 아예 답을 안 한다.
 *
 * 어디에 사나: `data/karmolab-taste-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import { PKG_ROOT } from '../paths';

const STATE_FILE = 'karmolab-taste-state.json';
/** 이만큼은 겹쳐야 「취향이 비슷하다」를 말한다. 적으면 우연이 사람 얼굴을 하고 나온다. */
export const MIN_OVERLAP = 5;
/** 한 사람이 한 표에서 들고 있는 항목 수 상한 — 원장이 무한히 크지 않게. */
const MAX_ITEMS_PER_VARIANT = 400;

export interface Match {
  win: string;
  lose: string;
}

/** 항목 → [이긴 수, 마주친 수]. */
export type TasteRow = Record<string, [number, number]>;

interface State {
  /** 사람 → 표 이름(variant) → 지문. */
  people: Record<string, Record<string, TasteRow>>;
}

export interface Agreement {
  handle: string;
  /** 얼마나 같은 쪽을 골랐나 (%). */
  agreePct: number;
  /** 견준 항목 수 — 이게 작으면 위 숫자는 의미가 없다. */
  overlap: number;
}

/** 승률 0~1. 안 마주쳤으면 null. */
export function rateOf(row: TasteRow, name: string): number | null {
  const cell = row[name];
  if (!cell || cell[1] <= 0) return null;
  return cell[0] / cell[1];
}

/**
 * 두 지문이 얼마나 같은 쪽을 보는가 (%).
 *
 * 겹치는 항목마다 승률 차이를 재고, 그 평균을 100에서 뺀다 — 완전히 같으면 100%,
 * 한쪽은 늘 고르고 한쪽은 늘 버리면 0%. 겹치는 게 적으면 **null**(모른다)이다.
 */
export function agreement(a: TasteRow, b: TasteRow, minOverlap = MIN_OVERLAP): { agreePct: number; overlap: number } | null {
  let sum = 0;
  let overlap = 0;
  for (const name of Object.keys(a)) {
    const mine = rateOf(a, name);
    const yours = rateOf(b, name);
    if (mine === null || yours === null) continue;
    sum += Math.abs(mine - yours);
    overlap += 1;
  }
  if (overlap < minOverlap) return null;
  return { agreePct: Math.round((1 - sum / overlap) * 1000) / 10, overlap };
}

/** 이 사람이 제일 좋아한 것들 — 많이 마주치고 많이 이긴 순. */
export function favorites(row: TasteRow, limit = 5): Array<{ name: string; rate: number; seen: number }> {
  return Object.entries(row)
    .filter(([, [, seen]]) => seen >= 2)
    .map(([name, [won, seen]]) => ({ name, rate: Math.round((won / seen) * 1000) / 10, seen }))
    .sort((x, y) => y.rate - x.rate || y.seen - x.seen)
    .slice(0, limit);
}

export class TasteStore {
  private state: State = { people: {} };

  constructor(private readonly file: string = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.load();
  }

  private load(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object' && raw.people) this.state = raw as State;
    } catch {
      /* 처음이거나 깨졌다 — 오늘부터 다시 쌓는다. 여기서 죽으면 놀이가 멈춘다. */
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.state), 'utf8');
    } catch {
      /* 못 적어도 놀이는 끝난다 — 지문은 곁가지다 */
    }
  }

  fingerprint(who: string, variant: string): TasteRow {
    return this.state.people[who]?.[variant] ?? {};
  }

  variants(who: string): string[] {
    return Object.keys(this.state.people[who] ?? {});
  }

  /**
   * 한 판의 맞대결을 지문에 더한다.
   *
   * 같은 판을 두 번 보내도 두 번 세는 게 **맞다** — 실제로 두 판을 논 것과 구분할 수 없고,
   * 취향은 「몇 번이나 그쪽을 골랐나」이기 때문이다. 대신 자기 자신과의 대결처럼
   * 말이 안 되는 줄은 버린다.
   */
  record(who: string, variant: string, matches: Match[]): TasteRow {
    const rows = (this.state.people[who] ??= {});
    const row = (rows[variant] ??= {});
    for (const match of matches) {
      const win = String(match?.win ?? '').trim();
      const lose = String(match?.lose ?? '').trim();
      if (!win || !lose || win === lose) continue;
      if (!row[win] && Object.keys(row).length >= MAX_ITEMS_PER_VARIANT) continue;
      if (!row[lose] && Object.keys(row).length >= MAX_ITEMS_PER_VARIANT) continue;
      row[win] = [(row[win]?.[0] ?? 0) + 1, (row[win]?.[1] ?? 0) + 1];
      row[lose] = [row[lose]?.[0] ?? 0, (row[lose]?.[1] ?? 0) + 1];
    }
    this.save();
    return row;
  }

  /**
   * 나와 취향이 가까운 사람 · 정반대인 사람.
   *
   * 같은 표(variant)를 논 사람끼리만 견준다 — 포켓몬 취향과 스팀 취향을 한 줄에 놓을 수 없다.
   * 겹치는 항목이 적은 사람은 아예 안 담는다(우연이 사람 얼굴을 하고 나온다).
   */
  neighbours(who: string, variant: string, limit = 3): { closest: Agreement[]; opposite: Agreement[] } {
    const mine = this.fingerprint(who, variant);
    const rows: Agreement[] = [];
    for (const [handle, byVariant] of Object.entries(this.state.people)) {
      if (handle === who) continue;
      const theirs = byVariant[variant];
      if (!theirs) continue;
      const got = agreement(mine, theirs);
      if (!got) continue;
      rows.push({ handle, agreePct: got.agreePct, overlap: got.overlap });
    }
    const sorted = rows.slice().sort((a, b) => b.agreePct - a.agreePct);
    /* 위에서 몇 명, 아래에서 몇 명을 뽑되 **겹치지 않게** 한다.
     * 사람이 둘뿐인데 셋씩 뽑으면 같은 사람이 양쪽에 서서
     * 「가장 비슷하고 동시에 가장 다른 사람」이 된다 — 그건 아무 말도 아니다. */
    const take = Math.min(limit, Math.max(1, Math.floor(sorted.length / 2)));
    return {
      closest: sorted.slice(0, take),
      opposite: sorted.slice(-take).reverse().filter((r) => !sorted.slice(0, take).includes(r)),
    };
  }

  /** 이 사람을 지운다 (계정 삭제가 부른다 — 취향은 그 사람 것이다). */
  forget(who: string): void {
    delete this.state.people[who];
    this.save();
  }
}

let shared: TasteStore | null = null;
export function getTasteStore(): TasteStore {
  return (shared ??= new TasteStore());
}
