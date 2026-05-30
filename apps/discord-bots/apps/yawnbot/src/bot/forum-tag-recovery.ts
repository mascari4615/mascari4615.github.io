/**
 * forum-tag-recovery — #team-work 포럼 포스트 태그 복원.
 *
 * 문제: channel-provision 이 setAvailableTags 를 ID 없이 호출하면 Discord 가
 * availableTags 에 새 ID 를 발급 → 기존 포스트의 appliedTags (구 ID) 가 전부
 * invalid. 봇 재시작마다 모든 포스트에서 태그 소실.
 *
 * 이 모듈은 부팅 1회 실행 — 활성 스레드 전수 확인 후 손상된 태그를
 * ledger(proposal/task) 에서 재구성해 복원. 미추적 포스트는 제목 파싱으로
 * best-effort 복원.
 *
 * 멱등 — 태그가 이미 유효하면 skip. 실패 best-effort (throw X).
 */
import { channelIdFor } from '../services/channel-provision';
import { lookupProposalByThreadId } from './agent-bus';
import { lookupTaskForumLinkByPostId } from './task-forum-bridge';
import type { ForumKind, ForumStatus, ForumDomain, AvailableTag } from './forum-post';

// ── Discord.js 구조적 부분집합 (페이크 테스트 호환) ──

interface RecoveryThreadLike {
  id: string;
  name: string;
  appliedTags: string[];
  setAppliedTags(tagIds: string[]): Promise<unknown>;
}

interface RecoveryChannelLike {
  id: string;
  availableTags: AvailableTag[];
  threads: {
    fetchActive(): Promise<{ threads: Map<string, RecoveryThreadLike> }>;
  };
}

export interface RecoveryClientLike {
  channels: {
    fetch(id: string): Promise<RecoveryChannelLike | null>;
  };
}

// ── tag 그룹 상수 ──

const KIND_NAMES: ForumKind[] = ['proposal', 'task', 'worker-report', 'discovery'];
const STATUS_NAMES: ForumStatus[] = ['pending', 'in-progress', 'approved', 'rejected', 'done'];
const DOMAIN_NAMES: ForumDomain[] = ['WM', 'KAR', 'YB', 'KL'];

export interface RecoveryResult {
  checked: number;
  fixed: number;
  skipped: number;
}

function tagIdsForGroup(available: AvailableTag[], names: string[]): Set<string> {
  const byName = new Map(available.map((t) => [t.name, t.id]));
  const ids = new Set<string>();
  for (const name of names) {
    const id = byName.get(name);
    if (id) ids.add(id);
  }
  return ids;
}

function resolveTagId(available: AvailableTag[], name: string): string | undefined {
  return available.find((t) => t.name === name)?.id;
}

/** TASK-WM-NNN → 'WM', TASK-KAR-NNN → 'KAR' 등. 미인식 = 'KAR'. */
function domainFromTaskId(taskId: string): ForumDomain {
  const m = /TASK-([A-Z]+)-/.exec(taskId);
  if (!m) return 'KAR';
  const p = m[1];
  if (p === 'WM') return 'WM';
  if (p === 'KL') return 'KL';
  if (p === 'YB') return 'YB';
  return 'KAR';
}

/** coreId 또는 proposal id 문자열에서 도메인 추론. */
function domainFromStr(s: string): ForumDomain {
  const lower = s.toLowerCase();
  if (lower.startsWith('wm')) return 'WM';
  if (lower.startsWith('kl')) return 'KL';
  if (lower.startsWith('yb') || lower === 'echo') return 'YB';
  return 'KAR';
}

/**
 * #team-work 포럼 채널의 활성 스레드 태그를 전수 점검·복원.
 *
 * - 태그가 유효(모든 IDs 가 현 availableTags 에 존재) + 3 그룹(kind·status·domain)
 *   전부 커버 = skip.
 * - 손상 스레드: proposal 원장 → task 원장 → 제목 파싱 순으로 메타 복원.
 */
export async function recoverForumTagsOnce(
  client: RecoveryClientLike,
  env: NodeJS.ProcessEnv,
): Promise<RecoveryResult> {
  const result: RecoveryResult = { checked: 0, fixed: 0, skipped: 0 };

  const channelId = channelIdFor('agent-work', env);
  if (!channelId) {
    console.log('[forum-tag-recovery] agent-work 채널 미설정 — skip');
    return result;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !Array.isArray(channel.availableTags)) {
    console.log('[forum-tag-recovery] 채널 fetch 실패 또는 availableTags 없음 — skip');
    return result;
  }

  const validIds = new Set(channel.availableTags.map((t) => t.id));
  const kindIds = tagIdsForGroup(channel.availableTags, KIND_NAMES);
  const statusIds = tagIdsForGroup(channel.availableTags, STATUS_NAMES);
  const domainIds = tagIdsForGroup(channel.availableTags, DOMAIN_NAMES);

  let fetchedThreads: Map<string, RecoveryThreadLike>;
  try {
    const fetched = await channel.threads.fetchActive();
    fetchedThreads = fetched.threads;
  } catch (e) {
    console.error('[forum-tag-recovery] fetchActive 실패:', e instanceof Error ? e.message : e);
    return result;
  }

  for (const [, thread] of fetchedThreads) {
    result.checked++;

    const tagsValid = thread.appliedTags.every((id) => validIds.has(id));
    const kindCovered = thread.appliedTags.some((id) => kindIds.has(id));
    const statusCovered = thread.appliedTags.some((id) => statusIds.has(id));
    const domainCovered = thread.appliedTags.some((id) => domainIds.has(id));

    if (tagsValid && kindCovered && statusCovered && domainCovered) {
      result.skipped++;
      continue;
    }

    // 메타 복원 — task 원장 우선(더 specific), proposal 원장, 제목 파싱 순.
    let kind: ForumKind = 'proposal';
    let status: ForumStatus = 'pending';
    let domain: ForumDomain = 'KAR';

    const taskLink = lookupTaskForumLinkByPostId(env, thread.id);
    if (taskLink) {
      kind = 'task';
      domain = domainFromTaskId(taskLink.taskId);
      status = 'in-progress';
    } else {
      const proposalEntry = lookupProposalByThreadId(env, thread.id);
      if (proposalEntry) {
        kind = 'proposal';
        domain = domainFromStr(proposalEntry.coreId || proposalEntry.id);
        status = 'pending';
      } else {
        // 미추적 — 제목 파싱 best-effort
        const taskTitleMatch = /\[TASK-([A-Z]+)-\d+\]/.exec(thread.name);
        if (taskTitleMatch) {
          kind = 'task';
          const prefix = taskTitleMatch[1];
          if (prefix === 'WM') domain = 'WM';
          else if (prefix === 'KL') domain = 'KL';
          else if (prefix === 'YB') domain = 'YB';
          else domain = 'KAR';
          status = 'in-progress';
        }
        // else: 기본(proposal / pending / KAR) 유지
      }
    }

    const newTagIds: string[] = [];
    const kindId = resolveTagId(channel.availableTags, kind);
    const statusId = resolveTagId(channel.availableTags, status);
    const domainId = resolveTagId(channel.availableTags, domain);
    if (kindId) newTagIds.push(kindId);
    if (statusId) newTagIds.push(statusId);
    if (domainId) newTagIds.push(domainId);

    try {
      await thread.setAppliedTags(newTagIds);
      result.fixed++;
      console.log(
        `[forum-tag-recovery] 복원: "${thread.name}" (${thread.id}) → [${kind}, ${status}, ${domain}]`,
      );
    } catch (e) {
      console.error(
        '[forum-tag-recovery] setAppliedTags 실패:',
        thread.id,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.log(
    `[forum-tag-recovery] 완료 — checked=${result.checked} fixed=${result.fixed} skipped=${result.skipped}`,
  );
  return result;
}
