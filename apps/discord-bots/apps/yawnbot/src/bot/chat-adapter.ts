/**
 * ChatAdapter — yawnbot multi-channel outbound 추상화 (TASK-KAR-110 Phase 2 substrate).
 *
 * OpenClaw 갭 #1: yawnbot 의 outbound (embed/text/webhook) 가 Discord 직접 의존
 * → ChatAdapter interface 로 추상화하면 Slack/Telegram 같은 채널도 동일 caller 가 호출 가능.
 *
 * laptop-ops 의 `chat-adapter.ts` 와 *동일 의도* (monorepo cross-repo = 코드 복제 불가피).
 * Phase 2 진행 시 점진 마이그:
 *  - Phase 2.1 (다음) — `agent-webhook.ts` 의 *plain text* fallback (WebhookPermissionError 분기) 마이그
 *  - Phase 2.2 — `digest-webhook.ts` 의 rich embed → `sendRich({title, body, fields})` 추상
 *  - Phase 2.3 — agent-cadence/decisions/dialogue 가 ChatAdapter 만 의존
 *
 * NOTE: 본 substrate 자체 = 새 호출처 0 (Phase 2.1 진입 후 첫 use). 데드 인터페이스
 * 회피 = Phase 2.1 commit 같이 본 PR 안에 박는 게 정합 — 다음 cycle 진입 시.
 */

export type ChatKind = 'discord' | 'slack' | 'generic';

export interface ChatSendResult {
  ok: boolean;
  status: number;
}

export interface ChatAdapter {
  kind: ChatKind;
  send(payload: { text: string }): Promise<ChatSendResult>;
}

/** URL 패턴 추론 (env _KIND 명시 불요). */
export function detectKind(url: string): ChatKind {
  if (/discord(?:app)?\.com\/api\/webhooks/.test(url)) return 'discord';
  if (/hooks\.slack\.com\/services/.test(url)) return 'slack';
  return 'generic';
}

/** kind 별 outbound payload schema. */
export function buildPayload(kind: ChatKind, text: string): Record<string, string> {
  switch (kind) {
    case 'discord':
      return { content: text };
    case 'slack':
      return { text };
    case 'generic':
    default:
      return { text };
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;

export function createAdapter(
  url: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): ChatAdapter {
  const kind = detectKind(url);
  return {
    kind,
    async send({ text }) {
      const resp = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(kind, text)),
      });
      return { ok: resp.ok, status: resp.status };
    },
  };
}
