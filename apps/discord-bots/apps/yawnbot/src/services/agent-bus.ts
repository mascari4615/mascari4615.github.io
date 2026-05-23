/**
 * agent-bus — 코어 daemon ↔ adapter 간 publish/subscribe substrate
 * (KAR-018-LT-DIVERSITY D-1, 2026-05-23).
 *
 * 사용자 비전 (의역 X): "디코 Client 가 바뀌어도 에이전트는 살아잇을 수
 * 잇잖아" + "사람처럼 그냥 채팅보고 자기가 스스로 판단해서 읽씹하든
 * 대답하든". 단일 봇 process 의존 폐기 — 코어 = 독립 daemon, adapter =
 * thin bridge. 본 모듈 = 그 분리를 가능케 하는 *공유 메시지 채널*.
 *
 * 헌장 §2.7 substrate⊥어댑터 의 첫 first-use. 지금까지 *벡터만* 있었음.
 *
 * 설계 (가설 X — 실증된 패턴 재사용):
 *  - **파일 jsonl append-only** = race-free (Linux O_APPEND atomic, Windows
 *    fs.appendFile 64KB 이하 atomic). 외부 broker(Redis/Kafka) X — infra 0,
 *    operational simplicity, 이미 mem/proposals/discoveries 패턴 정합.
 *  - **외부 경로 (yawnbot deploy clean 무관)** — `LAPTOP_AGENT_BUS_ROOT` env
 *    또는 default `~/.karmoddrine/agent-bus`. yawnbot deploy 의 `git clean
 *    -fd` 가 절대 안 닿음 ([[feedback_yawnbot_runtime_state_gitignore_clean_trap]]).
 *  - **channel scoping** = `<root>/<channelId>/<yyyy-mm-dd>.jsonl`. 일 단위
 *    rotate, 채널별 분리 → tail reader 가 자기 채널만 follow.
 *  - **tail = polling-based** (fs.watch 가 Windows·WSL flaky). interval=500ms
 *    default. 미세 latency↑ 대신 race·놓침 0.
 *
 * 비-목표 (현재 슬라이스):
 *  - cross-machine bus (single 노트북 daemon = 사용자 현 vision)
 *  - persistent ack/retry (event-sourced, idempotent read 가 default)
 *  - 보안·암호화 (로컬 디스크 안)
 */
import { promises as fsp } from 'node:fs';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type BusEventType =
  | 'channel-msg'      // Discord (또는 다른 adapter) 채널 메시지 → bus
  | 'core-utter'       // daemon 발화 결정 → adapter post
  | 'core-react-skip'  // daemon "읽씹" 판단 (관측용, prefilter 통과 시각화)
  | 'system-tick';     // cadence tick 등 시스템 이벤트 (heartbeat·worker poll)

export interface BusEvent {
  /** ISO8601 (KST 권장 — 룰: 시간 표기는 KST). */
  ts: string;
  type: BusEventType;
  /** adapter scope (Discord channel id, 또는 'cli', 'web' 등). */
  channelId: string;
  /** 'discord' | 'core:<id>' | 'cli' | 'system' ... 발신 출처. */
  source: string;
  /** core-utter / core-react-skip 시 발화·판단 코어 id. */
  coreId?: string;
  /** 메시지 본문. channel-msg=원문, core-utter=발화, react-skip=빈 문자열. */
  text: string;
  /** 참조·메타. */
  refs?: {
    /** Discord message id (channel-msg 트리거 / 답글 reference). */
    messageId?: string;
    /** 참조 BusEvent ts (직전 발의 reply 체인). */
    parentTs?: string;
    /** react-skip 사유 (prefilter 출력 — 관측 가시화). */
    skipReason?: string;
    /** channel-msg author (Discord username 또는 코어 id). */
    author?: string;
  };
}

const SAFE_CHANNEL_ID = /^[a-zA-Z0-9_:.-]{1,128}$/;

/** bus root 디렉토리 결정 — env override → default home dir. */
export function resolveBusRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = (env.LAPTOP_AGENT_BUS_ROOT || '').trim();
  if (override) return override;
  return path.join(os.homedir(), '.karmoddrine', 'agent-bus');
}

/** `<root>/<channelId>/<yyyy-mm-dd>.jsonl` 경로 계산 (KST 일자). */
export function busFilePath(
  root: string,
  channelId: string,
  at: Date = new Date(),
): string {
  if (!SAFE_CHANNEL_ID.test(channelId)) {
    throw new Error(`agent-bus: invalid channelId "${channelId}"`);
  }
  const kst = new Date(at.getTime() + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const mm = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(kst.getUTCDate()).padStart(2, '0');
  return path.join(root, channelId, `${yyyy}-${mm}-${dd}.jsonl`);
}

/**
 * publish — append-only fs.appendFile. race-safe (O_APPEND atomic 보장).
 * 디렉토리 부재 시 자동 생성.
 */
export async function publishBusEvent(
  root: string,
  event: Omit<BusEvent, 'ts'> & { ts?: string },
): Promise<BusEvent> {
  const full: BusEvent = {
    ts: event.ts || new Date().toISOString(),
    type: event.type,
    channelId: event.channelId,
    source: event.source,
    text: event.text,
    ...(event.coreId !== undefined && { coreId: event.coreId }),
    ...(event.refs !== undefined && { refs: event.refs }),
  };
  const file = busFilePath(root, full.channelId, new Date(full.ts));
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.appendFile(file, JSON.stringify(full) + '\n', 'utf8');
  return full;
}

/**
 * recent — 직전 N분 슬라이딩 윈도우 read. 오늘 + 어제 파일 둘 다 읽고
 * ts >= cutoff 만 반환 (자정 경계 누락 방지).
 */
export async function readRecentBusEvents(
  root: string,
  channelId: string,
  windowMinutes: number,
  now: Date = new Date(),
): Promise<BusEvent[]> {
  if (!SAFE_CHANNEL_ID.test(channelId)) return [];
  const cutoff = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const today = busFilePath(root, channelId, now);
  const yesterday = busFilePath(
    root,
    channelId,
    new Date(now.getTime() - 24 * 60 * 60 * 1000),
  );
  const out: BusEvent[] = [];
  for (const file of [yesterday, today]) {
    if (!existsSync(file)) continue;
    const raw = await fsp.readFile(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as BusEvent;
        if (new Date(e.ts).getTime() >= cutoff.getTime()) out.push(e);
      } catch {
        // 손상 라인 silently skip (append race 손상은 다음 line 살림)
      }
    }
  }
  return out;
}

/** tail subscriber 핸들 — stop() 호출로 polling 종료. */
export interface BusSubscription {
  stop(): void;
}

/**
 * subscribe — polling 기반 tail. fs.watch 회피 (Windows·WSL flaky).
 *
 * 동작:
 *   1. 시작 시 *이미 적힌* 줄은 skip (offset=현재 파일 크기) — 새 이벤트만.
 *   2. interval 마다 stat → size 증가분 read → 라인 파싱 → onEvent.
 *   3. 자정 넘김 = busFilePath 가 새 파일 가리킴 → offset 재시작.
 *
 * 손상·partial-line 안전: \n 없는 마지막 partial 은 다음 cycle 까지 보류.
 */
export function subscribeBusEvents(
  root: string,
  channelId: string,
  onEvent: (e: BusEvent) => void,
  opts: { intervalMs?: number; onError?: (e: Error) => void } = {},
): BusSubscription {
  if (!SAFE_CHANNEL_ID.test(channelId)) {
    throw new Error(`agent-bus: invalid channelId "${channelId}"`);
  }
  const interval = Math.max(50, opts.intervalMs ?? 500);
  let stopped = false;
  let currentFile = busFilePath(root, channelId);
  let offset = existsSync(currentFile) ? statSync(currentFile).size : 0;
  let buffer = '';

  const tick = (): void => {
    if (stopped) return;
    try {
      const nextFile = busFilePath(root, channelId);
      if (nextFile !== currentFile) {
        currentFile = nextFile;
        offset = 0;
        buffer = '';
      }
      if (!existsSync(currentFile)) return;
      const st = statSync(currentFile);
      if (st.size <= offset) return;
      const fd = readFileSync(currentFile, 'utf8');
      const fresh = fd.slice(offset);
      offset = st.size;
      const combined = buffer + fresh;
      const lines = combined.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const e = JSON.parse(line) as BusEvent;
          onEvent(e);
        } catch {
          // partial / corrupt line — skip
        }
      }
    } catch (e) {
      if (opts.onError) opts.onError(e instanceof Error ? e : new Error(String(e)));
    }
  };

  const timer = setInterval(tick, interval);
  // 첫 tick 즉시 시도 (저쪽이 이미 새 줄 박아둔 케이스)
  setImmediate(tick);

  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
  };
}
