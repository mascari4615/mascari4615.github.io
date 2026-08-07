import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * 언제부터 알던 것인가.
 *
 * 「아는 것」은 한 장의 목록이라 **전부 똑같은 무게**로 놓여 있었다. 방금 들은 것과 몇 주
 * 함께 지내며 굳어진 것이 나란히 적혀 있고, 얘는 그 둘을 구분할 방법이 없었다.
 *
 * 그래서 이런 게 나온다 — 2분 전에 처음 들은 걸 「예전부터 알았잖아」라고 말한다. 사람은
 * 그 순간 **얘가 아무것도 기억 못 한다는 걸 안다.** 아는 척이 기억보다 더 크게 티가 난다.
 *
 * 반대쪽도 있다. 몇 주 내내 알던 것을 매번 처음 듣는 것처럼 다루면 함께 지낸 시간이 없다.
 *
 * 그래서 줄마다 **처음 본 날**과 **마지막으로 본 날**을 따로 들고 있는다. 「아는 것」 자체는
 * 안 건드린다 — 거기에 날짜를 섞어 적으면 다음에 졸일 때 그 날짜까지 재료가 되어 굳는다.
 */

export interface KnownStamp {
  /** 이 줄을 처음 본 때. */
  처음: number;
  /** 마지막으로 본 때. 사라졌다 돌아와도 처음은 안 바뀐다. */
  마지막: number;
}

export interface KnownStampsOptions {
  /** 남겨 둘 파일. 없으면 프로세스 안에서만 산다. */
  path?: string;
  now?: () => number;
}

/** 줄 하나를 견주기 좋게 다듬는다 — 앞머리 기호와 공백 차이로 딴 줄이 되지 않게. */
function 다듬기(line: string): string {
  return line.replace(/^[\s\-*·•]+/, '').replace(/\s+/g, ' ').trim();
}

export class KnownStamps {
  private readonly 표 = new Map<string, KnownStamp>();
  private readonly options: KnownStampsOptions;

  constructor(options: KnownStampsOptions = {}) {
    this.options = options;
    if (options.path !== undefined && existsSync(options.path)) {
      try {
        const raw = JSON.parse(readFileSync(options.path, 'utf8')) as Record<string, KnownStamp>;
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v?.처음 === 'number' && typeof v?.마지막 === 'number') this.표.set(k, v);
        }
      } catch {
        // 깨진 파일 때문에 기억 전체가 멈추면 안 된다. 날짜는 다시 쌓으면 된다.
      }
    }
  }

  /**
   * 지금의 「아는 것」과 맞춘다. 새 줄은 오늘부터, 있던 줄은 마지막 본 날만 갱신.
   *
   * **사라진 줄은 지우지 않는다.** 졸이는 쪽이 한 번 빠뜨렸다고 「처음 본 날」을 잃으면,
   * 다음에 돌아왔을 때 몇 주 알던 것이 갑자기 오늘 알게 된 것이 된다.
   */
  sync(known: string | null): void {
    const now = (this.options.now ?? Date.now)();
    // **새 줄이 생겼을 때만 파일에 남긴다.** 「마지막 본 날」이 바뀔 때마다 다시 쓰면 이
    // 함수를 매 turn 부를 수 없게 되고, 그러면 갱신 시점을 따로 챙겨야 한다 — 그 챙김을
    // 한 번 빠뜨리는 순간 날짜가 통째로 어긋난다.
    let 새것 = false;
    for (const line of (known ?? '').split('\n')) {
      const key = 다듬기(line);
      if (key === '') continue;
      const 있던것 = this.표.get(key);
      if (있던것 === undefined) {
        this.표.set(key, { 처음: now, 마지막: now });
        새것 = true;
      } else {
        있던것.마지막 = now;
      }
    }
    if (새것) this.save();
  }

  /** 이 줄을 언제부터 알았나. 모르면 null. */
  stampOf(line: string): KnownStamp | null {
    return this.표.get(다듬기(line)) ?? null;
  }

  get size(): number {
    return this.표.size;
  }

  /** 잘못 쌓인 줄을 지운다 — 「아는 것」에서 지울 때 같이 부른다. */
  forget(line: string): boolean {
    const 지웠나 = this.표.delete(다듬기(line));
    if (지웠나) this.save();
    return 지웠나;
  }

  private save(): void {
    if (this.options.path === undefined) return;
    try {
      mkdirSync(dirname(this.options.path), { recursive: true });
      writeFileSync(this.options.path, JSON.stringify(Object.fromEntries(this.표), null, 1), 'utf8');
    } catch {
      // 못 남겨도 이번 판에서는 안다. 다음에 다시 쌓인다.
    }
  }
}

/** 얼마나 오래 알던 것인가 — 사람이 쓰는 말로. */
export function 얼마나오래(stamp: KnownStamp, now: number): string | null {
  const 지난날 = Math.floor((now - stamp.처음) / (24 * 60 * 60_000));
  if (지난날 >= 14) return '오래전부터 알던';
  if (지난날 >= 3) return '며칠 전부터 알던';
  if (지난날 >= 1) return '어제오늘 알게 된';
  return '방금 알게 된';
}

/**
 * 두뇌에 얹을 한 줄 — **방금 알게 된 것만** 짚는다.
 *
 * 전부에 날짜를 붙이면 재료가 두 배로 불어나고, 재료가 넘치면 정작 중요한 게 밀린다.
 * 사고가 나는 건 한쪽뿐이다 — **방금 안 걸 예전부터 알던 것처럼 말하는 것.** 그것만 막는다.
 */
export function 갓알게된것(
  known: string | null,
  stamps: KnownStamps,
  now: number,
   최대 = 3,
): string {
  const 갓 = (known ?? '')
    .split('\n')
    .map((l) => 다듬기(l))
    .filter((l) => l !== '')
    .filter((l) => {
      const s = stamps.stampOf(l);
      return s !== null && now - s.처음 < 24 * 60 * 60_000;
    })
    .slice(0, 최대);
  if (갓.length === 0) return '';
  return (
    `이건 **오늘 처음 알게 된 것**이다: ${갓.join(' / ')}. ` +
    '예전부터 알던 것처럼 말하지 마라 — 방금 들은 걸 오래 알던 척하면 오히려 아무것도 ' +
    '기억 못 하는 티가 난다.'
  );
}
