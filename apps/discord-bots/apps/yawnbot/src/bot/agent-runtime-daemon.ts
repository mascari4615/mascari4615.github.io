/**
 * agent-runtime-daemon — 코어 = 독립 daemon process orchestrator
 * (TASK-KAR-018-LT-DIVERSITY, D-3).
 *
 * "프로세스 분리 = 코어 살아있음의 정의" (사용자 비전 2026-05-23). 본 모듈
 * 은 *generic* — 시작 시 `--core-id <id>` 1개 주입받아 정체성 결정. 그
 * 코어가 *살아있는* 동안 하는 일:
 *
 *   1. bus tail — `<MEMO>/.claude/agent-channel-bus/<channel>/<day>.jsonl` 에
 *      append 된 새 BusEvent 회수 (마지막 처리 ts 이후).
 *   2. 자기 core-utter 는 skip (자기루프 차단).
 *   3. rate-limit 체크 — 5분 안 2발화 cap 도달 + 미멘션 = silence 강제.
 *   4. prefilter (cheap 모델) — `{react: bool}` 결정. 모호 시 silence.
 *   5. 본 모델 speak — capability + recent context + work-memory.
 *   6. core-utter publish + core mem append.
 *
 * 본 모듈은 *pure*: DI 로 bus reader/writer · LLM 호출 · clock · mem 적재
 * 를 주입받음 (테스트 가능). 실제 nssm 서비스 등록은 D-7 단계 (scripts/
 * run-agent-runtime.mjs 가 entry).
 *
 * 한 daemon = 한 코어 = 한 channelId tail. 모든 코어가 같은 channel(team-bus)
 * 을 tail 해도 됨 (append-only file, race-free reader). 다른 채널 listening
 * = 다른 daemon 인스턴스 추가.
 *
 * Discord adapter 죽음·재기동 = daemon 살아있음 (bus 가 buffer). 본 모듈
 * 은 Discord 의존 0 — substrate(bus 파일)와만 통신.
 */
import type { BusEvent } from './agent-channel-bus';
import type { CoreDef } from '../services/agent-core';
import {
  buildPrefilterPrompt,
  buildSpeakPrompt,
  formatActiveContext,
  isMentionedFor,
  isRateLimited,
  parsePrefilterResponse,
  recentActiveContext,
  type PrefilterDecision,
} from './agent-ambient';

/** daemon 한 cycle 의 누적 metric (auditor baseline 입력). */
export interface TickMetrics {
  /** 회수한 BusEvent 총수 (since lastSeenTs). */
  scanned: number;
  /** 자기루프/own utter skip 수. */
  skippedSelf: number;
  /** rate-limit + 미멘션 으로 skip 수. */
  skippedRateLimited: number;
  /** prefilter 가 react=false 로 silence 결정 수. */
  silenced: number;
  /** 본 모델 호출 (실제 발화) 수. */
  spoken: number;
  /** publish 실패 수 (substrate 미가용 등). */
  publishFailed: number;
  /** 처리한 가장 마지막 BusEvent ts — 다음 tick 의 sinceTs (state). */
  lastSeenTs: string;
}

/** caller(scheduler)가 매 tick 사이에 유지·전달하는 state. */
export interface DaemonState {
  /** 마지막으로 처리한 BusEvent ts (ISO). 초기 = '' (전체 새로 봄). */
  lastSeenTs: string;
}

/** DI — 본 모듈은 fs/LLM/Discord 직접 의존 X. */
export interface DaemonDeps {
  /** bus tail — sinceTs 이후 BusEvent 회수 (시간 오름차순). */
  readSince: (channelId: string, sinceTs: string) => BusEvent[];
  /** cheap 모델(prefilter) 호출 — text in / text out. */
  prefilterLLM: (prompt: string) => Promise<string>;
  /** 본 모델(speak) 호출. */
  speakLLM: (prompt: string) => Promise<string>;
  /** core-utter publish (best-effort). 성공 = true. */
  publishUtter: (event: {
    channelId: string;
    coreId: string;
    text: string;
    ts: string;
  }) => boolean;
  /** core work-memory 1 entry append (best-effort). */
  appendMem: (entry: {
    coreId: string;
    type: 'discovery' | 'decision' | 'fix' | 'fail' | 'insight';
    topic: string;
    summary: string;
  }) => void;
  /** 최근 work-memory 압축 (LLM 입력용, 옵션). */
  readRecentMem?: (coreId: string) => string;
  /** "지금"(테스트 inject). 기본 = Date.now(). */
  now?: () => Date;
}

export interface TickOpts {
  /** 발화할 코어 id (daemon 자체 정체성). */
  core: CoreDef;
  /** tail 할 채널 id. */
  channelId: string;
  /** 5분 윈도우 ms (override 가능, 테스트용). */
  windowMs?: number;
  /** rate-limit cap (override 가능). */
  cap?: number;
}

/**
 * 한 tick = bus 의 새 event 들을 처리. caller(스케줄러)가 본 함수를 짧은
 * 간격(예: 1~3초)으로 호출. 각 event 별로 자기루프/rate-limit/prefilter/
 * speak/publish 의 결정을 순차 수행.
 *
 * state.lastSeenTs 는 본 함수가 갱신한 metrics.lastSeenTs 로 caller 가
 * *외부에서* 다음 호출에 넘겨준다. (본 함수는 stateless — race 회피)
 */
export async function agentRuntimeTickOnce(
  state: DaemonState,
  deps: DaemonDeps,
  opts: TickOpts,
): Promise<TickMetrics> {
  const now = (deps.now ?? (() => new Date()))();
  const since = state.lastSeenTs || '';
  const all = deps.readSince(opts.channelId, since);
  const metrics: TickMetrics = {
    scanned: all.length,
    skippedSelf: 0,
    skippedRateLimited: 0,
    silenced: 0,
    spoken: 0,
    publishFailed: 0,
    lastSeenTs: state.lastSeenTs,
  };
  if (all.length === 0) return metrics;

  // 시간 오름차순 보장 (caller readSince 가 unsorted 일 가능성 안전망).
  all.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  for (const event of all) {
    // 마지막 처리 ts 갱신 — 자기루프/rate-limit 으로 skip 되어도 진행.
    if (
      !metrics.lastSeenTs ||
      Date.parse(event.ts) > Date.parse(metrics.lastSeenTs)
    ) {
      metrics.lastSeenTs = event.ts;
    }
    // ① 자기루프 차단 — 본인 core-utter 는 평가 X.
    if (event.type === 'core-utter' && event.coreId === opts.core.id) {
      metrics.skippedSelf++;
      continue;
    }
    // ② capability 평가 — channel-msg 와 *다른 코어의* core-utter 둘 다 평가
    //    (코어끼리 대화도 ambient 임). 단 본인 utter 만 skip(①).
    const mentioned = isMentionedFor(event, opts.core.id);
    // ③ rate-limit (멘션 우회 제외) — 윈도우 안 history 만 본다.
    if (!mentioned) {
      const recentHistory = deps.readSince(opts.channelId, '');
      const limited = isRateLimited(recentHistory, opts.core.id, {
        windowMs: opts.windowMs,
        cap: opts.cap,
        now,
      });
      if (limited) {
        metrics.skippedRateLimited++;
        continue;
      }
    }
    // ④ active context.
    const fullHist = deps.readSince(opts.channelId, '');
    const context = recentActiveContext(fullHist, { now, windowMs: opts.windowMs });

    // ⑤ prefilter.
    let decision: PrefilterDecision;
    try {
      const prefilterPrompt = buildPrefilterPrompt({
        core: opts.core,
        context,
        latest: event,
      });
      const raw = await deps.prefilterLLM(prefilterPrompt);
      decision = parsePrefilterResponse(raw);
    } catch {
      decision = { react: false, why: 'prefilter-error' };
    }
    // 멘션 우회 — prefilter 가 react=false 라도 멘션이면 강제 평가.
    const forceSpeak = mentioned && !decision.react;
    if (!decision.react && !forceSpeak) {
      metrics.silenced++;
      continue;
    }

    // ⑥ speak.
    let text = '';
    try {
      const speakPrompt = buildSpeakPrompt({
        core: opts.core,
        prefilterWhy: decision.why || (forceSpeak ? 'mention-bypass' : ''),
        context,
        latest: event,
        recentMem: deps.readRecentMem ? deps.readRecentMem(opts.core.id) : '',
        mentioned,
      });
      text = (await deps.speakLLM(speakPrompt)).trim();
    } catch {
      text = '';
    }
    if (!text) {
      metrics.silenced++;
      continue;
    }
    // ⑦ publish.
    const utterTs = now.toISOString();
    const ok = deps.publishUtter({
      channelId: opts.channelId,
      coreId: opts.core.id,
      text,
      ts: utterTs,
    });
    if (!ok) {
      metrics.publishFailed++;
      continue;
    }
    metrics.spoken++;
    // ⑧ mem write — 자기 발화·이유 적재 (학습 누적).
    try {
      deps.appendMem({
        coreId: opts.core.id,
        type: 'insight',
        topic: `utter:${opts.channelId}`,
        summary: `${decision.why || (mentioned ? 'mentioned' : '')}; ${text.slice(0, 200)}`,
      });
    } catch {
      /* mem 적재 실패가 발화 자체를 막지 X */
    }
  }

  return metrics;
}

/**
 * UX 한 줄 (heartbeat / auditor 로깅용). 본 모듈 자체는 콘솔 출력 X —
 * caller 가 본 함수로 metrics 를 사람이 읽는 줄로 변환.
 */
export function summarizeTick(coreId: string, m: TickMetrics): string {
  return [
    `[agent-runtime ${coreId}]`,
    `scanned=${m.scanned}`,
    `self=${m.skippedSelf}`,
    `rate=${m.skippedRateLimited}`,
    `silent=${m.silenced}`,
    `spoke=${m.spoken}`,
    `fail=${m.publishFailed}`,
  ].join(' ');
}

/** active context dump (디버깅용 — 외부 호출 X, 평행정의 회피). */
export function dumpActiveContext(events: BusEvent[]): string {
  return formatActiveContext(events);
}
