/**
 * team-room — 코어 바인딩 채널("팀 방") 판정 + 에이전트↔에이전트 루프 가드 4겹.
 *
 * KAR-018-A sub-A-2 (그릴-락 결정 2: ".active.json 3-튜플에 코어 바인딩된 채널 = 팀 방").
 * slice-3 = 골격 + 팀 방 owner 수신. webhook 송신·수용(sub-A-1) · 예산 엔진(sub-D)
 * 이 아래 훅을 채운다 (현재는 dormant — main.ts:220 가 webhook 을 upstream 에서 drop).
 *
 * 루프 가드 4겹 (정본 = memo TASK-KAR-018-A § 결정 2):
 *   ① 자기 webhook 무응답   ② (core,channel) cooldown
 *   ③ 예산 reserve(sub-D)   ④ 체인 깊이 상한 (사람/objective 없이 N연속 → pause)
 */
import type { Message } from 'discord.js';
import { CharacterService } from '../services/character-service';
import { channelIdFor } from '../services/channel-provision';

/**
 * 인스턴스 전용 에이전트 채널 (prod/dev 격리, KAR-018-W).
 * `YAWNBOT_AGENT_CHANNEL_ID` 설정 시 = 이 인스턴스는 *오직 그 채널만* 팀 방
 * 으로 취급 (.active.json·다른 채널 무시). 미설정(prod default) → 기존
 * .active.json 바인딩 동작 *불변*. 같은 서버에 prod+dev 공존 시 크로스-봇
 * 루프·검증오염 차단 = env 가 유일하게 인스턴스별로 다른 축(공유 파일 X).
 */
export function agentChannelId(): string | null {
  // channelIdFor 경유: prod(프로비저닝 OFF) → env YAWNBOT_AGENT_CHANNEL_ID 그대로
  // (prod 미설정 = null, 기존 .active.json 동작 불변). dev(ON) → 프로비저닝
  // 'agent-team'(team-bus) 우선, 없으면 env 폴백. 정본 = channel-provision.
  return channelIdFor('agent-team');
}

/** 채널이 "팀 방"인가 = .active.json 3-튜플에 코어가 바인딩됨 (DM 제외). */
export function isTeamRoom(
  cs: CharacterService,
  channelKey: string,
  isDM: boolean,
): boolean {
  if (isDM) return false;
  return cs.resolveCore(channelKey) !== null;
}

/**
 * 메시지가 팀 방에서 온 것인가 — isDM·channelKey 조립을 은닉 (main.ts 재사용).
 * env 격리 우선: `YAWNBOT_AGENT_CHANNEL_ID` 설정 시 *그 채널만* true
 * (dev 인스턴스가 prod 채널·.active.json 에 절대 반응 안 함, 역도 동일).
 */
export function isTeamRoomMessage(cs: CharacterService, message: Message): boolean {
  if (message.channel.isDMBased()) return false;
  const envCh = agentChannelId();
  if (envCh) return message.channel.id === envCh; // 인스턴스 전용 격리 모드
  const channelKey = CharacterService.channelKey({
    isDM: false,
    userId: message.author.id,
    channelId: message.channel.id,
  });
  return isTeamRoom(cs, channelKey, false);
}

// ── 가드 ① 자기 webhook 무시 ────────────────────────────────
// 봇이 webhook 으로 보낸 메시지 id 집합. sub-A-1 송신부가 register.
const ownWebhookMsgIds = new Set<string>();
const OWN_ID_CAP = 500;

export function registerOwnWebhookMessage(messageId: string): void {
  ownWebhookMsgIds.add(messageId);
  if (ownWebhookMsgIds.size > OWN_ID_CAP) {
    const first = ownWebhookMsgIds.values().next().value;
    if (first !== undefined) ownWebhookMsgIds.delete(first);
  }
}

export function isOwnWebhookMessage(messageId: string): boolean {
  return ownWebhookMsgIds.has(messageId);
}

// ── 가드 ② (core,channel) cooldown ─────────────────────────
const COOLDOWN_MS = Number(process.env.TEAM_ROOM_COOLDOWN_MS) || 4000;
const lastAgentTriggerAt = new Map<string, number>();

/** 통과 시 타임스탬프 갱신 후 true. cooldown 중이면 false (드롭). */
export function checkAndStampCooldown(core: string, channelId: string): boolean {
  const key = `${core}@${channelId}`;
  const now = Date.now();
  const last = lastAgentTriggerAt.get(key) ?? 0;
  if (now - last < COOLDOWN_MS) return false;
  lastAgentTriggerAt.set(key, now);
  return true;
}

// ── 가드 ③ 예산 reserve 훅 (sub-D 가 교체, default allow) ────
export type BudgetReserveFn = (ctx: { core: string; channelId: string }) => boolean;
let budgetReserve: BudgetReserveFn = () => true;

export function setBudgetReserve(fn: BudgetReserveFn): void {
  budgetReserve = fn;
}

export function reserveBudget(core: string, channelId: string): boolean {
  return budgetReserve({ core, channelId });
}

// ── 가드 ④ 체인 깊이 상한 ───────────────────────────────────
// 사람/objective 개입 없이 연속 에이전트-트리거 N 회 → pause.
const CHAIN_CAP = Number(process.env.TEAM_ROOM_CHAIN_CAP) || 6;
const chainDepth = new Map<string, number>();

/** 사람 발화면 체인 리셋(0), 에이전트 트리거면 +1. 상한 초과 = exceeded. */
export function bumpChain(
  channelId: string,
  triggeredByHuman: boolean,
): { depth: number; exceeded: boolean } {
  if (triggeredByHuman) {
    chainDepth.set(channelId, 0);
    return { depth: 0, exceeded: false };
  }
  const depth = (chainDepth.get(channelId) ?? 0) + 1;
  chainDepth.set(channelId, depth);
  return { depth, exceeded: depth > CHAIN_CAP };
}

export function resetChain(channelId: string): void {
  chainDepth.set(channelId, 0);
}
