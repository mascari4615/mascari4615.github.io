/**
 * agent-webhook — 스킨별 Discord Webhook identity (KAR-018-A sub-A-1, slice-4).
 *
 * 그릴-락 결정 1: 봇 1개 유지(gateway/slash/수신), *출력만* 방당 webhook 으로
 * username=스킨 displayName / avatar=스킨 frontmatter avatar_url(있을 때만 — 시각 날조 X).
 * 봇이 channel.createWebhook() 로 자동 생성·캐시·재사용 (채널별 수동 0).
 *
 * 권한 미부여(Manage Webhooks 없음) = graceful: WebhookPermissionError throw →
 * caller 가 일반 message.reply 로 fallback (봇은 계속 응답, identity 만 미적용).
 * 권한 부여 즉시 자동 업그레이드 (재배포 불요 — 캐시 miss 시 createWebhook 재시도).
 */
import { TextChannel, Webhook } from 'discord.js';
import type { CharacterCard } from '../services/character-service';
import { registerOwnWebhookMessage } from './team-room';

/** 봇이 만든 webhook 식별 마커 (재사용 키). */
const AGENT_WEBHOOK_NAME = 'yawnbot-agent';

/** Manage Webhooks 권한 부재 등으로 webhook 경로 불가 — caller 가 fallback. */
export class WebhookPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookPermissionError';
  }
}

// channelId → Webhook 캐시 (생성·fetch 비용 회피, per-channel rate limit 정합)
const webhookCache = new Map<string, Webhook>();

// 우리(봇)가 만든/소유한 agent webhook 의 id 집합.
// webhook id 는 *생성·fetch 시점에 확정* → per-message-id 추적의
// register-after-send race 가 원천 부재 (KAR-018-A 루프 회귀 근본 fix).
// 봇=채널당 webhook 1개를 모든 스킨이 공유 + agent↔agent 는 dispatcher(sub-B)
// 가 내부 구동 → inbound webhookId ∈ 본 집합이면 *항상* 우리 발화 → drop 안전.
const ownAgentWebhookIds = new Set<string>();

/** inbound 메시지의 webhookId 가 우리 agent webhook 인가 (race-free 루프가드). */
export function isOwnAgentWebhook(webhookId: string | null | undefined): boolean {
  return !!webhookId && ownAgentWebhookIds.has(webhookId);
}

function isMissingPermission(err: unknown): boolean {
  const e = err as { code?: number; message?: string };
  return e?.code === 50013 || /missing permissions/i.test(e?.message ?? '');
}

/** 채널의 봇-소유 agent webhook 을 가져오거나 생성 (캐시). */
async function getOrCreateWebhook(channel: TextChannel): Promise<Webhook> {
  const cached = webhookCache.get(channel.id);
  if (cached) return cached;

  const botId = channel.client.user?.id;
  try {
    const hooks = await channel.fetchWebhooks();
    const mine = hooks.find(
      (h) => h.name === AGENT_WEBHOOK_NAME && h.owner?.id === botId,
    );
    const hook =
      mine ??
      (await channel.createWebhook({
        name: AGENT_WEBHOOK_NAME,
        reason: 'yawnbot agent identity (KAR-018-A)',
      }));
    webhookCache.set(channel.id, hook);
    ownAgentWebhookIds.add(hook.id); // race-free 루프가드 (send 전에 확정)
    return hook;
  } catch (err: unknown) {
    if (isMissingPermission(err)) {
      throw new WebhookPermissionError(
        `채널 ${channel.id}: Manage Webhooks 권한 없음 — 봇 역할에 권한 1회 부여 필요. 일반 응답으로 fallback.`,
      );
    }
    throw err;
  }
}

export interface SkinSendPayload {
  content: string;
  files?: unknown[];
  components?: unknown[];
  /** embed 카드도 *에이전트 정체* webhook 으로 (KAR-018-V R-5 정체통일). */
  embeds?: unknown[];
}

/**
 * 스킨 identity 로 webhook 송신. username=card.displayName,
 * avatarURL=card.frontmatter.avatar_url(있을 때만). threadId 지정 시 스레드로.
 * 보낸 메시지 id 는 루프가드 ①(자기 webhook 무응답)에 register.
 * @throws WebhookPermissionError 권한 부재 시 (caller fallback).
 */
export async function sendAsSkin(
  channel: TextChannel,
  card: CharacterCard,
  payload: SkinSendPayload,
  opts?: { threadId?: string },
): Promise<string | null> {
  const hook = await getOrCreateWebhook(channel);
  const avatarURL = card.frontmatter?.avatar_url || undefined;
  const sent = await hook.send({
    // embeds-only(빈 content) 허용 → undefined (discord.js 빈문자열 거부 회피)
    content: payload.content || undefined,
    username: card.displayName || card.name,
    avatarURL,
    files: payload.files as never,
    components: payload.components as never,
    embeds: payload.embeds as never,
    threadId: opts?.threadId,
  });
  // hook.send 는 message(id 포함) 반환 — 카드 정체통일(R-5)이 이 id 로
  // channel.messages.fetch→react/startThread (APIMessage↔Message 우회).
  if (sent?.id) {
    registerOwnWebhookMessage(sent.id);
    return sent.id;
  }
  return null;
}

/** 채널 webhook 캐시 무효화 (webhook 삭제·갱신 시). */
export function invalidateWebhookCache(channelId: string): void {
  webhookCache.delete(channelId);
}
