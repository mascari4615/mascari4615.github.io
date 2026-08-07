import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 잘못된 것 모으기 — 고치려면 먼저 보여야 한다.
 *
 * 레퍼런스 쪽에서 만든 사람이 하는 일이 그것이다: **실패를 보고 고친다.** 검색 결과를 그대로
 * 읊는 걸 보고 그 기능을 껐고, 무너지는 걸 보고 코드를 고쳤다. 관찰이 먼저다.
 *
 * 우리 얘도 실패한다 — 입 앞에서 걸리고(19·37·40회차), 손을 못 쓰고, 두뇌가 죽는다.
 * **그런데 그게 전부 로그로만 흘러간다.** 나는 회차마다 로그를 들여다보지만 **조수님은
 * 볼 방법이 없다.** 35회차의 발동 기록은 「무엇이 켜졌나」를 보여 주고, 여기는 그 짝인
 * **「무엇이 잘못됐나」**다.
 *
 * **숫자만 세지 않는다.** 「걸림 12번」만 있으면 뭘 고쳐야 할지 모른다. 가장 최근 몇 개는
 * **실제 문장까지** 남긴다 — 고치는 데 필요한 건 셈이 아니라 그 자리다.
 */
export type TroubleKind = '걸림' | '못함' | '늦음' | '죽음';

export interface Trouble {
  kind: TroubleKind;
  /** 무슨 일이었나 (사람이 읽는 말). */
  what: string;
  at: number;
}

export interface TroublesOptions {
  path?: string;
  /** 종류마다 몇 개까지 실제 문장을 들고 있을지. */
  keepEach?: number;
  now?: () => number;
}

/** 잘못된 것들을 종류별로 모아 두는 것. */
export class Troubles {
  private counts = new Map<TroubleKind, number>();
  private recent: Trouble[] = [];

  constructor(private readonly options: TroublesOptions = {}) {
    const path = options.path;
    if (path !== undefined && existsSync(path)) {
      try {
        const 읽은것 = JSON.parse(readFileSync(path, 'utf8')) as { counts?: Record<string, number>; recent?: Trouble[] };
        for (const [k, n] of Object.entries(읽은것.counts ?? {})) this.counts.set(k as TroubleKind, n);
        this.recent = Array.isArray(읽은것.recent) ? 읽은것.recent : [];
      } catch {
        this.counts = new Map();
        this.recent = [];
      }
    }
  }

  /** 하나 겪었다. */
  hit(kind: TroubleKind, what: string): void {
    this.counts.set(kind, (this.counts.get(kind) ?? 0) + 1);
    this.recent.push({ kind, what: what.trim().slice(0, 120), at: (this.options.now ?? (() => Date.now()))() });

    // 종류마다 몇 개씩만 남긴다 — 한 종류가 쏟아지면 다른 종류가 통째로 밀려난다.
    const keep = this.options.keepEach ?? 3;
    const 남길것: Trouble[] = [];
    for (const k of ['걸림', '못함', '늦음', '죽음'] as TroubleKind[]) {
      남길것.push(...this.recent.filter((t) => t.kind === k).slice(-keep));
    }
    this.recent = 남길것.sort((a, b) => a.at - b.at);
    this.save();
  }

  /** 종류별 셈. */
  count(kind: TroubleKind): number {
    return this.counts.get(kind) ?? 0;
  }

  /** 남겨 둔 실제 자리들. */
  get all(): readonly Trouble[] {
    return this.recent;
  }

  private save(): void {
    const path = this.options.path;
    if (path === undefined) return;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ counts: Object.fromEntries(this.counts), recent: this.recent }, null, 2), 'utf8');
  }
}

/**
 * 사람이 읽는 표.
 *
 * **잦은 것을 위에** 둔다 — 한 번 있었던 일보다 자꾸 나는 일이 고칠 거리다.
 */
export function troublesReport(troubles: Troubles): string {
  const 종류 = (['걸림', '못함', '늦음', '죽음'] as TroubleKind[])
    .map((k) => ({ k, n: troubles.count(k) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);

  if (종류.length === 0) return '아직 걸린 게 없다.';

  const 머리 = 종류.map((x) => `${x.k} ${x.n}번`).join(' · ');
  const 자리들 = [...troubles.all]
    .sort((a, b) => b.at - a.at)
    .map((t) => `  [${t.kind}] ${t.what}`)
    .join('\n');

  return `${머리}\n\n최근에 실제로 있었던 일:\n${자리들}`;
}
