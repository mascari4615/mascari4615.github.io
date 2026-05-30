/**
 * forum-dedup — #team-work(agent-work forum)의 "TASK당 forum-post 1개" 불변식을
 * **예방(prevention)** 으로 보장. (TASK-KAR-150)
 *
 * 설계 원칙 (사용자 2026-05-30):
 *  1. **삭제하지 않는다.** 포스트 안에서 사람이 소통할 수 있다 → 스레드 삭제·복구는
 *     *최후 수단*(사람이 수동 결정, manual CLI = memo/scripts/forum-dedupe.mjs).
 *     봇의 자동 경로는 **절대 삭제 X**.
 *  2. 그러므로 "1개 유지"는 *지우는 게 아니라 안 만드는 것*으로 달성한다.
 *
 * 왜 (근본): 기존 dedup 은 로컬 원장(task-forum-bridge.jsonl) 하나에만 의존 =
 * 단일 실패점. 원장이 wipe/손상되면 backfill 이 전부 재생성 → 중복 폭발.
 * → dedup 의 *진실*은 원장이 아니라 Discord 에 실제 존재하는 스레드여야 한다.
 *
 * 2계층(둘 다 비파괴):
 *  - **예방**: backfill 이 생성 전 ground-truth(buildForumGroundTruth)로 존재 확인 →
 *    원장이 비어도 이미 있는 TASK 는 재생성 X.
 *  - **감지+heal+알림**: auditForumDupsOnce 가 부팅·주기로 중복 *감지*만 — 원장 heal
 *    (누락 entry 보충) + 중복 있으면 WARN 로그/알림. **삭제 안 함.** 사람이 보고 결정.
 */
import { channelIdFor } from '../services/channel-provision';
import {
  parseTaskId,
  appendTaskForumLink,
  lookupTaskForumLinkByTaskId,
} from './task-forum-bridge';

/** 구조적 부분집합 — 페이크 client 단위테스트 가능 (discord.js ThreadChannel 동형). */
export interface DedupThread {
  id: string;
  name: string;
  archived: boolean;
}

/**
 * 순수 — 스레드 목록을 taskId 별로 묶고 대표(canonical)/중복(dup) 계산.
 * canonical = 그룹 내 가장 최신(snowflake 최대) — backfill/reconciler 의 latest 정합.
 * taskId 없는 스레드(proposal/discovery 무-id)는 그룹화 X.
 *
 * ⚠ "dups" = 정보(감지)용. 본 모듈은 이걸로 *삭제하지 않는다*.
 */
export function planDedup(
  threads: DedupThread[],
  keep: 'newest' | 'oldest' = 'newest',
): {
  byTaskId: Map<string, DedupThread[]>;
  canonical: { taskId: string; postId: string }[];
  dups: DedupThread[];
  dupGroups: number;
} {
  const byTaskId = new Map<string, DedupThread[]>();
  for (const t of threads) {
    const id = parseTaskId(t.name);
    if (!id) continue;
    if (!byTaskId.has(id)) byTaskId.set(id, []);
    byTaskId.get(id)!.push(t);
  }
  const canonical: { taskId: string; postId: string }[] = [];
  const dups: DedupThread[] = [];
  let dupGroups = 0;
  for (const [taskId, group] of byTaskId) {
    group.sort((a, b) => (BigInt(b.id) > BigInt(a.id) ? 1 : -1)); // [0] = newest
    const chosen = keep === 'oldest' ? group[group.length - 1] : group[0];
    canonical.push({ taskId, postId: chosen.id });
    if (group.length > 1) {
      dupGroups += 1;
      for (const t of group) if (t.id !== chosen.id) dups.push(t);
    }
  }
  return { byTaskId, canonical, dups, dupGroups };
}

/** discord.js ForumChannel 의 active+archived 전체 스레드 열거 (best-effort, 읽기전용). */
async function listAllForumThreads(channel: any): Promise<DedupThread[]> {
  const out: DedupThread[] = [];
  try {
    const active = await channel.threads.fetchActive();
    for (const t of active.threads.values())
      out.push({ id: t.id, name: t.name ?? '', archived: Boolean(t.archived) });
  } catch {
    /* best-effort */
  }
  let before: unknown = undefined;
  for (let guard = 0; guard < 200; guard += 1) {
    let page: any;
    try {
      page = await channel.threads.fetchArchived({ type: 'public', before, limit: 100 });
    } catch {
      break;
    }
    const vals = [...page.threads.values()];
    for (const t of vals) out.push({ id: t.id, name: t.name ?? '', archived: true });
    if (!page.hasMore || vals.length === 0) break;
    const last = vals[vals.length - 1];
    before = last?.archivedTimestamp ?? last?.id;
    if (!before) break;
  }
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

export interface AuditDeps {
  logger?: Pick<Console, 'log' | 'warn'>;
  /** 중복 감지 시 호출(선택) — yawnbot 알림 등. 미주입 = 로그만. */
  notify?: (message: string) => void | Promise<void>;
}

export interface AuditResult {
  taskIds: number;
  dupGroups: number;
  dupThreads: number;
  healed: number;
  skipped?: boolean;
}

/**
 * 1회 감사 — Discord 실제 스레드 열거 → 중복 *감지* + 원장 heal(누락 보충).
 * **삭제 안 함.** 중복 발견 시 WARN 로그 + notify(있으면). 사람이 보고 결정.
 * 매 run healthy log(no-news-is-bad-news).
 */
export async function auditForumDupsOnce(
  client: any,
  env: NodeJS.ProcessEnv,
  deps: AuditDeps = {},
): Promise<AuditResult> {
  const logger = deps.logger ?? console;
  const base: AuditResult = { taskIds: 0, dupGroups: 0, dupThreads: 0, healed: 0 };

  const channelId = channelIdFor('agent-work', env);
  if (!channelId) {
    logger.log('[ForumDedup] agent-work 채널 미설정 — skip');
    return { ...base, skipped: true };
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.threads) {
    logger.log('[ForumDedup] 채널 fetch 실패 — skip');
    return { ...base, skipped: true };
  }

  const threads = await listAllForumThreads(channel);
  const { canonical, dups, dupGroups, byTaskId } = planDedup(threads);

  // 원장 heal — taskId 에 원장 entry 가 *없을 때만* canonical 로 보충(append).
  // 기존 entry 는 덮지 않음(사람이 소통중인 스레드 연속성 보존).
  let healed = 0;
  for (const c of canonical) {
    if (!lookupTaskForumLinkByTaskId(env, c.taskId)) {
      appendTaskForumLink(env, { taskId: c.taskId, postId: c.postId, channelId });
      healed += 1;
    }
  }

  logger.log(
    `[ForumDedup] taskIds=${byTaskId.size} dupGroups=${dupGroups} dupThreads=${dups.length} healed=${healed} (감지만 · 삭제 X)`,
  );

  if (dupGroups > 0) {
    const sample = [...byTaskId.entries()]
      .filter(([, g]) => g.length > 1)
      .slice(0, 5)
      .map(([id, g]) => `${id}×${g.length}`)
      .join(', ');
    const msg =
      `⚠ #team-work 중복 forum-post 감지: ${dupGroups}개 TASK / 잉여 ${dups.length}개 스레드 ` +
      `(${sample}${dupGroups > 5 ? ' …' : ''}). 자동 삭제 안 함 — 예방 누수 점검 + 필요시 수동 정리 ` +
      `(node memo/scripts/forum-dedupe.mjs --apply --delete).`;
    logger.warn(`[ForumDedup] ${msg}`);
    if (deps.notify) {
      try {
        await deps.notify(msg);
      } catch {
        /* best-effort */
      }
    }
  }
  return { taskIds: byTaskId.size, dupGroups, dupThreads: dups.length, healed };
}

/**
 * backfill 용 ground-truth — Discord 실제 스레드 기준 taskId → canonical postId 맵.
 * 원장이 비어/손상돼도 이미 있는 TASK 는 backfill 이 재생성 안 하게 하는 진실 소스.
 * 실패(채널 미설정/fetch 실패) = 빈 맵(backfill 은 원장 fallback).
 */
export async function buildForumGroundTruth(
  client: any,
  env: NodeJS.ProcessEnv,
): Promise<Map<string, string>> {
  const channelId = channelIdFor('agent-work', env);
  if (!channelId) return new Map();
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.threads) return new Map();
  const threads = await listAllForumThreads(channel);
  const { canonical } = planDedup(threads);
  return new Map(canonical.map((c) => [c.taskId, c.postId]));
}
