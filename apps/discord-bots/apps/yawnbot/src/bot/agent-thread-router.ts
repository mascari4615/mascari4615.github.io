// 워커/팀 #team-bus 메시지 → TASK·proposal 당 Discord 스레드 라우팅 +
// 전문 청크. KAR-018-Y (TASK 스레드·단위메시지·트렁케이트 폐기) +
// KAR-018-THR (재기동 churn 견고 — 영속 매핑·이름검색·proposal pXXX).
//
// 순수(extractTaskId/extractRouteKey/chunkForDiscord) = 전수 단위검증.
// 상태/Discord IO = makeThreadRouter (client 주입, 봇 프로세스에서만 wired).
//
// THR 진단: 기존 `taskThreads` Map 만 보면 봇 재기동마다 같은 TASK 에
// 중복 스레드 생성 → 옛 스레드 고아·OneDay 아카이브. 새 lookup 순서:
//   1) in-memory map (cold-cache 가속)
//   2) deps.lookupPersistedThread (substrate jsonl — 재기동 견고)
//   3) 채널의 기존 스레드 *이름검색* (active + archived — 파일 매핑 부재해도 살아남)
//   4) 생성 + recordPersistedThread (다음 재기동에 hit)
// = "기존 이름검색" 단독으로도 중복버그 해소, 파일기록은 durability+UX+audit
// 추가 (스펙 § 설계 정합).
//
// proposal(pXXX) = 별 경로: `agent-bus.appendProposalMsg` 가 이미 카드↔스레드
// 매핑 영속화 중 (`.claude/agent-proposal-msgs.jsonl`) → router 가 *소비*
// 하기만 하면 됨 (router 가 생성 X — 카드 송신 시점에 이미 startThread 완료).
// 미매치 = fallback (메인채널) — 옛 동작 보존(회귀 0).
import {
  type Client,
  type TextChannel,
  type ThreadChannel,
  ChannelType,
  ThreadAutoArchiveDuration,
} from 'discord.js';

/** 메시지에서 TASK id 추출 (스레드 키). 없으면 null = 팀-공통(메인채널). */
export function extractTaskId(msg: string): string | null {
  // TASK-<PREFIX>-<번호>[-<서브>] (KAR/WM/KL/YB 등). 첫 매치 = 그 틱 대상.
  const m = msg.match(/TASK-[A-Z]{2,6}-\d+(?:-[A-Za-z0-9]+)?/);
  return m ? m[0] : null;
}

/**
 * proposal id (p + 8자 이상 hex) — `proposalId` 결정적 id (agent-bus).
 * 카드 송신 시 `appendProposalMsg` 가 영속화 → router 가 그 카드 스레드로
 * 메시지 라우팅. TASK id 와 별 키네임스페이스(서로 안 겹침).
 */
export function extractProposalId(msg: string): string | null {
  // `\b` 경계로 단어 중간 우연 매치 차단. 8자 이상 = proposalId minLen
  // 정합 (16진 hex 가정 — 8자 4억 가지로 충돌 비현실, 결정적 dedup 키).
  const m = msg.match(/\bp[0-9a-f]{8,}\b/);
  return m ? m[0] : null;
}

/** 메시지가 어느 스레드로 갈지: TASK > proposal > 팀공통(null). */
export type RouteKey =
  | { kind: 'task'; id: string }
  | { kind: 'proposal'; id: string };

export function extractRouteKey(msg: string): RouteKey | null {
  const task = extractTaskId(msg);
  if (task) return { kind: 'task', id: task }; // TASK 우선 (더 구체적)
  const prop = extractProposalId(msg);
  if (prop) return { kind: 'proposal', id: prop };
  return null;
}

/**
 * Discord 메시지 한도(plain content 2000)로 안전 분할. 줄 경계 우선,
 * 한 줄이 한도 초과면 강제 슬라이스. 빈 입력=빈 배열. 순수·결정적.
 */
export function chunkForDiscord(text: string, max = 1900): string[] {
  const t = (text || '').trim();
  if (!t) return [];
  const out: string[] = [];
  let buf = '';
  for (const rawLine of t.split('\n')) {
    let line = rawLine;
    while (line.length > max) {
      // 한 줄 자체가 한도 초과 → 강제 분할
      if (buf) {
        out.push(buf);
        buf = '';
      }
      out.push(line.slice(0, max));
      line = line.slice(max);
    }
    const cand = buf ? `${buf}\n${line}` : line;
    if (cand.length > max) {
      if (buf) out.push(buf);
      buf = line;
    } else {
      buf = cand;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 영속 매핑 1건 (substrate jsonl 1줄과 동형). */
export interface PersistedThreadRec {
  channelId: string;
  threadId: string;
}

export interface ThreadRouterDeps {
  /** agent-team 채널 id 해석 (override 우선 → webhook-routes). */
  resolveChannelId: () => string | null;
  /** taskId 없는 팀-공통 메시지 폴백(기존 embed 송신). */
  fallback: (msg: string) => void;
  /**
   * TASK id → 영속 매핑(재기동 견고). 없으면 null. 미주입 = 옛 동작
   * (in-memory only — 회귀 0). substrate: agent-task-thread-store.
   */
  lookupPersistedThread?: (taskId: string) => PersistedThreadRec | null;
  /**
   * 새 스레드 생성·이름검색 hit 시 1줄 append (best-effort, throw X).
   * 미주입 = 기록 skip (in-memory only).
   */
  recordPersistedThread?: (
    taskId: string,
    channelId: string,
    threadId: string,
  ) => void;
  /**
   * proposal id (pXXX) → 카드 스레드 lookup. 없으면 null. 미주입 =
   * proposal 메시지가 메인채널 fallback (옛 동작). substrate:
   * agent-bus.appendProposalMsg (`.claude/agent-proposal-msgs.jsonl`).
   * router 는 *소비* 만 — 카드 스레드는 announceProposal 가 만들고 기록.
   */
  lookupProposalThread?: (proposalId: string) => PersistedThreadRec | null;
}

/**
 * 채널 안 스레드를 이름으로 찾는다 (active + archived). 사람·다른 봇이
 * rename 했거나 영속 기록 부재 시에도 살아남는 두 번째 안전망. 첫 매치
 * (active 우선) 반환 — 같은 이름 다중 = 옛 봇 버그(중복 생성)의 잔재라
 * 가장 *활성* 인 것을 채택. 모두 실패·throw = null (호출자가 생성).
 */
async function findThreadByName(
  ch: TextChannel,
  name: string,
): Promise<ThreadChannel | null> {
  try {
    const active = await ch.threads.fetchActive().catch(() => null);
    const hitA = active?.threads?.find?.((t) => t.name === name) ?? null;
    if (hitA) return hitA;
  } catch {
    /* fall through to archived */
  }
  try {
    const archived = await ch.threads.fetchArchived().catch(() => null);
    return archived?.threads?.find?.((t) => t.name === name) ?? null;
  } catch {
    return null;
  }
}

/** 스레드가 아카이브돼 있으면 unarchive 시도 (best-effort, throw X). */
async function ensureUnarchived(thread: ThreadChannel): Promise<void> {
  if (thread.archived) {
    await thread.setArchived(false).catch(() => undefined);
  }
}

/**
 * msg → TASK·proposal 스레드 라우터. 매핑 있으면 그 스레드 전문 청크
 * 게시, 없으면 fallback(팀-공통). 실패는 전부 swallow(가용성 우선 —
 * 게시 실패가 워커 막지 X).
 *
 * 라우팅:
 *   · TASK-XXX-NNN(-sub)  → 채널의 TASK 스레드 (영속 lookup → 이름검색
 *                            → 생성 + 기록). 재기동 churn 견고.
 *   · pXXX(proposal id)   → 카드 스레드 lookup (announceProposal 가 생성·
 *                            기록). 미발견 = fallback (메인채널 — 옛 동작).
 *   · 매치 없음 (팀공통)   → fallback (옛 동작).
 */
export function makeThreadRouter(
  client: Client,
  deps: ThreadRouterDeps,
): (msg: string) => void {
  const taskThreads = new Map<string, string>(); // taskId → threadId (cold cache)
  const creating = new Map<string, Promise<string | null>>(); // 동시 dedupe

  async function getOrCreateThread(
    channelId: string,
    taskId: string,
  ): Promise<string | null> {
    const known = taskThreads.get(taskId);
    if (known) return known;
    const inflight = creating.get(taskId);
    if (inflight) return inflight;
    const p = (async (): Promise<string | null> => {
      // 1) 영속 매핑 (재기동 견고) — 기록된 threadId 살아있나 확인.
      const persisted = deps.lookupPersistedThread?.(taskId) ?? null;
      if (persisted?.threadId) {
        const fetched = await client.channels
          .fetch(persisted.threadId)
          .catch(() => null);
        if (fetched && fetched.isThread()) {
          await ensureUnarchived(fetched);
          taskThreads.set(taskId, fetched.id);
          return fetched.id;
        }
        // fetch 실패·스레드 삭제됨 → 다음 단계(이름검색·생성)
      }

      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) return null;

      // 2) 채널 기존 스레드 이름검색 (active + archived). 옛 봇이 만든·
      //    영속 기록 부재 스레드를 *재사용* — 중복 생성 차단의 2차 안전망.
      const existing = await findThreadByName(ch, taskId.slice(0, 100));
      if (existing) {
        await ensureUnarchived(existing);
        taskThreads.set(taskId, existing.id);
        deps.recordPersistedThread?.(taskId, channelId, existing.id);
        return existing.id;
      }

      // 3) 생성 + 영속 기록.
      const thread = await ch.threads
        .create({
          name: taskId.slice(0, 100),
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          type: ChannelType.PublicThread,
          reason: `KAR-018-THR agent-team TASK thread (${taskId})`,
        })
        .catch(() => null);
      if (!thread) return null;
      taskThreads.set(taskId, thread.id);
      deps.recordPersistedThread?.(taskId, channelId, thread.id);
      // 메인채널 포인터 = 스레드 생성 시 1회만 (스팸 0). 이름검색·영속
      // hit 경로는 포인터 송신 X — 사용자는 이미 그 스레드 알고 있음.
      await ch
        .send(`🧵 **${taskId}** 작업 스레드 → <#${thread.id}>`)
        .catch(() => undefined);
      return thread.id;
    })();
    creating.set(taskId, p);
    try {
      return await p;
    } finally {
      creating.delete(taskId);
    }
  }

  return (msg: string): void => {
    void (async () => {
      try {
        const route = extractRouteKey(msg);
        const channelId = deps.resolveChannelId();
        if (!route || !channelId) {
          deps.fallback(msg);
          return;
        }
        let threadId: string | null;
        if (route.kind === 'proposal') {
          // 카드 스레드는 announceProposal 가 startThread → appendProposalMsg.
          // router 가 생성 X (cross-substrate write 평행 정의 회피, 평행정의0).
          // 미발견 = fallback (메인채널 — 옛 동작·회귀 0).
          const hit = deps.lookupProposalThread?.(route.id) ?? null;
          threadId = hit?.threadId || null;
        } else {
          threadId = await getOrCreateThread(channelId, route.id);
        }
        if (!threadId) {
          deps.fallback(msg);
          return;
        }
        const thread = await client.channels
          .fetch(threadId)
          .catch(() => null);
        if (!thread || !thread.isThread() || !thread.isSendable()) {
          deps.fallback(msg);
          return;
        }
        const chunks = chunkForDiscord(msg);
        for (const c of chunks) {
          await thread.send({ content: c }).catch(() => undefined);
        }
      } catch {
        /* 게시 실패가 워커/판정 막지 X (가용성 우선) */
      }
    })();
  };
}
