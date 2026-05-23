/**
 * agent-channel-bus — substrate⊥어댑터 의 *어댑터 무관* 메시지 substrate
 * (TASK-KAR-018-LT-DIVERSITY, D-1).
 *
 * 왜 이 substrate (사용자 비전 2026-05-23):
 * 코어(에이전트 정체) = 독립 daemon process · adapter(Discord/Web/CLI/KL) =
 * thin I/O bridge. 살아있음의 정의가 process-centric 이려면 daemon ↔ adapter
 * 가 *프로세스 분리된 채로* 비동기 통신할 substrate 필요. 그 substrate =
 * 파일 jsonl append-only(편한 race-free reader, 재기동 시 history 재구성
 * 자동, OS atomic append per ≤PIPE_BUF). Redis/SQLite 같은 외부 의존 X
 * (재현성·자기증식 정합).
 *
 * 기존 `agent-bus.ts` 는 *제안 카드*(forum 게시 / verdict reconcile) 의 어댑터
 * 층 → 그건 그대로 두고, 본 모듈은 *채널 발화 이벤트* (ambient message + core
 * utterance) 의 substrate 층으로 분리. 평행정의 X — 둘은 *다른 객체*(제안
 * 카드 vs 채널 발화).
 *
 * Path 정본: `<MEMO_REPO_PATH>/.claude/agent-channel-bus/<channelId>/<YYYY-MM-DD>.jsonl`
 * (KST 일자). 채널별 디렉토리 분리 = 다른 채널 이벤트가 한 파일에 섞이지 X →
 * 한 daemon 이 본인 listening 채널만 tail 하면 됨. 일자 파일 분리 = 무한
 * 누적 X, 회전 자동(파일 시스템 ls).
 *
 * Schema (BusEvent):
 *   ts: ISO ts (event 시각)
 *   source: 'discord' | 'web' | 'cli' | 'kl' | string (adapter id)
 *   type: 'channel-msg' (외부 사용자/봇 발화) | 'core-utter' (코어 daemon 발화)
 *   channelId: 외부 채널 식별자 (Discord channel id 등)
 *   coreId?: type==='core-utter' 시 발화 코어 id
 *   authorName?: 외부 사용자 username / 코어 displayName (UX)
 *   authorId?: 외부 사용자 id (멘션 우회 매칭용)
 *   text: 본문
 *   refs?: { mentionedCoreIds?, mentionedUserIds?, replyToTs? } — 멘션·답글
 *
 * 안전 바닥: writer best-effort(IO 실패 = throw X, 봇 진행 막지 X). reader
 * 손상 라인 = 폐기(다른 라인 계속 — 한 lookup 이 전체 hist 회수 막지 X).
 */
import fs from 'fs';
import path from 'path';

export type BusEventType = 'channel-msg' | 'core-utter';

export interface BusEventRefs {
  /** 멘션된 코어 id(들) — 운영자가 '@atlas …' 호명 / 코어가 다른 코어 언급. */
  mentionedCoreIds?: string[];
  /** 멘션된 외부 user id(들) — Discord <@123…> 파싱 결과. */
  mentionedUserIds?: string[];
  /** 답글이 가리키는 원본 ts (옵션). */
  replyToTs?: string;
}

export interface BusEvent {
  ts: string;
  source: string;
  type: BusEventType;
  channelId: string;
  coreId?: string;
  authorName?: string;
  authorId?: string;
  text: string;
  refs?: BusEventRefs;
}

/** channelId 가 path traversal 등 위험 문자 포함 X 인지 (substrate 보호). */
const SAFE_CHANNEL_ID = /^[A-Za-z0-9._-]{1,64}$/;

/** memo 루트가 비었으면 substrate 미가용. */
function memoRoot(env: NodeJS.ProcessEnv): string {
  return (env.MEMO_REPO_PATH || '').trim();
}

/** `<MEMO>/.claude/agent-channel-bus` (channel 디렉토리들의 부모). */
export function busDir(env: NodeJS.ProcessEnv): string {
  const root = memoRoot(env);
  return root ? path.join(root, '.claude', 'agent-channel-bus') : '';
}

/** `<MEMO>/.claude/agent-channel-bus/<channelId>` (한 채널의 일자 파일들). */
export function channelDir(
  env: NodeJS.ProcessEnv,
  channelId: string,
): string {
  const dir = busDir(env);
  if (!dir) return '';
  if (!SAFE_CHANNEL_ID.test(channelId || '')) return '';
  return path.join(dir, channelId);
}

/** KST 일자 (`YYYY-MM-DD`). */
function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** `<MEMO>/.claude/agent-channel-bus/<channelId>/<YYYY-MM-DD>.jsonl`. */
export function dayFilePath(
  env: NodeJS.ProcessEnv,
  channelId: string,
  date?: Date,
): string {
  const dir = channelDir(env, channelId);
  if (!dir) return '';
  return path.join(dir, `${kstDate(date ?? new Date())}.jsonl`);
}

/** event ts 보강 + 검증 (스키마 노이즈 차단). */
function normalizeEvent(e: BusEvent): BusEvent | null {
  if (!e || typeof e !== 'object') return null;
  const t = (e.type || '').trim();
  if (t !== 'channel-msg' && t !== 'core-utter') return null;
  if (!SAFE_CHANNEL_ID.test(e.channelId || '')) return null;
  const ts = (e.ts || '').trim() || new Date().toISOString();
  const text = String(e.text ?? '').slice(0, 6000);
  // text 비었어도 허용 (embed-only 등) — 단 type 별 일관성:
  // core-utter 면 coreId 필수.
  if (t === 'core-utter' && !(e.coreId || '').trim()) return null;
  return {
    ts,
    source: (e.source || '').trim() || 'unknown',
    type: t as BusEventType,
    channelId: e.channelId,
    coreId: e.coreId?.trim() || undefined,
    authorName: e.authorName?.trim() || undefined,
    authorId: e.authorId?.trim() || undefined,
    text,
    refs: e.refs,
  };
}

/**
 * BusEvent 1건 append (best-effort, throw X). substrate 미가용(MEMO_REPO_PATH
 * 미설정 / 부적합 channelId / IO 실패) = false, 봇 진행은 막지 X.
 */
export function appendBusEvent(
  env: NodeJS.ProcessEnv,
  event: BusEvent,
): boolean {
  const norm = normalizeEvent(event);
  if (!norm) return false;
  const p = dayFilePath(env, norm.channelId, new Date(norm.ts));
  if (!p) return false;
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.appendFileSync(p, JSON.stringify(norm) + '\n', 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export interface ReadOpts {
  /** 이 ts 이후(exclusive) 만 반환. ISO. 미지정 = 전체 일자 파일. */
  sinceTs?: string;
  /** 오늘 외 추가로 회수할 과거 일자 (0=오늘만, 1=어제까지, …). default=1. */
  daysBack?: number;
  /** 회수 상한 (가장 최근 N개). default=200. */
  limit?: number;
  /** "지금"(test inject). */
  now?: Date;
}

/**
 * 채널의 최근 BusEvent 회수 (ts 오름차순). 일자 파일 분할 회전 = 오늘 +
 * daysBack 일자만 ls/read (무한 누적 read X). 손상 라인 = 폐기·계속 (한
 * 줄 망가져도 전체 회수 막지 X). 채널 미존재 / substrate 미가용 = [].
 */
export function readRecentBusEvents(
  env: NodeJS.ProcessEnv,
  channelId: string,
  opts: ReadOpts = {},
): BusEvent[] {
  const dir = channelDir(env, channelId);
  if (!dir || !fs.existsSync(dir)) return [];
  const now = opts.now ?? new Date();
  const daysBack = Math.max(0, opts.daysBack ?? 1);
  const dayFiles: string[] = [];
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const p = path.join(dir, `${kstDate(d)}.jsonl`);
    if (fs.existsSync(p)) dayFiles.push(p);
  }
  // 일자 파일은 오늘이 마지막 → 시간순으로 자연 정렬되도록 reverse.
  dayFiles.reverse();
  const out: BusEvent[] = [];
  const sinceMs = opts.sinceTs ? Date.parse(opts.sinceTs) : null;
  for (const p of dayFiles) {
    let text: string;
    try {
      text = fs.readFileSync(p, 'utf-8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      let e: BusEvent;
      try {
        e = JSON.parse(t) as BusEvent;
      } catch {
        continue;
      }
      const norm = normalizeEvent(e);
      if (!norm) continue;
      if (sinceMs !== null) {
        const evMs = Date.parse(norm.ts);
        if (!Number.isFinite(evMs) || evMs <= sinceMs) continue;
      }
      out.push(norm);
    }
  }
  // 같은 ts 면 일자 파일 + append 순서대로(stable). 충돌 정렬 X.
  out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const limit = Math.max(1, opts.limit ?? 200);
  if (out.length <= limit) return out;
  return out.slice(out.length - limit);
}

/**
 * 마지막 코어-utter 시각(코어별, KST 오늘 한정). rate-limit/적합도 측정의
 * 베이스 — 일자 파일만 보면 됨(슬라이딩 윈도우는 caller 가 ts 비교).
 * 부재 = null.
 */
export function lastCoreUtterTs(
  env: NodeJS.ProcessEnv,
  channelId: string,
  coreId: string,
  now?: Date,
): string | null {
  const events = readRecentBusEvents(env, channelId, { daysBack: 0, now });
  let last: string | null = null;
  for (const e of events) {
    if (e.type === 'core-utter' && e.coreId === coreId) last = e.ts;
  }
  return last;
}
