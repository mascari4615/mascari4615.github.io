/**
 * agent-ambient — capability-driven ambient listening 의 *순수* 결정층
 * (TASK-KAR-018-LT-DIVERSITY, D-4 / D-5 / D-6).
 *
 * 코어 daemon 이 새 channel-msg 마다 "끼어들지 말지"를 LLM 에게 묻기 전,
 * 결정에 필요한 *재료* 를 결정적·테스트가능하게 산출.
 *
 *   D-6 rate-limit / active context window — sliding 5분 안 같은 코어 발화
 *        2회 cap (silence preference), 최근 5분 채널 흐름만 LLM 에게 노출
 *        (전체 history X). 사용자 직접 호명/멘션 = cap 우회 (인지된 우선).
 *   D-4 prefilter prompt — `{react: bool, why: string}` 1줄 결정. silence
 *        default. cheap 모델용. false-positive 비용 > false-negative.
 *   D-5 speak prompt — capability(core body) + recent work-memory + active
 *        context 합성. 페르소나는 스킨 레이어 (기존 chat-adapter 재사용).
 *
 * 본 모듈 = pure (LLM 호출 X / fs X / Discord 의존 X). Daemon (D-3) 이
 * 본 모듈 산출물을 DI'd LLM 으로 흘려보낸다.
 */
import type { BusEvent } from './agent-channel-bus';
import type { CoreDef } from '../services/agent-core';

// ── D-6: rate-limit + active context window ──────────────────

/** 5분 (사용자 컨펌 — "직전 5분 채널 흐름만 listener 에게 전달"). */
export const DEFAULT_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
/** 5분 안 한 코어 발화 cap (사용자 컨펌 — "5분 안 동일 코어 발화 ≤ 2"). */
export const DEFAULT_RATE_LIMIT = 2;

export interface RateLimitOpts {
  /** 윈도우 길이 (ms). */
  windowMs?: number;
  /** 윈도우 안 코어 발화 cap. */
  cap?: number;
  /** "지금"(test inject). */
  now?: Date;
}

/**
 * 5분 sliding window 안 `coreId` 의 core-utter 횟수가 cap 도달했는지.
 * true = 발화 금지(강제 read-only). 멘션 우회는 caller 의 `isMentionedFor`
 * 가 별도 판단 — 본 함수는 *순수 rate-limit* 만 본다.
 */
export function isRateLimited(
  events: BusEvent[],
  coreId: string,
  opts: RateLimitOpts = {},
): boolean {
  const cap = Math.max(1, opts.cap ?? DEFAULT_RATE_LIMIT);
  const windowMs = Math.max(1000, opts.windowMs ?? DEFAULT_ACTIVE_WINDOW_MS);
  const now = (opts.now ?? new Date()).getTime();
  const cutoff = now - windowMs;
  let count = 0;
  for (const e of events) {
    if (e.type !== 'core-utter' || e.coreId !== coreId) continue;
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    if (t >= cutoff && t <= now) count++;
  }
  return count >= cap;
}

/** 멘션 우회 — refs.mentionedCoreIds 에 본인 id 가 있으면 prefilter 우회 강제. */
export function isMentionedFor(event: BusEvent, coreId: string): boolean {
  if (!event || !event.refs?.mentionedCoreIds) return false;
  return event.refs.mentionedCoreIds.includes(coreId);
}

export interface ActiveContextOpts {
  windowMs?: number;
  now?: Date;
  /** active context 안 최대 회수 (overflow 폭발 방지). */
  maxLines?: number;
}

/**
 * 직전 N분(default 5분) 채널 발화만 시간 오름차순으로 회수. daemon 이
 * "지금 어떤 흐름인지" LLM 에게 보일 때만 쓴다. 전체 history X.
 */
export function recentActiveContext(
  events: BusEvent[],
  opts: ActiveContextOpts = {},
): BusEvent[] {
  const windowMs = Math.max(1000, opts.windowMs ?? DEFAULT_ACTIVE_WINDOW_MS);
  const now = (opts.now ?? new Date()).getTime();
  const cutoff = now - windowMs;
  const maxLines = Math.max(1, opts.maxLines ?? 40);
  const out: BusEvent[] = [];
  for (const e of events) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) continue;
    if (t < cutoff || t > now) continue;
    out.push(e);
  }
  out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  if (out.length <= maxLines) return out;
  return out.slice(out.length - maxLines);
}

/**
 * Active context 를 LLM 입력용 한 줄/메시지 단순 텍스트로 직렬화. 본인
 * core-utter 도 포함(흐름 일관성 — 자기가 직전 한 말 잊고 반복 X).
 */
export function formatActiveContext(events: BusEvent[]): string {
  return events
    .map((e) => {
      const who =
        e.type === 'core-utter'
          ? `[코어:${e.coreId || '?'}]`
          : `[${e.authorName || '?'}]`;
      const text = (e.text || '').replace(/\s+/g, ' ').slice(0, 400);
      return `${who} ${text}`;
    })
    .join('\n');
}

// ── D-4: fast prefilter prompt + response parser ─────────────

export interface PrefilterInput {
  core: CoreDef;
  /** 직전 5분 context (시간 오름차순). 최신이 가장 마지막. */
  context: BusEvent[];
  /** 평가 대상 — 보통 context 의 마지막 event 와 동일. caller 가 명시. */
  latest: BusEvent;
}

export interface PrefilterDecision {
  react: boolean;
  why: string;
}

/**
 * 코어가 끼어들지 결정하는 cheap 모델용 프롬프트. silence default — 모호
 * 시 `react=false` 가 정답. role 강제 X (capability 정의로만 자기 시각
 * 자율 판단).
 */
export function buildPrefilterPrompt(input: PrefilterInput): string {
  const c = input.core;
  const ctx = formatActiveContext(input.context).slice(0, 2000);
  const latest =
    input.latest.type === 'core-utter'
      ? `[코어:${input.latest.coreId || '?'}] ${input.latest.text}`
      : `[${input.latest.authorName || '?'}] ${input.latest.text}`;
  return [
    `너는 에이전트 팀의 일원 "${c.displayName}" (id: ${c.id}) 의 *판단 head* 다. 이 채널 흐름에 끼어들지 말지 1초 안에 결정.`,
    '',
    `# 너의 capability (할 수 있는 것·권한 경계 — role 강제 X)`,
    `- 직무: ${c.role || '(미정)'}`,
    c.body
      ? c.body.slice(0, 1500) // body 는 capability/직무/escalation 디테일
      : '',
    '',
    `# 직전 5분 채널 흐름`,
    ctx || '(empty)',
    '',
    `# 평가 대상 (가장 최근 발화)`,
    latest,
    '',
    `# 결정 규칙`,
    `- 본인이 *명확한 시각*(capability 관련, 더 잘 아는 분야, 멘션됨, 사실 정정)이 *있으면* react=true.`,
    `- 시각이 모호하거나 다른 코어가 더 적합 → react=false. silence 가 default.`,
    `- 사람처럼: 의무감으로 발화 X. false-positive 비용 > false-negative.`,
    `- 사용자/다른 코어가 직접 호명·멘션 = react=true (멘션 우회).`,
    '',
    `# 출력 (JSON 한 줄, 추가 텍스트 X)`,
    `{"react": true|false, "why": "<왜 그 결정인지 한 문장>"}`,
  ].join('\n');
}

/**
 * prefilter 응답을 안전하게 파싱. 비-JSON·노이즈 = silence(react=false).
 * `{react: true|false, why: "..."}` 형식. JSON 코드펜스 동봉 시 추출.
 */
export function parsePrefilterResponse(raw: string): PrefilterDecision {
  const t = (raw || '').trim();
  if (!t) return { react: false, why: 'empty-response' };
  // 코드펜스 제거.
  const fenceStripped = t
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
    .trim();
  // 첫 `{ … }` 블록만.
  const m = fenceStripped.match(/\{[\s\S]*\}/);
  if (!m) return { react: false, why: 'no-json-found' };
  try {
    const obj = JSON.parse(m[0]) as { react?: unknown; why?: unknown };
    const react = obj.react === true || obj.react === 'true';
    const why = typeof obj.why === 'string' ? obj.why.slice(0, 200) : '';
    return { react, why };
  } catch {
    return { react: false, why: 'parse-error' };
  }
}

// ── D-5: main-model speak prompt ─────────────────────────────

export interface SpeakInput {
  core: CoreDef;
  /** prefilter 가 판단한 why — 본인 발화 방향 단서. */
  prefilterWhy: string;
  /** 직전 5분 context (시간 오름차순). */
  context: BusEvent[];
  /** 평가 대상 — context 의 마지막 event 와 동일하거나 더 최근. */
  latest: BusEvent;
  /** 코어 mem 압축 블록 (`readRecentCoreMemory` 산출). 없으면 빈 문자열. */
  recentMem?: string;
  /** 사용자/팀 호명일 때 멘션 받았음을 LLM 에 명시. */
  mentioned?: boolean;
}

/**
 * 본 모델(main) speak prompt. capability + recent work-memory + active
 * context. 페르소나/말투는 *스킨 레이어*(기존 chat-adapter / agent-webhook)
 * 가 알아서 입힘 — 본 프롬프트는 *내용* 만 결정.
 */
export function buildSpeakPrompt(input: SpeakInput): string {
  const c = input.core;
  const ctx = formatActiveContext(input.context).slice(0, 2500);
  const latest =
    input.latest.type === 'core-utter'
      ? `[코어:${input.latest.coreId || '?'}] ${input.latest.text}`
      : `[${input.latest.authorName || '?'}] ${input.latest.text}`;
  const memBlock = (input.recentMem || '').trim();
  return [
    `너는 에이전트 팀의 일원 "${c.displayName}" (id: ${c.id}) 다. 사람처럼 채팅에 *자율* 참여한다 (강제 발화 X — 본 호출 시점엔 너 스스로 끼어들기로 판단함).`,
    '',
    `# 너의 capability (할 수 있는 것·권한 경계)`,
    `- 직무: ${c.role || '(미정)'}`,
    c.body ? c.body.slice(0, 1500) : '',
    '',
    memBlock
      ? `# 너의 최근 작업 기억 (work-memory, *너만의*)\n${memBlock}\n`
      : '',
    `# 직전 5분 채널 흐름`,
    ctx || '(empty)',
    '',
    `# 평가 대상 (가장 최근 발화)`,
    latest,
    '',
    `# prefilter 가 판단한 너의 시각`,
    `- ${input.prefilterWhy || '(unspecified)'}`,
    '',
    input.mentioned
      ? `# 멘션 우회 — 너는 직접 호명되었다. 사용자/동료에게 답하라.\n`
      : '',
    `# 발화 규칙`,
    `- 1~3문장. 사람처럼 자연스럽게. 의무감으로 길게 X.`,
    `- capability 안에서만 — 모르는 도메인은 다른 코어에게 넘기는 한 줄.`,
    `- 의미 없는 동조·아첨·이모티콘 잠식 X. (페르소나 말투는 스킨이 입힘 — 본 출력은 내용만.)`,
    `- 너의 직전 발화·context 와 중복되는 말 반복 X.`,
    '',
    `# 출력 (본문만, JSON·메타 X)`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
