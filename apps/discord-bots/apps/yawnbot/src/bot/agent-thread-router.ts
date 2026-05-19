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

/**
 * 메시지에서 스레드 키 추출. 없으면 null = 팀-공통(메인채널).
 * 1순위 TASK-<PREFIX>-<번호>[-<서브>] (첫 매치 = 그 틱 대상).
 * 2순위(흡수 A, TASK-KAR-018-THR): 제안 id = `p`+8 hex (proposal.ts
 * `proposalId`). 종전엔 pXXX 가 TASK 정규식에 안 걸려 null → 제안
 * 카드/숙의 메시지가 메인채널로 샜다(사용자 2026-05-19 관측). 제안
 * 전용 스레드로 모으도록 키 인정.
 */
export function extractTaskId(msg: string): string | null {
  const m = msg.match(/TASK-[A-Z]{2,6}-\d+(?:-[A-Za-z0-9]+)?/);
  if (m) return m[0];
  const p = msg.match(/\bp[0-9a-f]{8}\b/);
  return p ? p[0] : null;
}

/**
 * `discord_thread` 기록값(스레드 id 또는 디스코드 url 끝 숫자 id)
 * → 스레드 id. 순수. 형식 미상이면 null(스테일 무시 → 이름검색/생성).
 */
export function threadIdFromLink(v: string | null | undefined): string | null {
  const s = (v || '').trim();
  if (!s) return null;
  if (/^\d{5,}$/.test(s)) return s;
  const m = s.match(/(\d{5,})\s*$/); // url 끝 숫자 id
  return m ? m[1] : null;
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
  /**
   * TASK 파일 frontmatter 영속 매핑 (TASK-KAR-018-THR). 미주입 시
   * name-search 만으로도 재기동-중복은 0이나 durability(클릭 가능
   * 링크)·audit 미적용. key = extractTaskId 결과. 제안 id(pXXX)는
   * TASK 파일 부재 → no-op(name-search 가 재기동 내성 담당).
   */
  readThreadLink?: (taskId: string) => string | null;
  writeThreadLink?: (taskId: string, threadId: string) => void;
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
      const name = taskId.slice(0, 100);

      // (b) TASK 파일 기록 매핑 — 재기동 내성·클릭·audit (본 TASK 근본).
      const linkedId = threadIdFromLink(
        deps.readThreadLink?.(taskId) ?? null,
      );
      if (linkedId) {
        const t = await client.channels.fetch(linkedId).catch(() => null);
        if (t && t.isThread()) {
          if (t.archived) await t.setArchived(false).catch(() => undefined);
          taskThreads.set(taskId, linkedId);
          return linkedId;
        }
        // 기록은 있으나 스레드 소멸 → 이름검색/생성 진행(스테일 무시).
      }

      // (c) 기존 스레드 이름검색(active+archived). 맵 miss != 무조건
      //     create — 이 단독만으로도 재기동-중복 스레드 0 (본 TASK 핵심).
      let found: string | null = null;
      try {
        const act = await ch.threads.fetchActive();
        found = act.threads.find((th) => th.name === name)?.id ?? null;
      } catch {
        /* best-effort */
      }
      if (!found) {
        try {
          const arc = await ch.threads.fetchArchived();
          const hit = arc.threads.find((th) => th.name === name);
          if (hit) {
            found = hit.id;
            await hit.setArchived(false).catch(() => undefined);
          }
        } catch {
          /* best-effort */
        }
      }
      if (found) {
        taskThreads.set(taskId, found);
        deps.writeThreadLink?.(taskId, found); // durability·클릭·audit
        return found;
      }

      // (d) 생성 + TASK 파일 write-back.
      const thread = await ch.threads
        .create({
          name,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          type: ChannelType.PublicThread,
          reason: `KAR-018-THR agent-team TASK thread (${taskId})`,
        })
        .catch(() => null);
      if (!thread) return null;
      taskThreads.set(taskId, thread.id);
      deps.writeThreadLink?.(taskId, thread.id);
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
