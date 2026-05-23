/**
 * agent-channel-bridge — Discord ↔ agent-channel-bus 의 *thin* adapter
 * (TASK-KAR-018-LT-DIVERSITY, D-2).
 *
 * 왜 분리:
 * 본 모듈 = Discord *MessageCreate* 를 substrate(`agent-channel-bus`) 에
 * 비추는 단방향 publisher 만 담는다. 코어 정체성/LLM 호출/dispatch 로직 X.
 * 다른 adapter(KL/Web/CLI) 도 *같은 substrate* 에 같은 schema 로 publish
 * → daemon 입장에선 출처 무관(Discord 죽어도 KL 살아있으면 채널 입력 계속).
 *
 * 안전 바닥:
 *   - substrate 미가용(MEMO_REPO_PATH 미설정 / 채널 unsafe) = silent no-op.
 *     publish 실패가 봇 진행을 막지 X (best-effort, throw X).
 *   - 봇 자기 webhook(자기 utter) 도 publish — 모든 채널 흐름의 *전체 기록*
 *     이 substrate. 단 `coreId` 가 부여된 utter 는 `type='core-utter'` 로
 *     일관 분류 → 다른 daemon 이 echo loop 회피 가능 (own coreId 무시).
 *   - bot/system 메시지(코어 webhook X)는 publish X (잡음 차단).
 *
 * D-2 시점에는 *publish only*. subscribe 는 D-3 daemon 이 직접
 * `readRecentBusEvents` 로 tail. 향후 D-14 KL adapter 도 같은 publish API
 * 만 호출하면 됨 (Discord 의존 X — 본 모듈은 *publish 결정 표면* + Discord
 * 전용 추출은 `extractDiscordPublish` 가 담당).
 */
import type { Message } from 'discord.js';
import {
  appendBusEvent,
  type BusEvent,
  type BusEventRefs,
} from './agent-channel-bus';

/** Discord <@123…> 형식 user 멘션 1개 이상. */
const USER_MENTION_RX = /<@!?(\d{5,})>/g;

/**
 * 텍스트에서 코어 이름 멘션 파싱 (순수). known core id/displayName 둘 다
 * 매칭. 첫 단어 호명 + `@<name>` 형식 + 본문 중간 `@<name>` 모두 회수.
 * 멘션 우회(rate-limit bypass) 의 결정 입력 — daemon 이 본인 id 가
 * mentionedCoreIds 에 있으면 강제 평가.
 */
export function parseMentionedCoreIds(
  text: string,
  knownCores: { id: string; displayName?: string }[],
): string[] {
  const t = (text || '').toLowerCase();
  if (!t) return [];
  const out = new Set<string>();
  for (const c of knownCores) {
    const id = (c.id || '').toLowerCase();
    if (!id) continue;
    const names = [id];
    const dn = (c.displayName || '').toLowerCase();
    if (dn && dn !== id) names.push(dn);
    for (const n of names) {
      // `@name`, `name,`, `name:`, 단어 경계 — 일상 단어가 코어 id 와 같은
      // 경우 false-positive 위험 → `@` 접두 또는 호명 구두점 동반 시만.
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[\\s,])@${esc}(\\b|[\\s,:.!?])|(^|[\\s])${esc}\\s*[,:]`, 'u');
      if (re.test(t)) {
        out.add(c.id);
        break;
      }
    }
  }
  return Array.from(out);
}

/** Discord <@id> user 멘션 회수 (순수). */
export function parseMentionedUserIds(text: string): string[] {
  const out = new Set<string>();
  if (!text) return [];
  let m: RegExpExecArray | null;
  USER_MENTION_RX.lastIndex = 0;
  while ((m = USER_MENTION_RX.exec(text)) !== null) {
    out.add(m[1]);
  }
  return Array.from(out);
}

/** publish 입력 (Discord 전용 — adapter 가 추출해서 본 모듈에 넘김). */
export interface IncomingDiscordPublishOpts {
  /** 채널 id (bus dir key). */
  channelId: string;
  /** 메시지 id (replyToTs 등 향후). */
  messageId: string;
  /** 발화 시각 (Discord createdAt 또는 now). ISO 권장. */
  ts: string;
  /** 본문 (raw 그대로 — daemon 측에서 정규화). */
  text: string;
  /** 작성자 id. */
  authorId: string;
  /** 작성자 username (UX). */
  authorName: string;
  /** 봇/webhook 메시지 여부. */
  isBot: boolean;
  /** webhook 메시지면 webhookId. */
  webhookId?: string | null;
  /** 봇 자기 agent webhook 메시지인지 (코어 utter 분류 단서). */
  isOwnAgentWebhook: boolean;
  /** agent webhook 인 경우 코어 id (resolveCoreFromWebhook). */
  coreIdForWebhook?: string | null;
  /** answer/reply 가리키는 원본 ts (옵션). */
  replyToTs?: string;
}

/** 알려진 코어 목록 (멘션 파싱용). */
export interface KnownCoreSummary {
  id: string;
  displayName?: string;
}

/**
 * Discord 측에서 모아온 데이터를 BusEvent 로 publish (best-effort, throw X).
 *
 * 분류 규칙:
 *   - 봇 자기 agent webhook 이고 coreId 확정 = `core-utter` (코어 발화).
 *   - 그 외 봇/webhook = publish X (잡음 차단: 다른 봇 발화는 substrate 잡음).
 *   - 사람 사용자 = `channel-msg`.
 *
 * 반환 = publish 한 BusEvent (or null = skip). 호출자(main.ts)는 결과를
 * 확인할 필요 X — 비차단·로깅용만.
 */
export function publishIncomingDiscord(
  env: NodeJS.ProcessEnv,
  opts: IncomingDiscordPublishOpts,
  knownCores: KnownCoreSummary[] = [],
): BusEvent | null {
  if (!opts || !opts.channelId || !opts.text) return null;
  // 채널-msg 또는 코어-utter 외 잡음 차단.
  let type: 'channel-msg' | 'core-utter';
  let coreId: string | undefined;
  if (opts.isOwnAgentWebhook) {
    if (!opts.coreIdForWebhook) return null; // 코어 식별 못하면 skip (자기루프 차단)
    type = 'core-utter';
    coreId = opts.coreIdForWebhook;
  } else if (opts.isBot) {
    return null; // 외부 봇/webhook = 잡음
  } else {
    type = 'channel-msg';
  }
  const refs: BusEventRefs = {};
  const mentionedCoreIds = parseMentionedCoreIds(opts.text, knownCores);
  if (mentionedCoreIds.length > 0) refs.mentionedCoreIds = mentionedCoreIds;
  const mentionedUserIds = parseMentionedUserIds(opts.text);
  if (mentionedUserIds.length > 0) refs.mentionedUserIds = mentionedUserIds;
  if (opts.replyToTs) refs.replyToTs = opts.replyToTs;

  const event: BusEvent = {
    ts: opts.ts || new Date().toISOString(),
    source: 'discord',
    type,
    channelId: opts.channelId,
    coreId,
    authorName: opts.authorName,
    authorId: opts.authorId,
    text: opts.text,
    refs: Object.keys(refs).length > 0 ? refs : undefined,
  };
  return appendBusEvent(env, event) ? event : null;
}

/**
 * 본 PR 의 daemon (D-3) 도 core-utter publish 시 같은 함수 경유 — adapter
 * 와 substrate 사이의 *유일한 입구*. 향후 KL adapter 도 source='kl' 로
 * 같은 패턴 (외부 사용자 발화·코어 발화 둘 다 적합).
 */
export interface IncomingPublishOpts {
  source: string;
  channelId: string;
  ts?: string;
  text: string;
  authorId?: string;
  authorName?: string;
  coreId?: string;
  /** 'channel-msg' (외부 사용자) | 'core-utter' (코어 발화). */
  type: 'channel-msg' | 'core-utter';
  refs?: BusEventRefs;
}

export function publishToBus(
  env: NodeJS.ProcessEnv,
  opts: IncomingPublishOpts,
): BusEvent | null {
  if (!opts || !opts.channelId || !opts.text || !opts.type) return null;
  if (opts.type === 'core-utter' && !opts.coreId) return null;
  const event: BusEvent = {
    ts: opts.ts || new Date().toISOString(),
    source: opts.source || 'unknown',
    type: opts.type,
    channelId: opts.channelId,
    coreId: opts.coreId,
    authorName: opts.authorName,
    authorId: opts.authorId,
    text: opts.text,
    refs: opts.refs,
  };
  return appendBusEvent(env, event) ? event : null;
}

/**
 * Discord Message 객체에서 publish 옵션 추출 (Discord 의존부 isolation).
 * 호출자(main.ts) 가 멤버 데이터 접근 — 본 모듈은 Discord 타입 import 만.
 */
export function extractDiscordPublish(
  message: Message,
  helpers: {
    isOwnAgentWebhook: (webhookId: string | null | undefined) => boolean;
    coreIdForWebhook: (webhookId: string | null | undefined) => string | null;
  },
): IncomingDiscordPublishOpts {
  const webhookId = (message as { webhookId?: string | null }).webhookId ?? null;
  const own = helpers.isOwnAgentWebhook(webhookId);
  return {
    channelId: message.channel.id,
    messageId: message.id,
    ts: message.createdAt?.toISOString?.() || new Date().toISOString(),
    text: (message.content || '').trim(),
    authorId: message.author?.id || '',
    authorName: message.author?.username || message.author?.tag || 'unknown',
    isBot: !!message.author?.bot,
    webhookId,
    isOwnAgentWebhook: own,
    coreIdForWebhook: own ? helpers.coreIdForWebhook(webhookId) : null,
  };
}
