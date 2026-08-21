import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { checkDrift } from './drift';

/**
 * 미리 지어 둔 짧은 대사 창고.
 *
 * 88회차에 오간 말을 셌다. 얘가 한 말 320개 중 **145개가 글자 그대로 반복**이었고, 가장 많은
 * 것이 「…계속할 거야?」 18번이었다. 전부 손으로 적어 둔 고정 대꾸다. 그때 고르는 규칙을
 * 손봤지만 견줘 보니 **규칙이 문제가 아니라 후보가 셋뿐인 게 문제**였다.
 *
 * 답은 표를 늘리는 게 아니다 — 늘려도 스무 번이면 또 돈다. **미리 지어 둔다.** 얘가 한가할
 * 때 두뇌한테 몇 마디 지어 달래서 담아 두고, 실제로 닿았을 때는 담아 둔 것을 꺼내 쓴다.
 * 그러면 매번 다르고, 사람이 기다리는 시간은 0 이다(닿음에 2초 뒤 문장이 오면 그건 반응이
 * 아니라 답변이다 — `touch.ts` 의 전제).
 *
 * **지어 온 것을 그대로 믿지 않는다.** 짧은 대꾸 자리에 설명문이나 존댓말이 들어오면 그게
 * 곧 인격 표류다. 걸러 낸 뒤 담고, 담을 게 없으면 **아무것도 안 담는다** — 손으로 적어 둔
 * 기본 표가 그대로 폴백이라 비어 있어도 얘는 멀쩡히 대꾸한다.
 */
export interface StockOptions {
  /** 담아 둘 파일. 없으면 이 프로세스에서만 산다. */
  path?: string;
  /** 두뇌에게 지어 달라고 하는 자리. null = 못 지었다. */
  지어오기: (prompt: string) => Promise<string | null>;
  /** 지금 누구인가 — 인격이 바뀌면 앞 인격이 지은 말은 안 쓴다. */
  whom?: () => string | null;
  /**
   * 누구로서 짓나 — 인격 글 그대로.
   *
   * **이게 없으면 맨 두뇌가 짓는다.** 실측(89회차): 인사 대꾸를 부탁했더니 「안녕하세요 /
   * 반갑습니다 / 뵙게 되어 좋습니다」가 왔고 전부 걸러졌다. 짓는 자리에 인격이 안 실리면
   * 걸러 내는 잣대가 아무리 좋아도 담을 게 안 남는다.
   */
  인격글?: () => string | null;
  /** 한 갈래에 담아 둘 최대 개수. */
  max?: number;
  /** 이 길이를 넘으면 대꾸가 아니라 설명이다. */
  maxChars?: number;
  log?: (message: string) => void;
}

interface 담긴것 {
  whom: string;
  말들: string[];
}

/** 지어 온 덩어리에서 쓸 만한 줄만 골라낸다. */
export function select(raw: string, maxChars2 = 20): string[] {
  const produced: string[] = [];
  for (const line of raw.split('\n')) {
    // 목록 기호·번호·따옴표는 「말」이 아니라 포장이다. 벗겨서 본다.
    const stripped = line
      .replace(/^\s*(\d+[.)]|[-*•])\s*/, '')
      .replace(/^["'「『]|["'」』]$/g, '')
      .trim();
    if (stripped === '') continue;
    if (stripped.length > maxChars2) continue;
    // 짧은 자리에 존댓말·도우미 말투가 끼면 그게 표류다 (drift 와 같은 잣대).
    if (checkDrift(stripped, { maxChars: maxChars2 }).drifted) continue;
    if (produced.includes(stripped)) continue;
    produced.push(stripped);
  }
  return produced;
}

export class lineStore {
  private readonly 담김 = new Map<string, 담긴것>();
  private readonly 채우는중 = new Set<string>();
  private readonly max: number;
  private readonly maxChars: number;
  private readonly log: (message: string) => void;

  constructor(private readonly options: StockOptions) {
    this.max = options.max ?? 12;
    this.maxChars = options.maxChars ?? 20;
    this.log = options.log ?? (() => {});
    this.읽기();
  }

  private get 지금누구(): string {
    return this.options.whom?.() ?? '';
  }

  private 읽기(): void {
    const path = this.options.path;
    if (path === undefined || existsSync(path) === false) return;
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, 담긴것>;
      for (const [kind, value] of Object.entries(parsed)) {
        if (Array.isArray(value?.말들)) this.담김.set(kind, { whom: value.whom ?? '', 말들: [...value.말들] });
      }
    } catch {
      // 깨진 파일 하나 때문에 얘가 못 뜨면 안 된다 — 없는 셈 치고 다시 채운다.
    }
  }

  private 쓰기(): void {
    const path = this.options.path;
    if (path === undefined) return;
    try {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(Object.fromEntries(this.담김), null, 2), 'utf8');
    } catch {
      // 못 남겨도 이번 판은 멀쩡하다. 다음에 다시 지으면 된다.
    }
  }

  /** 이 갈래에 지금 몇 개 담겨 있나 (지금 인격 것만 센다). */
  remaining(kind2: string): number {
    const item = this.담김.get(kind2);
    if (item === undefined || item.whom !== this.지금누구) return 0;
    return item.말들.length;
  }

  /**
   * 하나 꺼낸다 — **꺼낸 것은 없어진다.** 담아 둔 것을 다시 쓰면 결국 또 도는 말이 된다.
   * 비었으면 `null` — 부르는 쪽이 손으로 적어 둔 표로 물러선다.
   */
  raise(kind3: string): string | null {
    const item2 = this.담김.get(kind3);
    if (item2 === undefined || item2.whom !== this.지금누구 || item2.말들.length === 0) return null;
    const text = item2.말들.shift() as string;
    this.쓰기();
    return text;
  }

  /**
   * 이 갈래를 채워 둔다. 이미 넉넉하면 두뇌를 안 부른다 — 한가할 때 부르는 자리라
   * 값이 싸 보여도 부를 이유가 없을 때는 안 부른다.
   *
   * 같은 갈래를 두 번 겹쳐 채우지 않는다(느린 두뇌를 여러 번 부르면 진짜 대답이 밀린다).
   */
  async 채우기(kind4: string, request: string, goal = this.max): Promise<number> {
    if (this.채우는중.has(kind4)) return 0;
    const now = this.remaining(kind4);
    if (now >= Math.min(goal, this.max)) return 0;
    this.채우는중.add(kind4);
    try {
      const count = Math.min(goal, this.max) - now;
      const persona = this.options.인격글?.() ?? null;
      const raw = await this.options.지어오기(
        [
          persona === null ? null : `${persona}\n\n---`,
          persona === null ? null : '위 인격 그대로, 아래 자리에서 할 말을 지어라.',
          request,
          `${count}개만, 한 줄에 하나씩. ${this.maxChars}자 안쪽. **반말**로. 번호·따옴표·설명 없이 말만.`,
        ]
          .filter((line2) => line2 !== null)
          .join('\n\n')
      );
      if (raw === null) return 0;
      const toWrite = select(raw, this.maxChars);
      if (toWrite.length === 0) {
        // **뭐가 왔길래 다 걸러졌는지 같이 남긴다.** 「걸러졌다」만 있으면 두뇌가 이상한
        // 건지 거르는 잣대가 빡빡한 건지 못 가른다 — 실제로 첫 판에 그래서 막혔다.
        this.log(`[대사] ${kind4} — 지어 온 게 다 걸러졌다: ${raw.trim().slice(0, 120).replace(/\n/g, ' / ')}`);
        return 0;
      }
      const item3 = this.담김.get(kind4);
      const already = item3 !== undefined && item3.whom === this.지금누구 ? item3.말들 : [];
      const merged = [...already, ...toWrite.filter((text2) => notStored(already, text2))].slice(0, this.max);
      this.담김.set(kind4, { whom: this.지금누구, 말들: merged });
      this.쓰기();
      this.log(`[대사] ${kind4} — ${toWrite.length}개 담았다 (총 ${merged.length})`);
      return toWrite.length;
    } catch (e) {
      // 못 지어도 대꾸는 나간다. 조용히 넘기지 말고 왜 못 지었는지는 남긴다.
      this.log(`[대사] ${kind4} — 못 지었다: ${(e as Error).message}`);
      return 0;
    } finally {
      this.채우는중.delete(kind4);
    }
  }
}

/** 아직 안 담긴 말인가 (같은 말을 두 벌 담지 않게). */
function notStored(already2: readonly string[], text3: string): boolean {
  return already2.includes(text3) === false;
}
