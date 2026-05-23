/**
 * agent-channel-bus-publisher — bus → Discord 표면화 (TASK-KAR-018-LT-DIVERSITY,
 * D-7 substrate 완결).
 *
 * 왜 분리:
 * daemon(`agent-runtime-daemon`)은 발화 결과를 `core-utter` 로 bus 에 publish
 * 만 한다 — Discord(또는 다른 어댑터) 의존 0 (substrate⊥어댑터). 그 utter 가
 * 실제로 사용자 채널에 뜨려면 *adapter 쪽에서* bus 를 tail 해 표면(=Discord
 * webhook)으로 post 해야 한다. 본 모듈이 그 *yawnbot 측 subscriber*.
 *
 * 대칭:
 *   - daemon  : publish core-utter to bus (source='agent-runtime')
 *   - publisher: tail bus, find new core-utter, call DI'd `speak(coreId, text)`
 *                → Discord webhook (sendAsSkin 재사용).
 *   - 다른 어댑터(KL/Web) 도 같은 substrate 만 보면 됨 — daemon 코드 무변경.
 *
 * 본 모듈 = pure. fs/discord 직접 의존 X. caller(main.ts)가:
 *   1. `readSince` 로 bus tail (현재 yawnbot 가 알고있는 채널만)
 *   2. `speak(coreId, text)` 로 Discord 표면(현재 `setCoreSpeak` 배선)
 *   3. lastSeenTs 외부 보관 (재기동 시 어디서 다시 시작할지 — daemon 의
 *      `DaemonState` 와 동형).
 *
 * 자기루프 / 중복 차단:
 *   - 'in-process' source 의 core-utter 는 *이미* 봇 자체 webhook 으로
 *     Discord 에 뜬 발화의 mirror 다(가시화/감사 목적) — 다시 post X.
 *   - 멱등 키 = `${coreId}:${ts}`(events 의 자연 키). 이미 본 키 = skip.
 *   - publish 실패(speak returned false) = 다음 tick 재시도 X (lastSeenTs 진전).
 *     Discord 실패는 *그 utter 의 손실* 만; 재시도 폭주 회피.
 */
import type { BusEvent } from './agent-channel-bus';

/** publisher tick 상태. caller 가 외부 보관. */
export interface PublisherState {
  /** 마지막으로 처리한 BusEvent ts (ISO). 초기 = '' (오늘 처음 본 거부터). */
  lastSeenTs: string;
}

/**
 * DI — bus reader / Discord speak / clock.
 * speak(coreId, text) = best-effort, true 면 표면화 성공. false = 손실.
 */
export interface PublisherDeps {
  /** bus tail — sinceTs 이후 BusEvent 회수 (시간 오름차순). */
  readSince: (channelId: string, sinceTs: string) => BusEvent[];
  /** Discord webhook 등 표면 post — true 면 표면화 성공. */
  speak: (coreId: string, text: string) => Promise<boolean>;
  /** "지금"(테스트 inject). */
  now?: () => Date;
}

export interface PublisherTickOpts {
  /** tail 할 채널 id. */
  channelId: string;
  /**
   * 표면화 *제외* 할 source 들 (default = ['in-process']).
   * 이미 yawnbot 자체 webhook 으로 표면화된 utter 는 mirror 일 뿐 — 본 publisher
   * 가 다시 post 하면 *같은 발화 2번* (자기루프). source='agent-runtime'(외부
   * daemon) 만 표면화 default.
   */
  excludeSources?: string[];
}

export interface PublisherTickMetrics {
  /** 회수한 BusEvent 총수 (since lastSeenTs). */
  scanned: number;
  /** 자기루프(excludeSources 매칭) / non-core-utter 으로 skip 수. */
  skipped: number;
  /** speak 호출 (실제 표면화 시도) 수. */
  attempted: number;
  /** speak 가 true 반환 (Discord post 성공) 수. */
  posted: number;
  /** speak 가 false 반환 (or throw) 한 수. */
  failed: number;
  /** 처리한 가장 마지막 BusEvent ts — 다음 tick 의 sinceTs. */
  lastSeenTs: string;
}

/**
 * 한 tick = bus 의 새 event 들을 표면화. caller 가 짧은 주기(1~3s)로 호출.
 * Discord 실패한 utter 는 *재시도 X* (다음 tick 에 lastSeenTs 진전 — 폭주
 * 회피, 손실 가시화는 metrics.failed 로).
 */
export async function publisherTickOnce(
  state: PublisherState,
  deps: PublisherDeps,
  opts: PublisherTickOpts,
): Promise<PublisherTickMetrics> {
  const since = state.lastSeenTs || '';
  const all = deps.readSince(opts.channelId, since);
  const exclude = new Set(
    opts.excludeSources && opts.excludeSources.length > 0
      ? opts.excludeSources
      : ['in-process'],
  );
  const metrics: PublisherTickMetrics = {
    scanned: all.length,
    skipped: 0,
    attempted: 0,
    posted: 0,
    failed: 0,
    lastSeenTs: state.lastSeenTs,
  };
  if (all.length === 0) return metrics;

  // 시간 오름차순 보장 (안전망 — readSince contract 가 unsorted 일 가능성).
  all.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  for (const event of all) {
    // 마지막 처리 ts 진전 — skip/fail 무관 (재시도 폭주 회피).
    if (
      !metrics.lastSeenTs ||
      Date.parse(event.ts) > Date.parse(metrics.lastSeenTs)
    ) {
      metrics.lastSeenTs = event.ts;
    }
    // core-utter 가 아니거나 coreId 없으면 표면화 대상 X.
    if (event.type !== 'core-utter' || !event.coreId) {
      metrics.skipped++;
      continue;
    }
    // excludeSources(default='in-process') = 자기루프 — 이미 표면화됨.
    if (exclude.has(event.source)) {
      metrics.skipped++;
      continue;
    }
    metrics.attempted++;
    let ok = false;
    try {
      ok = await deps.speak(event.coreId, event.text);
    } catch {
      ok = false;
    }
    if (ok) metrics.posted++;
    else metrics.failed++;
  }
  return metrics;
}

/** UX 한 줄 (heartbeat/디버깅용). */
export function summarizePublisherTick(m: PublisherTickMetrics): string {
  return [
    `[bus-publisher]`,
    `scanned=${m.scanned}`,
    `skip=${m.skipped}`,
    `try=${m.attempted}`,
    `posted=${m.posted}`,
    `fail=${m.failed}`,
  ].join(' ');
}
