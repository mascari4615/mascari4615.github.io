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
 * 메시지에서 스레드 키 추출. 우선순위:
 *  1) TASK-<PREFIX>-<번호>[-<서브>] (KAR/WM/KL/YB 등) — 첫 매치 = 그 틱 대상.
 *  2) 제안 발굴 id `pXXXXXXXX` (proposalId = `p` + 8 hex, proposal.ts 정본).
 *
 * (2) 추가 근거 (TASK-KAR-018-THR (A) — prod 코드실증): proposal notify
 * 라인(`⑦' 발굴 → task-new (task) [p42c94051] …`)은 TASK id 가 없어
 * 기존 정규식에 매칭 0 → null → 메인채널 fallback = "제안 카드가 스레드
 * 아닌 일반채팅" 페인의 root. proposal-id 도 thread key 로 인정하면 그
 * notify 가 *그 제안 전용 안정 스레드* 로 수렴(메인채널 스팸 해소).
 * TASK 우선이라 기존 TASK 라우팅·단위검증은 byte-identical (회귀 0).
 * 없으면 null = 팀-공통(하트비트 등 메인채널).
 */
export function extractTaskId(msg: string): string | null {
  const t = msg.match(/TASK-[A-Z]{2,6}-\d+(?:-[A-Za-z0-9]+)?/);
  if (t) return t[0];
  // proposalId 형식 = `p` + 정확히 8 hex (proposal.ts proposalId). 단어
  // 경계 강제 — "prod"/"plan" 등 일반어 오매칭 0 (8 hex 동반 필수).
  const p = msg.match(/(?<![A-Za-z0-9])p[0-9a-f]{8}(?![0-9a-z])/);
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

/**
 * 채널의 *기존* 스레드 중 이름이 정확히 `name` 인 것의 id (없으면 null).
 * active → archived(public) 순 조회. 봇 재기동으로 in-memory 맵이
 * 소실돼도 같은 TASK 의 스레드를 Discord 측에서 되찾는 경로
 * (TASK-KAR-018-THR 재기동-중복 root fix). best-effort — 어떤
 * fetch 실패도 swallow(throw X) → 호출부는 생성으로 graceful 폴백.
 * discord.js 최소 표면(`threads.fetchActive/fetchArchived`)만 의존 →
 * 테스트에서 가짜 채널로 분기 전수검증 가능.
 */
export async function findThreadByName(
  ch: {
    threads: {
      fetchActive: () => Promise<{
        threads: { values: () => Iterable<{ id: string; name: string }> };
      }>;
      fetchArchived: (opts?: {
        type?: 'public' | 'private';
      }) => Promise<{
        threads: { values: () => Iterable<{ id: string; name: string }> };
      }>;
    };
  },
  name: string,
): Promise<string | null> {
  const scan = (
    res: {
      threads: { values: () => Iterable<{ id: string; name: string }> };
    } | null,
  ): string | null => {
    if (!res) return null;
    for (const t of res.threads.values()) {
      if (t && t.name === name) return t.id;
    }
    return null;
  };
  const active = await ch.threads.fetchActive().catch(() => null);
  const hitA = scan(active);
  if (hitA) return hitA;
  const archived = await ch.threads
    .fetchArchived({ type: 'public' })
    .catch(() => null);
  return scan(archived);
}

export interface ThreadRouterDeps {
  /** agent-team 채널 id 해석 (override 우선 → webhook-routes). */
  resolveChannelId: () => string | null;
  /** taskId 없는 팀-공통 메시지 폴백(기존 embed 송신). */
  fallback: (msg: string) => void;
  /**
   * taskId 추출 실패 시 어디로? (사용자 정신없음 fix · 2026-05-23):
   *  - 'fallback' (default, backwards-compat) = 메인 채널 send
   *  - 'silent' = Discord 게시 X (trace 만 — status board 가 정보 통합)
   *
   * env `AGENT_NOTIFY_FALLBACK=silent` 도 같은 효과 (main.ts wiring).
   */
  onMissingTask?: 'fallback' | 'silent';
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
      const wantName = taskId.slice(0, 100);
      // ── TASK-KAR-018-THR root fix: 생성 전 *기존 스레드 이름검색* ──
      // 근본 진단(코드실증): taskThreads 는 in-memory Map → prod 봇은
      // master push 마다 nssm restart(1h~5 deploy 실측) → 맵 소실 →
      // 같은 TASK 다음 메시지에 무조건 ch.threads.create = 중복 스레드
      // + 옛 스레드(맥락·사용자 미응답) 고아 → OneDay 아카이브 = KAR-
      // 018-LT D2「누적 0」를 재기동 churn 이 적극 파괴. 맵 miss 시
      // active/archived 를 이름(=생성 시 쓰는 wantName)으로 먼저 조회 →
      // 있으면 재사용. 스펙 명시: "기존 이름검색 단독으로도 재기동-중복
      // 버그 해소". best-effort — 조회 실패는 생성으로 폴백(가용성 우선).
      const existing = await findThreadByName(ch, wantName);
      if (existing) {
        taskThreads.set(taskId, existing);
        return existing;
      }
      const thread = await ch.threads
        .create({
          name: wantName,
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          type: ChannelType.PublicThread,
          reason: `KAR-018-Y agent-team TASK thread (${taskId})`,
        })
        .catch(() => null);
      if (!thread) return null;
      taskThreads.set(taskId, thread.id);
      // 메인채널 포인터 = 스레드 *신규 생성* 시 1회만 (재사용 시 X = 스팸 0).
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

  const onMissing =
    deps.onMissingTask ??
    ((process.env.AGENT_NOTIFY_FALLBACK?.trim() === 'silent'
      ? 'silent'
      : 'fallback') as 'fallback' | 'silent');

  return (msg: string): void => {
    void (async () => {
      try {
        const taskId = extractTaskId(msg);
        const channelId = deps.resolveChannelId();
        if (!taskId || !channelId) {
          if (onMissing === 'silent') {
            return; // 사용자 정신없음 fix — status board 가 정보 통합
          }
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
