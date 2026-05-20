// 워커/팀 #team-bus 메시지 → TASK 당 Discord 스레드 라우팅 + 전문 청크.
// KAR-018-Y (사용자: "내용 짤림 근본해결 — TASK 스레드·단위메시지·트렁케이트
// 폐기"). 트렁케이트 = 정보손실 = Sexy X. yawnbot=1차 정보 인터페이스.
//
// KAR-018-THR (2026-05-20): in-memory 맵 = 봇 재기동마다 같은 TASK 에 중복
// 스레드 생성 → 사용자 향 연속성 파괴. lookup 순서를 [in-memory → 디스크
// 매핑(영속) → 이름검색(active+archived) → 생성+write-back] 으로 굳혀
// 재기동·deploy churn 견고화. 제안 카드 id(pXXX) 도 router 키로 인정(현
// extractTaskId 정규식 미매칭 → 메인채널 fallback 으로 새던 경로 닫음).
//
// 순수(extractTaskId/extractThreadKey/chunkForDiscord/persist 헬퍼) =
// 전수 단위검증. 상태/Discord IO = makeThreadRouter (client 주입, 봇
// 프로세스에서만 wired).
import fs from 'fs';
import path from 'path';
import {
  type Client,
  ChannelType,
  ThreadAutoArchiveDuration,
} from 'discord.js';
import { lookupProposalById } from './agent-bus';

/** 메시지에서 TASK id 추출 (스레드 키). 없으면 null = 팀-공통(메인채널).
 *  이 함수는 *TASK id 전용* — 인박드 핸들러(스레드명→결정 캡처)가 본
 *  결과를 워커 픽업의 `taskId` 로 그대로 사용한다. 제안 id(pXXX)는
 *  여기 안 들어옴(워커가 못 픽업 → 결정 증발). pXXX 라우팅은
 *  extractThreadKey 가 따로 처리. */
export function extractTaskId(msg: string): string | null {
  // TASK-<PREFIX>-<번호>[-<서브>] (KAR/WM/KL/YB 등). 첫 매치 = 그 틱 대상.
  const m = msg.match(/TASK-[A-Z]{2,6}-\d+(?:-[A-Za-z0-9]+)?/);
  return m ? m[0] : null;
}

/** 라우터용 스레드 키 = TASK id (전수) 또는 제안 id(pXXX). TASK 우선
 *  (한 메시지에 둘 다 있으면 TASK 가 그 틱의 1차 대상). 제안 카드는
 *  announceProposal 가 스레드를 *만들면서* `.claude/agent-proposal-msgs.
 *  jsonl` 에 매핑 영속 — 본 router 가 그 매핑을 disk 단계에서 재사용. */
export function extractThreadKey(msg: string): string | null {
  const t = extractTaskId(msg);
  if (t) return t;
  // proposalId 형식 = `p` + FNV-1a 8 hex char (proposal.ts:172).
  const m = msg.match(/\bp[0-9a-f]{8}\b/);
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

// ── KAR-018-THR: TASK 스레드 매핑 영속 (재기동 견고) ─────────────
// 봇 nssm restart(deploy 마다)로 in-memory 맵 소실 = 같은 TASK 다음
// 메시지에 중복 스레드 + 옛 스레드(맥락·결정 포함) 고아화 = D2 연속성
// 파괴. 디스크 매핑 + 이름검색 fallback = 재기동에도 같은 thread id
// 유지. 형식: `{ts, key, threadId, channelId}` jsonl (id별 최신 유효).
// 제안 카드(pXXX)는 별 파일 X — announceProposal 가 이미
// `.claude/agent-proposal-msgs.jsonl` 에 적어둠 (router 가 그 파일을 재사용).

export interface TaskThreadEntry {
  /** TASK id 또는 제안 id(pXXX) — extractThreadKey 결과. */
  key: string;
  threadId: string;
  /** 어느 채널에서 만들었나(reconcile 용). */
  channelId: string;
  ts: string;
}

export function taskThreadsPath(memoRoot: string): string {
  return memoRoot
    ? path.join(memoRoot, '.claude', 'agent-task-threads.jsonl')
    : '';
}

/** TASK 스레드 매핑 1줄 append (id별 최신 유효). best-effort. */
export function appendTaskThread(
  memoRoot: string,
  entry: Omit<TaskThreadEntry, 'ts'>,
): void {
  const p = taskThreadsPath(memoRoot);
  if (!p) return;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(
      p,
      JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n',
      'utf-8',
    );
  } catch {
    /* best-effort — 영속 실패가 게시 비차단 */
  }
}

/** TASK 키 → 최신 thread 매핑 1건 (없으면 null). 순수 read. */
export function lookupTaskThread(
  memoRoot: string,
  key: string,
): TaskThreadEntry | null {
  const p = taskThreadsPath(memoRoot);
  if (!p || !fs.existsSync(p)) return null;
  try {
    let hit: TaskThreadEntry | null = null;
    for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const e = JSON.parse(t) as TaskThreadEntry;
      if (e && e.key === key && e.threadId) hit = e;
    }
    return hit;
  } catch {
    return null;
  }
}

/**
 * 키 → 영속 매핑된 threadId 회수. 분기:
 *  · pXXX (제안) → `agent-proposal-msgs.jsonl` (announceProposal 가 게재시 적음)
 *  · TASK-* → `agent-task-threads.jsonl` (router 가 첫 생성시 적음)
 * 둘 다 미존재 = null (다음 단계: 이름검색 → 생성). 순수 read.
 */
export function resolvePersistedThread(
  memoRoot: string,
  env: NodeJS.ProcessEnv,
  key: string,
): string | null {
  if (!memoRoot) return null;
  if (/^p[0-9a-f]{8}$/.test(key)) {
    const hit = lookupProposalById(env, key);
    return hit?.threadId || null;
  }
  return lookupTaskThread(memoRoot, key)?.threadId || null;
}

export interface ThreadRouterDeps {
  /** agent-team 채널 id 해석 (override 우선 → webhook-routes). */
  resolveChannelId: () => string | null;
  /** taskId 없는 팀-공통 메시지 폴백(기존 embed 송신). */
  fallback: (msg: string) => void;
  /** MEMO_REPO_PATH 주입 — 매핑 영속 활성. 미주입 = in-memory only
   *  (구 동작·재기동에 중복 생성, dev/test graceful). */
  memoRepoPath?: string | null;
  /** appendProposalMsg/lookupProposalById 가 쓰는 env 객체. 없으면
   *  pXXX 제안 매핑 lookup 불가(TASK 만 영속). */
  env?: NodeJS.ProcessEnv;
}

/**
 * msg → TASK 스레드 라우터. taskId/proposalId 있으면 그 TASK 전용
 * public thread (채널당 1회 생성·재사용) 에 *전문 청크* 게시 + 메인채널
 * 1줄 포인터 (스레드 생성 시 1회만, 스팸 0). taskId 없으면 fallback(팀-공통).
 * 실패는 전부 swallow(가용성 우선 — 게시 실패가 워커 막지 X).
 *
 * KAR-018-THR lookup 순서 (재기동·deploy churn 견고):
 *  1. in-memory cache (현 프로세스 hit — 가장 빠름)
 *  2. 디스크 영속 (proposal-msgs / task-threads) — 봇 재기동·다중 프로세스
 *  3. 채널 이름검색 (active + archived) — 영속 파일 소실 시 백업 회수
 *  4. 신규 생성 + 디스크 write-back + 메인채널 포인터 1회
 */
export function makeThreadRouter(
  client: Client,
  deps: ThreadRouterDeps,
): (msg: string) => void {
  const taskThreads = new Map<string, string>(); // key → threadId
  const creating = new Map<string, Promise<string | null>>(); // 동시 dedupe
  const memoRoot = (deps.memoRepoPath || '').trim();
  const env = deps.env ?? (process.env as NodeJS.ProcessEnv);

  /** thread fetch + 사용가능 검사. 아카이브된 스레드는 send 시 Discord
   *  가 자동 unarchive(권한 있을 때) — 우선 fetch 만으로 살아있는지 본다. */
  async function fetchUsableThread(
    threadId: string,
  ): Promise<{ id: string } | null> {
    const ch = await client.channels.fetch(threadId).catch(() => null);
    if (!ch || !('isThread' in ch) || !ch.isThread()) return null;
    return { id: ch.id };
  }

  /** 채널의 active+archived 스레드에서 정확 이름 일치 1건 찾기. 영속
   *  파일 소실(메모 repo wipe 등) 시 마지막 회수 경로. 실패=null. */
  async function findThreadByName(
    channelId: string,
    name: string,
  ): Promise<string | null> {
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) return null;
    try {
      const active = await ch.threads.fetchActive();
      for (const [, t] of active.threads) {
        if (t.name === name) return t.id;
      }
    } catch {
      /* active 실패 → archived 만이라도 */
    }
    try {
      const archived = await ch.threads.fetchArchived();
      for (const [, t] of archived.threads) {
        if (t.name === name) return t.id;
      }
    } catch {
      /* */
    }
    return null;
  }

  async function getOrCreateThread(
    channelId: string,
    key: string,
  ): Promise<string | null> {
    const known = taskThreads.get(key);
    if (known) return known;
    const inflight = creating.get(key);
    if (inflight) return inflight;
    const p = (async (): Promise<string | null> => {
      // 2. 디스크 영속 매핑 (제안 카드는 announceProposal 가 이미 적음)
      const persisted = resolvePersistedThread(memoRoot, env, key);
      if (persisted) {
        const ok = await fetchUsableThread(persisted);
        if (ok) {
          taskThreads.set(key, ok.id);
          return ok.id;
        }
        /* 매핑은 있는데 스레드는 사라짐(삭제·길드 이탈) → 이름검색·재생성 */
      }
      // 3. 이름검색 (active + archived) — 영속 파일 wipe 시 백업 회수
      // 제안 카드 키(pXXX)는 스레드명이 "제안 pXXX: …" 패턴이라 정확
      // 일치 X → 본 fallback 은 TASK 키에서만 의미 (의도된 차이).
      const found = await findThreadByName(channelId, key);
      if (found) {
        taskThreads.set(key, found);
        if (memoRoot && !/^p[0-9a-f]{8}$/.test(key)) {
          appendTaskThread(memoRoot, { key, threadId: found, channelId });
        }
        return found;
      }
      // 4. 신규 생성 (제안 카드 pXXX 는 여기 도달 X — announceProposal
      // 가 카드 게시 시 항상 스레드 생성·영속. 도달했다면 메모 wipe
      // + 이름미일치(스레드명에 "제안 " 접두). 그 경우엔 TASK 동형
      // 으로 생성·영속해 다음부터 hit — 데드 인터페이스 0).
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (!ch || ch.type !== ChannelType.GuildText) return null;
      const thread = await ch.threads
        .create({
          name: key.slice(0, 100),
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          type: ChannelType.PublicThread,
          reason: `KAR-018-Y agent-team TASK thread (${key})`,
        })
        .catch(() => null);
      if (!thread) return null;
      taskThreads.set(key, thread.id);
      if (memoRoot && !/^p[0-9a-f]{8}$/.test(key)) {
        appendTaskThread(memoRoot, {
          key,
          threadId: thread.id,
          channelId,
        });
      }
      // 메인채널 포인터 = 스레드 생성 시 1회만 (스팸 0).
      await ch
        .send(`🧵 **${key}** 작업 스레드 → <#${thread.id}>`)
        .catch(() => undefined);
      return thread.id;
    })();
    creating.set(key, p);
    try {
      return await p;
    } finally {
      creating.delete(key);
    }
  }

  return (msg: string): void => {
    void (async () => {
      try {
        const key = extractThreadKey(msg);
        const channelId = deps.resolveChannelId();
        if (!key || !channelId) {
          deps.fallback(msg);
          return;
        }
        const threadId = await getOrCreateThread(channelId, key);
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
