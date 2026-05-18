// 워커/팀 #team-bus 메시지 → TASK 당 Discord 스레드 라우팅 + 전문 청크.
// KAR-018-Y (사용자: "내용 짤림 근본해결 — TASK 스레드·단위메시지·트렁케이트
// 폐기"). 트렁케이트 = 정보손실 = Sexy X. yawnbot=1차 정보 인터페이스.
//
// KAR-018-THR: taskThreads in-memory Map 은 prod 봇 nssm restart(master
// push 마다, 1h ~5 deploy)에 소실 → 같은 TASK 중복 스레드 + 옛 스레드
// 고아. 영속 매핑(TASK frontmatter `discord_thread`) + 기존 스레드
// 이름검색을 lookup 체인에 추가해 재기동-중복을 0 으로.
//
// 순수(extractTaskId/chunkForDiscord/resolveTaskThread) = 전수 단위검증.
// 상태/Discord IO = makeThreadRouter (client 주입, 봇 프로세스에서만 wired).
import {
  type Client,
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

/**
 * 스레드 lookup 체인 1틱의 *순수* 의존(Discord/FS 무관 — 전수검증).
 *  memory → 영속(TASK 파일) → 기존 이름검색 → 생성.
 */
export interface ThreadResolveIO {
  /** in-memory 캐시 hit (프로세스 생애 내 안정 — 재검증 없이 즉시). */
  memoryGet: (taskId: string) => string | null;
  memorySet: (taskId: string, threadId: string) => void;
  /** TASK frontmatter `discord_thread` (재기동 후 durability). */
  persistedGet: (taskId: string) => string | null;
  /** 생성/채택 스레드 id TASK 파일 write-back (best-effort). */
  persistedSet: (taskId: string, threadId: string) => void;
  /** 스레드 id 가 아직 살아있나(fetch 가능 — 아카이브 포함). */
  threadAlive: (threadId: string) => Promise<boolean>;
  /** 채널 기존 스레드(active+archived) 중 이름 = taskId 검색. */
  findByName: (taskId: string) => Promise<string | null>;
  /** 신규 스레드 생성 + 메인채널 포인터(IO 측 책임). */
  create: (taskId: string) => Promise<string | null>;
}

/**
 * lookup 순서 결정자 (재기동-중복 0 불변식의 단일 진실). 순수 분기 —
 * 모든 IO 는 io 로 주입돼 단위검증·재기동 시뮬 가능.
 *  1. memory hit → 즉시(생애 내 유효, 재검증 X = 기존 fast-path 보존)
 *  2. 영속(TASK 파일) hit & 살아있음 → memory 캐시 후 반환(재생성 0)
 *  3. 기존 스레드 이름검색 hit → 채택 + 캐시 + write-back
 *  4. 생성 → 캐시 + write-back
 * 영속/이름검색이 stale(삭제됨)면 다음 단계로 fall-through.
 */
export async function resolveTaskThread(
  taskId: string,
  io: ThreadResolveIO,
): Promise<string | null> {
  const mem = io.memoryGet(taskId);
  if (mem) return mem; // 1: 프로세스 생애 내 — 재검증 비용 0

  const persisted = io.persistedGet(taskId);
  if (persisted && (await io.threadAlive(persisted))) {
    io.memorySet(taskId, persisted); // 2: 재기동 후 파일기록 부활
    return persisted;
  }

  const byName = await io.findByName(taskId);
  if (byName) {
    io.memorySet(taskId, byName); // 3: 파일기록 없던 옛 스레드 입양
    io.persistedSet(taskId, byName);
    return byName;
  }

  const made = await io.create(taskId); // 4: 진짜 신규일 때만 생성
  if (made) {
    io.memorySet(taskId, made);
    io.persistedSet(taskId, made);
  }
  return made;
}

export interface ThreadRouterDeps {
  /** agent-team 채널 id 해석 (override 우선 → webhook-routes). */
  resolveChannelId: () => string | null;
  /** taskId 없는 팀-공통 메시지 폴백(기존 embed 송신). */
  fallback: (msg: string) => void;
  /** TASK 파일 기록 스레드 id (재기동 durability). 미주입=in-memory만. */
  lookupPersisted?: (taskId: string) => string | null;
  /** 생성/채택 스레드 id 를 TASK 파일에 write-back (best-effort). */
  persist?: (taskId: string, threadId: string) => void;
}

/**
 * msg → TASK 스레드 라우터. taskId 있으면 그 TASK 전용 public thread
 * (영속 매핑·이름검색으로 채널·재기동당 1개 보장) 에 *전문 청크* 게시
 * + 메인채널 1줄 포인터(스레드 신규생성 시 1회만, 스팸 0). taskId
 * 없으면 fallback(팀-공통). 실패는 전부 swallow(가용성 우선).
 */
export function makeThreadRouter(
  client: Client,
  deps: ThreadRouterDeps,
): (msg: string) => void {
  const taskThreads = new Map<string, string>(); // taskId → threadId
  const creating = new Map<string, Promise<string | null>>(); // 동시 dedupe

  /** 스레드 fetch — 아카이브 포함 살아있으면 핸들, 아니면 null. */
  async function fetchThread(threadId: string) {
    const t = await client.channels.fetch(threadId).catch(() => null);
    return t && t.isThread() ? t : null;
  }

  async function findByName(
    channelId: string,
    taskId: string,
  ): Promise<string | null> {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) return null;
    const want = taskId.slice(0, 100);
    const active = await ch.threads.fetchActive().catch(() => null);
    const hitA = active?.threads.find((t) => t.name === want);
    if (hitA) return hitA.id;
    // 아카이브된 옛 스레드(재기동 churn 으로 OneDay reap 된 것)도 부활.
    const arch = await ch.threads
      .fetchArchived({ type: 'public', limit: 100 })
      .catch(() => null);
    const hitB = arch?.threads.find((t) => t.name === want);
    return hitB ? hitB.id : null;
  }

  async function createThread(
    channelId: string,
    taskId: string,
  ): Promise<string | null> {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) return null;
    const thread = await ch.threads
      .create({
        name: taskId.slice(0, 100),
        autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
        type: ChannelType.PublicThread,
        reason: `KAR-018 agent-team TASK thread (${taskId})`,
      })
      .catch(() => null);
    if (!thread) return null;
    // 메인채널 포인터 = 스레드 신규생성 시 1회만 (스팸 0).
    await ch
      .send(`🧵 **${taskId}** 작업 스레드 → <#${thread.id}>`)
      .catch(() => undefined);
    return thread.id;
  }

  function getOrCreateThread(
    channelId: string,
    taskId: string,
  ): Promise<string | null> {
    const inflight = creating.get(taskId);
    if (inflight) return inflight;
    const p = resolveTaskThread(taskId, {
      memoryGet: (id) => taskThreads.get(id) ?? null,
      memorySet: (id, tid) => {
        taskThreads.set(id, tid);
      },
      persistedGet: (id) => deps.lookupPersisted?.(id) ?? null,
      persistedSet: (id, tid) => deps.persist?.(id, tid),
      threadAlive: async (tid) => !!(await fetchThread(tid)),
      findByName: (id) => findByName(channelId, id),
      create: (id) => createThread(channelId, id),
    });
    creating.set(taskId, p);
    return p.finally(() => creating.delete(taskId));
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
        const thread = await fetchThread(threadId);
        if (!thread) {
          deps.fallback(msg);
          return;
        }
        // 영속/이름검색이 살린 옛 스레드가 아카이브 상태면 되살림
        // (isSendable=false → 폴백 = 정보 분산). 권한 없으면 best-effort.
        if (thread.archived) {
          await thread.setArchived(false).catch(() => undefined);
        }
        if (!thread.isSendable()) {
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
