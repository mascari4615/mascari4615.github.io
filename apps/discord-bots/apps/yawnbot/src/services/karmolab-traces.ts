/**
 * KarmoLab 흔적 원장 (TASK-KL-098 Cycle 2).
 *
 * 왜 있나: Cycle 1 로 「내 기록」은 남게 됐지만, 사이트에는 여전히 **남의 흔적이 하나도 안 보인다**.
 * 사람이 와도 왔다는 자국이 안 남으면 아무리 와도 빈 곳으로 보인다 — 「북적북적」의 반대.
 *
 * 왜 원장 하나인가: 사용 횟수·요청·투표를 각자 저장소로 만들면 다음에 「활동 피드」·「랭킹」을
 * 붙일 때 또 새로 만들어야 한다. 흔적은 종류만 다를 뿐 같은 것이므로 한자리에 모은다.
 *
 * 지어낸 수는 절대 안 넣는다. 여기 있는 숫자는 전부 실제로 일어난 일이다.
 * 그래서 초반에는 작을 것이고, 작은 게 맞다.
 *
 * 저장 = `data/karmolab-traces-state.json` (`.gitignore` 의 `data/*-state.json`).
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

/** 도구 하나의 쓰임. 날짜별로 나눠 둬야 「요즘 뜨는 도구」를 뒤에 붙일 수 있다. */
interface ToolTrace {
  total: number;
  /** YYYY-MM-DD(KST) → 그날 열린 횟수. 오래된 날은 버린다. */
  days: Record<string, number>;
  lastOpenedAt: string;
}

export interface ToolRequest {
  id: string;
  text: string;
  authorHandle: string;
  authorAccountId: string;
  createdAt: string;
  /** 투표한 계정 id. 사람 수를 세려면 목록이어야 한다 (숫자만 두면 두 번 눌러도 못 막는다). */
  voterAccountIds: string[];
  status: 'open' | 'planned' | 'done' | 'declined';
  /** 주인이 남기는 한 줄 답. 답이 돌아오는 곳이라야 사람이 또 쓴다. */
  reply: string | null;
}

interface TracesState {
  version: 1;
  tools: Record<string, ToolTrace>;
  requests: ToolRequest[];
}

const STATE_FILE = 'karmolab-traces-state.json';

/** 날짜별 칸을 남겨 두는 기간. 이보다 오래된 날은 합계에만 남고 칸은 버린다. */
const DAY_RETENTION = 60;

/** 같은 사람이 한 도구를 계속 눌러도 이 시간 안에는 한 번만 센다. */
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

/** 요청 글 길이 상한. 게시판이 아니라 한 줄 요청이다. */
export const REQUEST_MAX_LEN = 200;

/** 한 계정이 하루에 올릴 수 있는 요청 수. */
export const REQUEST_DAILY_LIMIT = 5;

/** 오늘(KST) 날짜 문자열. 사이트 전체가 KST 로 말한다. */
export function kstDay(now: Date = new Date()): string {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 도구 id 로 받아들일 모양인지. 아무 문자열이나 받으면 원장이 쓰레기로 찬다. */
export function isValidToolId(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(raw);
}

export interface ToolStat {
  toolId: string;
  total: number;
  /** 최근 7일 합 — 「요즘」을 보여주는 값. */
  recent: number;
}

export interface PublicRequest {
  id: string;
  text: string;
  authorHandle: string;
  createdAt: string;
  votes: number;
  status: ToolRequest['status'];
  reply: string | null;
  /** 지금 보는 사람이 이미 눌렀나. 로그인 안 했으면 false. */
  votedByMe: boolean;
}

export class KarmolabTraceStore {
  private state: TracesState;
  private dirty = false;
  /** `<방문자열쇠>:<도구>` → 마지막으로 센 시각. 메모리에만 둔다 (재시작하면 한 번 더 세도 무해). */
  private readonly recentOpens = new Map<string, number>();

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
  }

  private load(): TracesState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<TracesState>;
        return { version: 1, tools: parsed.tools ?? {}, requests: parsed.requests ?? [] };
      }
    } catch (error) {
      console.error('[karmolab-traces] 상태 파일을 못 읽었다 — 빈 원장으로 시작한다:', error);
    }
    return { version: 1, tools: {}, requests: [] };
  }

  /**
   * 저장. 도구 열림은 자주 일어나므로 **매번 디스크에 쓰지 않는다** —
   * 표시만 해 두고 `flush()` 가 실제로 쓴다 (호출부가 주기적으로 부른다).
   */
  private markDirty(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
      this.dirty = false;
    } catch (error) {
      console.error('[karmolab-traces] 상태 저장 실패:', error);
    }
  }

  /**
   * 방문자를 가리키는 열쇠 — **주소 자체는 저장하지 않는다.**
   * 같은 사람인지만 알면 되지 누구인지는 알 필요가 없다. 그래서 되돌릴 수 없게 섞어서 쓴다.
   */
  static visitorKey(ip: string, userAgent: string): string {
    return crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex').slice(0, 16);
  }

  /**
   * 도구가 열렸다. 이미 최근에 센 사람이면 세지 않는다.
   * @returns 실제로 셌으면 true.
   */
  recordToolOpen(toolId: string, visitorKey: string, now: Date = new Date()): boolean {
    if (!isValidToolId(toolId)) return false;

    const dedupeKey = `${visitorKey}:${toolId}`;
    const last = this.recentOpens.get(dedupeKey);
    if (last !== undefined && now.getTime() - last < DEDUPE_WINDOW_MS) return false;
    this.recentOpens.set(dedupeKey, now.getTime());
    // 메모리에 무한정 쌓이지 않게 가끔 훑어 버린다.
    if (this.recentOpens.size > 20000) {
      const cutoff = now.getTime() - DEDUPE_WINDOW_MS;
      for (const [key, at] of this.recentOpens) if (at < cutoff) this.recentOpens.delete(key);
    }

    const day = kstDay(now);
    const trace = this.state.tools[toolId] ?? { total: 0, days: {}, lastOpenedAt: now.toISOString() };
    trace.total += 1;
    trace.days[day] = (trace.days[day] ?? 0) + 1;
    trace.lastOpenedAt = now.toISOString();

    const keep = Object.keys(trace.days).sort().slice(-DAY_RETENTION);
    if (keep.length < Object.keys(trace.days).length) {
      const trimmed: Record<string, number> = {};
      for (const key of keep) trimmed[key] = trace.days[key];
      trace.days = trimmed;
    }

    this.state.tools[toolId] = trace;
    this.markDirty();
    return true;
  }

  /** 공개 집계. 한 번도 안 열린 도구는 아예 안 나온다 — 0 을 줄줄이 보여줄 이유가 없다. */
  toolStats(now: Date = new Date()): ToolStat[] {
    const recentDays = new Set<string>();
    for (let i = 0; i < 7; i += 1) {
      recentDays.add(kstDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
    }
    return Object.entries(this.state.tools)
      .map(([toolId, trace]) => {
        let recent = 0;
        for (const day of recentDays) recent += trace.days[day] ?? 0;
        return { toolId, total: trace.total, recent };
      })
      .sort((a, b) => b.recent - a.recent || b.total - a.total);
  }

  /** 사이트가 얼마나 쓰였나 한 줄 — 실제 합계다. */
  pulse(now: Date = new Date()): { toolsUsed: number; opensTotal: number; opensToday: number } {
    const today = kstDay(now);
    let opensTotal = 0;
    let opensToday = 0;
    for (const trace of Object.values(this.state.tools)) {
      opensTotal += trace.total;
      opensToday += trace.days[today] ?? 0;
    }
    return { toolsUsed: Object.keys(this.state.tools).length, opensTotal, opensToday };
  }

  /** 오늘 이 계정이 몇 개 올렸나 — 도배 방지. */
  requestsTodayBy(accountId: string, now: Date = new Date()): number {
    const today = kstDay(now);
    return this.state.requests.filter((r) => r.authorAccountId === accountId && kstDay(new Date(r.createdAt)) === today)
      .length;
  }

  addRequest(input: { text: string; accountId: string; handle: string }, now: Date = new Date()): ToolRequest {
    const request: ToolRequest = {
      id: crypto.randomUUID(),
      text: input.text,
      authorHandle: input.handle,
      authorAccountId: input.accountId,
      createdAt: now.toISOString(),
      // 올린 사람은 이미 원하는 사람이다. 자기 요청에 또 눌러야 하면 첫 표가 어색하게 0 이 된다.
      voterAccountIds: [input.accountId],
      status: 'open',
      reply: null,
    };
    this.state.requests.unshift(request);
    this.markDirty();
    return request;
  }

  /** 투표는 껐다 켰다 한다. @returns 지금 눌린 상태인가. null = 없는 요청. */
  toggleVote(requestId: string, accountId: string): boolean | null {
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) return null;
    const index = request.voterAccountIds.indexOf(accountId);
    if (index >= 0) request.voterAccountIds.splice(index, 1);
    else request.voterAccountIds.push(accountId);
    this.markDirty();
    return index < 0;
  }

  /** 주인이 답·상태를 고친다. 준 것만 바꾼다 (빠뜨린 항목은 그대로). */
  updateRequest(requestId: string, patch: { status?: unknown; reply?: unknown }): ToolRequest | null {
    const request = this.state.requests.find((r) => r.id === requestId);
    if (!request) return null;
    const allowed: ToolRequest['status'][] = ['open', 'planned', 'done', 'declined'];
    if (typeof patch.status === 'string' && allowed.includes(patch.status as ToolRequest['status'])) {
      request.status = patch.status as ToolRequest['status'];
    }
    if (typeof patch.reply === 'string') {
      const reply = patch.reply.trim().slice(0, REQUEST_MAX_LEN);
      request.reply = reply.length ? reply : null;
    }
    this.markDirty();
    return request;
  }

  /** 표 많은 순. 같으면 새 것 먼저 — 오래된 것이 위를 영원히 차지하지 않게. */
  publicRequests(viewerAccountId: string | null): PublicRequest[] {
    return [...this.state.requests]
      .sort((a, b) => b.voterAccountIds.length - a.voterAccountIds.length || b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.id,
        text: r.text,
        authorHandle: r.authorHandle,
        createdAt: r.createdAt,
        votes: r.voterAccountIds.length,
        status: r.status,
        reply: r.reply,
        votedByMe: viewerAccountId ? r.voterAccountIds.includes(viewerAccountId) : false,
      }));
  }
}

let singleton: KarmolabTraceStore | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;

export function getKarmolabTraceStore(): KarmolabTraceStore {
  if (!singleton) {
    singleton = new KarmolabTraceStore();
    // 도구 열림은 잦다. 모아서 20초에 한 번 쓴다 — 봇이 죽어도 20초어치만 잃는다.
    flushTimer = setInterval(() => singleton?.flush(), 20_000);
    flushTimer.unref?.();
  }
  return singleton;
}
