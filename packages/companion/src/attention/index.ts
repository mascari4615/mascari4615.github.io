import type { Attention, AttentionDecision, ThinkInput } from '../types';

/** 느낀 건 전부 응답. 가장 단순한 기준 — 대화형 몸(터미널·채팅)의 기본값. */
export const alwaysRespond: Attention = {
  name: 'always',
  shouldRespond(): AttentionDecision {
    return { respond: true, reason: '항상 응답' };
  },
};

/** 절대 응답 안 함 — 「듣기만」 모드. 기억은 계속 쌓인다. */
export const neverRespond: Attention = {
  name: 'never',
  shouldRespond(): AttentionDecision {
    return { respond: false, reason: '듣기만 하는 중' };
  },
};

export interface CooldownOptions {
  /** 직전 발화 후 이만큼 지나야 다시 말한다 (ms). */
  cooldownMs: number;
  /** 사람이 직접 말을 건 채널은 쿨다운을 건너뛴다. */
  bypassChannels?: readonly string[];
  now?: () => number;
}

/**
 * 쿨다운 — 스스로 말 거는 몸(화면 감시·시계 tick)이 수다스러워지는 걸 막는다.
 *
 * 판단 근거를 *기억* 에서 읽는다: 마지막 발화 시각을 별도 상태로 들고 있지 않으므로,
 * 프로세스를 껐다 켜도(파일 기억이면) 쿨다운이 이어진다.
 */
export function cooldownAttention(options: CooldownOptions): Attention {
  const bypass = new Set(options.bypassChannels ?? []);
  const now = options.now ?? (() => Date.now());
  return {
    name: `cooldown(${options.cooldownMs}ms)`,
    shouldRespond(input: ThinkInput): AttentionDecision {
      if (bypass.has(input.sensation.channel)) {
        return { respond: true, reason: `${input.sensation.channel} 은 직접 말 건 채널` };
      }
      let lastSaidAt: number | null = null;
      for (const entry of input.recent) {
        if (entry.role === 'said') lastSaidAt = entry.at;
      }
      if (lastSaidAt === null) return { respond: true, reason: '아직 한 번도 말한 적 없음' };
      const elapsed = now() - lastSaidAt;
      if (elapsed >= options.cooldownMs) {
        return { respond: true, reason: `마지막 말한 지 ${Math.round(elapsed / 1000)}초 지남` };
      }
      return { respond: false, reason: `방금 말했음 (${Math.round(elapsed / 1000)}초 전) — 참는다` };
    },
  };
}
