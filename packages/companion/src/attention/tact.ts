import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import type { Attention, AttentionDecision, ThinkInput } from '../types';

export interface TactOptions {
  /** 사람이 직접 말 건 채널 — 눈치 볼 것 없이 바로 답한다. */
  bypassChannels?: readonly string[];
  /** 스스로 말 거는 간격의 하한. */
  cooldownMs?: number;
  /** 이 시간 넘게 손을 안 대고 있으면 자리를 비운 것으로 본다 — 빈 자리에 말 걸지 않는다. */
  awayAfterMs?: number;
  /** 손을 놓은 지 이만큼 지나면 「막힌 것 같다」로 본다 — 이때가 말 걸 만한 때. */
  stuckAfterMs?: number;
  now?: () => number;
  /** 마지막 입력 이후 흐른 시간(ms). 못 재면 null. */
  idleMs?: () => number | null;
}

/**
 * 눈치 — 「지금 말 걸어도 되나」를 실제로 따진다.
 *
 * 주기적으로 무조건 한 마디 하는 건 동반자가 아니라 알림이다. 세 가지를 본다:
 *
 * 1. **자리에 있나** — 오래 손을 안 댔으면 없는 사람이다. 말하지 않는다.
 * 2. **손을 놀리고 있나** — 타이핑 중이면 몰입해 있는 것이다. 끊지 않는다.
 * 3. **아까랑 같은 화면인가** — 변한 게 없으면 새로 할 말도 없다.
 *
 * 말 걸 만한 순간은 「자리에 있는데 잠깐 손을 놓은 때」다. 막혔거나 쉬는 때이고,
 * 사람이 곁에서 말을 거는 것도 대개 그 틈이다.
 */
export function tactfulAttention(options: TactOptions = {}): Attention {
  const bypass = new Set(options.bypassChannels ?? ['web', 'terminal']);
  const cooldownMs = options.cooldownMs ?? 180_000;
  const awayAfterMs = options.awayAfterMs ?? 15 * 60_000;
  const stuckAfterMs = options.stuckAfterMs ?? 20_000;
  const now = options.now ?? (() => Date.now());
  const idleMs = options.idleMs ?? windowsIdleMs;

  let lastWindowTitle: string | null = null;

  return {
    name: '눈치',
    shouldRespond(input: ThinkInput): AttentionDecision {
      const { sensation, recent } = input;

      if (bypass.has(sensation.channel)) {
        return { respond: true, reason: '나한테 직접 건 말' };
      }

      let lastSaidAt: number | null = null;
      for (const entry of recent) {
        if (entry.role === 'said') lastSaidAt = entry.at;
      }
      if (lastSaidAt !== null && now() - lastSaidAt < cooldownMs) {
        return { respond: false, reason: `방금 말했다 (${Math.round((now() - lastSaidAt) / 1000)}초 전)` };
      }

      const idle = idleMs();
      if (idle !== null) {
        if (idle > awayAfterMs) {
          return { respond: false, reason: `자리에 없다 (${Math.round(idle / 60000)}분째 조용)` };
        }
        if (idle < stuckAfterMs) {
          return { respond: false, reason: '한창 손을 놀리는 중 — 끊지 않는다' };
        }
      }

      // 같은 창을 계속 보고 있고 방금도 그 얘길 했으면, 또 할 말은 없다.
      const title = typeof sensation.meta?.windowTitle === 'string' ? sensation.meta.windowTitle : null;
      if (title !== null && title !== '' && title === lastWindowTitle) {
        lastWindowTitle = title;
        return { respond: false, reason: '아까랑 같은 화면이다' };
      }
      if (title !== null) lastWindowTitle = title;

      return { respond: true, reason: idle === null ? '말 걸 만한 때' : `${Math.round(idle / 1000)}초째 손을 놓고 있다` };
    },
  };
}

/** 마지막 키보드·마우스 입력 이후 흐른 시간. 못 재면 null (그 판단은 건너뛴다). */
export function windowsIdleMs(): number | null {
  if (process.platform !== 'win32') return null;
  const script = join(dirname(__filename), '..', '..', 'assets', 'idle-ms.ps1');
  try {
    const output = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], {
      timeout: 8000,
      windowsHide: true,
      encoding: 'utf8',
    });
    const value = Number(output.trim().split('\n').pop()?.trim());
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}
