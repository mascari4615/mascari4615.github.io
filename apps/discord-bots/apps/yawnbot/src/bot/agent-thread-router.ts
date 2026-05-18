// 워커/팀 #team-bus 메시지 → TASK 당 Discord 스레드 라우팅 + 전문 청크.
// KAR-018-Y (사용자: "내용 짤림 근본해결 — TASK 스레드·단위메시지·트렁케이트
// 폐기"). 트렁케이트 = 정보손실 = Sexy X. yawnbot=1차 정보 인터페이스.
//
// 순수(extractTaskId/chunkForDiscord) = 전수 단위검증. 상태/Discord IO =
// makeThreadRouter (client 주입, 봇 프로세스에서만 wired).
import {
  type Client,
  ChannelType,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import {
  readTaskThread,
  writeTaskThread,
} from './task-thread-store';

/**
 * 메시지에서 스레드 키 추출. 없으면 null = 팀-공통(메인채널).
 *
 * 1순위 = TASK id (TASK-<PREFIX>-<번호>[-<서브>], KAR/WM/KL/YB 등 — 회귀 0).
 * 2순위 = 제안 id (proposalId = `p`+8 hex, proposal.ts). KAR-018-THR §흡수(A):
 * 제안 카드 관련 메시지의 키가 pXXX 라 기존 정규식 매칭 0 → null → 메인채널
 * fallback 이었음. pXXX 도 스레드 키로 인정해 제안 숙의가 *제안 전용 스레드*
 * 로 묶이게 한다(agent-bus announceProposal 가 만든 `제안 pXXX:…` 스레드를
 * name 검색이 재사용).
 */
export function extractTaskId(msg: string): string | null {
  const t = msg.match(/TASK-[A-Z]{2,6}-\d+(?:-[A-Za-z0-9]+)?/);
  if (t) return t[0];
  const p = msg.match(/\bp[0-9a-f]{8}\b/); // proposalId 형식
  return p ? p[0] : null;
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

export interface ThreadRouterDeps {
  /** agent-team 채널 id 해석 (override 우선 → webhook-routes). */
  resolveChannelId: () => string | null;
  /** taskId 없는 팀-공통 메시지 폴백(기존 embed 송신). */
  fallback: (msg: string) => void;
  /** memo repo 경로 — TASK frontmatter `discord_thread` 영속 IO (없으면 파일영속 skip, 이름검색은 유지). */
  memoRoot?: string | null;
}

/**
 * getOrCreateThread lookup 의 *주입 가능 seam* (Discord/FS 무관, 전수 단위검증).
 * 순서: in-memory → TASK 파일 기록 → 채널 기존 스레드 이름검색 → 생성.
 * 한 단계라도 결과 = 캐시·기록 backfill 후 즉시 반환(중복생성 0).
 */
export interface ThreadResolveOps {
  cacheGet: (key: string) => string | undefined;
  cacheSet: (key: string, threadId: string) => void;
  /** TASK 파일 기록 (영속 — 재기동 내성). 비-TASK(pXXX)=null. */
  recordedGet: (key: string) => string | null;
  /** TASK 파일 write-back (best-effort, 비-TASK=no-op). */
  recordedSet: (key: string, threadId: string) => void;
  /** 스레드 id 가 아직 살아있나(fetch 가능). stale 기록 무효화용. */
  isAlive: (threadId: string) => Promise<boolean>;
  /** 채널 active+archived 스레드에서 key 이름의 기존 스레드 검색. */
  findByName: (key: string) => Promise<string | null>;
  /** 새 스레드 생성. */
  create: (key: string) => Promise<string | null>;
}

/**
 * 스레드 lookup 순서 정본 (스펙 §설계 2). 순수·결정적 — Discord/FS 는 ops
 * 주입. "기존 이름검색" 단독으로도 재기동-중복버그 해소, 파일기록은
 * durability+UX(클릭)+audit 추가(스펙 §설계 2 괄호).
 */
export async function resolveTaskThread(
  key: string,
  ops: ThreadResolveOps,
): Promise<string | null> {
  const mem = ops.cacheGet(key);
  if (mem) return mem;

  const rec = ops.recordedGet(key);
  if (rec && (await ops.isAlive(rec))) {
    ops.cacheSet(key, rec);
    return rec;
  }

  // 기록 없음/stale → 채널에 같은 이름 스레드가 *이미* 있나 (재기동 churn
  // 단독 해소 지점 — 맵 비어도 중복생성 X). 찾으면 기록 backfill.
  const found = await ops.findByName(key);
  if (found) {
    ops.cacheSet(key, found);
    ops.recordedSet(key, found);
    return found;
  }

  const created = await ops.create(key);
  if (created) {
    ops.cacheSet(key, created);
    ops.recordedSet(key, created);
  }
  return created;
}

/**
 * msg → TASK 스레드 라우터. taskId 있으면 그 TASK 전용 public thread
 * (채널당 1회 생성·재사용) 에 *전문 청크* 게시 + 메인채널 1줄 포인터
 * (스레드 생성 시 1회만, 스팸 0). taskId 없으면 fallback(팀-공통).
 * 실패는 전부 swallow(가용성 우선 — 게시 실패가 워커 막지 X).
 */
export function makeThreadRouter(
  client: Client,
  deps: ThreadRouterDeps,
): (msg: string) => void {
  const taskThreads = new Map<string, string>(); // key → threadId (캐시)
  const creating = new Map<string, Promise<string | null>>(); // 동시 dedupe
  const memoRoot = deps.memoRoot?.trim() || '';

  async function getOrCreateThread(
    channelId: string,
    taskId: string,
  ): Promise<string | null> {
    const inflight = creating.get(taskId);
    if (inflight) return inflight;

    const p = resolveTaskThread(taskId, {
      cacheGet: (k) => taskThreads.get(k),
      cacheSet: (k, id) => void taskThreads.set(k, id),
      recordedGet: (k) =>
        memoRoot ? readTaskThread(memoRoot, k) : null,
      recordedSet: (k, id) => {
        if (memoRoot) {
          try {
            writeTaskThread(memoRoot, k, id);
          } catch {
            /* 기록 실패가 라우팅 막지 X */
          }
        }
      },
      isAlive: async (id) => {
        const t = await client.channels.fetch(id).catch(() => null);
        return !!t && t.isThread();
      },
      findByName: async (k) => {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildText) return null;
        const match = (name: string | null): boolean => {
          const n = name || '';
          return (
            n === k || n.startsWith(`${k} `) || n.startsWith(`제안 ${k}`)
          );
        };
        try {
          const active = await ch.threads.fetchActive();
          for (const th of active.threads.values()) {
            if (match(th.name)) return th.id;
          }
        } catch {
          /* active 조회 실패 → archived 시도 */
        }
        try {
          const arch = await ch.threads.fetchArchived({ type: 'public' });
          for (const th of arch.threads.values()) {
            if (match(th.name)) return th.id;
          }
        } catch {
          /* 못 찾음 = 생성 단계로 */
        }
        return null;
      },
      create: async (k) => {
        const ch = await client.channels.fetch(channelId).catch(() => null);
        if (!ch || ch.type !== ChannelType.GuildText) return null;
        const thread = await ch.threads
          .create({
            name: k.slice(0, 100),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
            type: ChannelType.PublicThread,
            reason: `KAR-018-THR agent-team TASK thread (${k})`,
          })
          .catch(() => null);
        if (!thread) return null;
        // 메인채널 포인터 = 스레드 *신규 생성* 시 1회만 (스팸 0).
        await ch
          .send(`🧵 **${k}** 작업 스레드 → <#${thread.id}>`)
          .catch(() => undefined);
        return thread.id;
      },
    });
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
        const taskId = extractTaskId(msg);
        const channelId = deps.resolveChannelId();
        if (!taskId || !channelId) {
          deps.fallback(msg);
          return;
        }
        const threadId = await getOrCreateThread(channelId, taskId);
        if (!threadId) {
          deps.fallback(msg); // 스레드 불가 → 기존 경로(무손실 우선)
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
