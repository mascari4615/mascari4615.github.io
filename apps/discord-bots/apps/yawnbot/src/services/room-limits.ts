/**
 * 방 라우트의 상한 (change.copresence-hardening 3단계).
 *
 * 커서와 연산은 **로그인 없이** 밀어 넣을 수 있다. 그래야 익명도 같이 쓸 수 있기 때문이다.
 * 그런데 상한이 하나도 없었다 — 한 사람이 초당 수천 번을 보내면 방에 있는 **모두의** 화면으로
 * 그만큼 퍼진다. 팬아웃이 있는 자리에서 무제한 입력은 상한이 아니라 확성기다.
 *
 * 왜 사람(IP)이 아니라 **참가자** 기준인가: 같은 카페·같은 학교는 IP 가 하나다.
 * IP 로 재면 한 사람의 폭주가 옆자리 사람을 같이 벌한다.
 *
 * 넘친 것은 **조용히 버린다**. 커서 좌표는 지나가면 값이 0 이라, 「너무 빠르다」를
 * 돌려주는 것 자체가 또 하나의 소음이다.
 */

/** 물통 하나 — 초당 `rate` 만큼 차고, 최대 `burst` 만큼 담긴다. */
interface Bucket {
    tokens: number;
    at: number;
}

export interface LimitSpec {
    /** 초당 허용 횟수 */
    rate: number;
    /** 한 번에 몰아 쓸 수 있는 최대 */
    burst: number;
}

/** 커서 — 화면은 20/초면 부드럽다. 30 은 그보다 넉넉하고, 60 까지 몰아 쓸 수 있다. */
export const MOVE_LIMIT: LimitSpec = { rate: 30, burst: 60 };

/** 연산 — 사람이 치는 글자는 이보다 느리다. */
export const OP_LIMIT: LimitSpec = { rate: 20, burst: 40 };

/**
 * 같은 IP 하나에 걸리는 지붕 (change.identity-one 3단계 잔여).
 *
 * 참가자 기준 상한만 있으면, 한 사람이 창을 여럿 열어 **참가자를 늘리는 방식**으로 그 상한을
 * 우회한다. 그래서 IP 위에 지붕을 하나 더 얹는다 — 한 집·한 사무실에 사람이 여럿일 수 있으니
 * 참가자 몫의 네 배로 넉넉히 잡는다. 좁히려는 것이 아니라 **폭주만** 막는 자리다.
 */
export const MOVE_IP_LIMIT: LimitSpec = { rate: 120, burst: 240 };
export const OP_IP_LIMIT: LimitSpec = { rate: 80, burst: 160 };

/** 연산 하나의 크기 상한. 이걸 넘는 것은 글이 아니라 짐이다. */
export const OP_MAX_BYTES = 8 * 1024;

/** 중첩 깊이 상한 — 깊은 것을 그대로 흘려보내면 받는 쪽 브라우저가 먼저 죽는다. */
export const OP_MAX_DEPTH = 8;

export class RoomLimiter {
    private buckets = new Map<string, Bucket>();

    constructor(private readonly spec: LimitSpec) {}

    /** 지금 한 번 써도 되나. 되면 하나 쓰고 true. */
    take(key: string, now = Date.now()): boolean {
        const bucket = this.buckets.get(key);
        if (!bucket) {
            this.buckets.set(key, { tokens: this.spec.burst - 1, at: now });
            return true;
        }
        const gained = ((now - bucket.at) / 1000) * this.spec.rate;
        bucket.tokens = Math.min(this.spec.burst, bucket.tokens + gained);
        bucket.at = now;
        if (bucket.tokens < 1) return false;
        bucket.tokens -= 1;
        return true;
    }

    /** 나간 사람의 물통은 버린다 — 안 그러면 방문자 수만큼 영원히 쌓인다. */
    forget(key: string): void {
        this.buckets.delete(key);
    }

    /** 오래 안 쓴 물통을 버린다(가득 찬 것은 없는 것과 같다). */
    sweep(now = Date.now(), idleMs = 60_000): void {
        for (const [key, bucket] of this.buckets) {
            if (now - bucket.at > idleMs) this.buckets.delete(key);
        }
    }

    get size(): number {
        return this.buckets.size;
    }
}

/** 연산 하나가 실어도 되는 것인가 — 크기와 깊이만 본다(뜻은 여전히 안 읽는다). */
export function opTooBig(op: unknown): 'size' | 'depth' | null {
    let text: string;
    try {
        text = JSON.stringify(op ?? null);
    } catch {
        return 'depth'; // 순환 참조 = 크기를 잴 수 없는 것
    }
    if (Buffer.byteLength(text, 'utf8') > OP_MAX_BYTES) return 'size';
    return depthOf(op) > OP_MAX_DEPTH ? 'depth' : null;
}

function depthOf(value: unknown, depth = 1): number {
    if (depth > OP_MAX_DEPTH + 1 || value === null || typeof value !== 'object') return depth;
    let deepest = depth;
    for (const child of Object.values(value as Record<string, unknown>)) {
        deepest = Math.max(deepest, depthOf(child, depth + 1));
        if (deepest > OP_MAX_DEPTH + 1) break;
    }
    return deepest;
}
