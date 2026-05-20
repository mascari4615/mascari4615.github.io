/**
 * 작업 카드 substrate — 1포스트 = 1 흐름 객체 (TASK-KAR-018-LT-FORUM P2).
 *
 * 비전: discovery → proposal → in-progress → verdict → done 이
 * *같은 forum-post* 의 시간축 전이. 카드(starter embed) edit + 태그 토글 +
 * 스레드 메시지 push 가 같은 객체 위에 누적. 평행 기록 X.
 *
 * 단일 seam — announceProposal · worker-report · verdict · archive 가
 * 전부 이 모듈 4 함수만 호출. 이 모듈 삭제 = forum 흐름 전체 작동 X
 * (deletion test, code-style.md § Deep Modules).
 *
 * 채널 = `agent-work` 논리 키 (channel-spec.json type=GuildForum,
 *        availableTags 12 / 3 그룹: kind(3)+status(5)+domain(4)).
 * 안전: channelId null (provision OFF + env 미설정) = null 반환 (degraded,
 *       호출자가 본인 폴백 결정 — 기존 #team-bus 텍스트 등).
 */
import { channelIdFor } from '../services/channel-provision';

/** 진화 가능한 포스트 = 1 흐름 객체 핸들. */
export interface ForumPostHandle {
  /** 포스트 = 스레드 id (forum-post 는 thread). */
  postId: string;
  /** team-work forum 채널 id. */
  channelId: string;
}

export type ForumKind = 'proposal' | 'worker-report' | 'discovery';
export type ForumStatus = 'pending' | 'in-progress' | 'approved' | 'rejected' | 'done';
export type ForumDomain = 'WM' | 'KAR' | 'YB' | 'KL';

const ALL_STATUS: ForumStatus[] = [
  'pending',
  'in-progress',
  'approved',
  'rejected',
  'done',
];

// ── discord.js v14 ForumChannel / ThreadChannel / Message 의 구조적
//    부분집합. 페이크 client 단위 테스트 가능, 실 코드 변경 0 (deep module). ──

export interface AvailableTag {
  id: string;
  name: string;
}

export interface StarterMessageLike {
  edit(opts: { embeds?: unknown[]; content?: string }): Promise<unknown>;
}

export interface ThreadChannelLike {
  id: string;
  /** 현재 적용된 태그 id 목록 (discord.js 동형). */
  appliedTags: string[];
  send(opts: { content?: string; embeds?: unknown[] }): Promise<unknown>;
  fetchStarterMessage(): Promise<StarterMessageLike | null>;
  setAppliedTags(tagIds: string[]): Promise<unknown>;
  setArchived(archived: boolean): Promise<unknown>;
}

export interface ForumChannelLike {
  id: string;
  /** GuildForumChannel 식별 — 페이크/실 모두 명시. */
  type: number;
  availableTags: AvailableTag[];
  threads: {
    create(opts: {
      name: string;
      message: { embeds?: unknown[]; content?: string };
      appliedTags?: string[];
      autoArchiveDuration?: number;
    }): Promise<ThreadChannelLike>;
    /** 진화/종결 시 postId 로 thread 다시 fetch (discord.js ThreadManager.fetch 동형). */
    fetch(id: string): Promise<ThreadChannelLike | null>;
  };
}

export interface ClientLike {
  channels: {
    fetch(id: string): Promise<ForumChannelLike | null>;
  };
}

/** 태그 이름들 → 채널 availableTags 의 id 들. 누락은 silent skip(spec 동기 lag). */
function resolveTagIds(
  available: AvailableTag[],
  wantNames: string[],
): string[] {
  const byName = new Map(available.map((t) => [t.name, t.id]));
  return wantNames
    .map((n) => byName.get(n))
    .filter((id): id is string => typeof id === 'string');
}

/**
 * 진입 — 1 흐름 객체 생성. 호출자: announceProposal / announceWorkerReport /
 * discovery 카드화.
 *
 * @returns null = forum 채널 미프로비저닝 + env 미설정 (호출자가 폴백 결정).
 */
export async function createForumPost(
  client: ClientLike,
  env: NodeJS.ProcessEnv,
  args: {
    kind: ForumKind;
    domain: ForumDomain;
    title: string;
    embed: unknown;
    /** 첫 스레드 메시지 (atlas voiced intro 등). 비면 스레드 메시지 X. */
    intro?: string;
  },
): Promise<ForumPostHandle | null> {
  const channelId = channelIdFor('agent-work', env);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !Array.isArray(channel.availableTags)) return null;
  const tagIds = resolveTagIds(channel.availableTags, [
    args.kind,
    'pending',
    args.domain,
  ]);
  const name = (args.title || '(제목 없음)').slice(0, 100);
  const thread = await channel.threads.create({
    name,
    message: { embeds: [args.embed] },
    appliedTags: tagIds,
    autoArchiveDuration: 1440,
  });
  if (args.intro) {
    await thread.send({ content: args.intro.slice(0, 1900) }).catch(() => {});
  }
  return { postId: thread.id, channelId: channel.id };
}

/**
 * 진화 — 같은 포스트의 시간축 전이. 호출자: deliberation verdict /
 * worker 진행 노트 / TASK 매칭 / done 마킹.
 *
 * - embedEdit = starter message embed 갱신 (카드 본문 진화)
 * - statusTag = 기존 status 태그 1개를 새 값으로 교체 (kind/domain 보존)
 * - threadMessage = 스레드에 한 줄 누적 (verdict reason, 진행 노트 등)
 *
 * silent best-effort — 채널/메시지 fetch 실패 = degraded(throw X).
 */
export async function evolveForumPost(
  client: ClientLike,
  handle: ForumPostHandle,
  change: {
    embedEdit?: unknown;
    statusTag?: ForumStatus;
    threadMessage?: string;
  },
): Promise<void> {
  const channel = await client.channels
    .fetch(handle.channelId)
    .catch(() => null);
  if (!channel) return;
  const thread = await fetchThread(channel, handle.postId);
  if (!thread) return;
  if (change.embedEdit !== undefined) {
    const starter = await thread.fetchStarterMessage().catch(() => null);
    if (starter) {
      await starter.edit({ embeds: [change.embedEdit] }).catch(() => {});
    }
  }
  if (change.statusTag) {
    const statusIds = new Set(
      resolveTagIds(channel.availableTags, ALL_STATUS),
    );
    const next = thread.appliedTags.filter((id) => !statusIds.has(id));
    const newStatusId = resolveTagIds(channel.availableTags, [
      change.statusTag,
    ])[0];
    if (newStatusId) next.push(newStatusId);
    await thread.setAppliedTags(next).catch(() => {});
  }
  if (change.threadMessage) {
    await thread
      .send({ content: change.threadMessage.slice(0, 1900) })
      .catch(() => {});
  }
}

/**
 * 종결 — done 태그 토글된 포스트를 native archive 로 접음. lock=false 유지 →
 * 사람 retro 코멘트는 archive 해제·재open 가능 (Discord native UI).
 */
export async function archiveForumPost(
  client: ClientLike,
  handle: ForumPostHandle,
): Promise<void> {
  const channel = await client.channels
    .fetch(handle.channelId)
    .catch(() => null);
  if (!channel) return;
  const thread = await fetchThread(channel, handle.postId);
  if (!thread) return;
  await thread.setArchived(true).catch(() => {});
}

async function fetchThread(
  channel: ForumChannelLike,
  postId: string,
): Promise<ThreadChannelLike | null> {
  return channel.threads.fetch(postId).catch(() => null);
}
