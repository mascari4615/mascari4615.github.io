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

export interface ThreadRouterDeps {
  /** agent-team 채널 id 해석 (override 우선 → webhook-routes). */
  resolveChannelId: () => string | null;
  /** taskId 없는 팀-공통 메시지 폴백(기존 embed 송신). */
  fallback: (msg: string) => void;
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
  const taskThreads = new Map<string, string>(); // taskId → threadId
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
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) return null;
      const thread = await ch.threads
        .create({
          name: taskId.slice(0, 100),
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          type: ChannelType.PublicThread,
          reason: `KAR-018-Y agent-team TASK thread (${taskId})`,
        })
        .catch(() => null);
      if (!thread) return null;
      taskThreads.set(taskId, thread.id);
      // 메인채널 포인터 = 스레드 생성 시 1회만 (스팸 0).
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
