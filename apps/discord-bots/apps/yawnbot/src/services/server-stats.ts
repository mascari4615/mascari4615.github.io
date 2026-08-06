/**
 * 서버 결산(Wrapped) 집계 — 「우리 서버 한 주/한 해 요약 카드」의 데이터 층.
 *
 * 설계 불변 3개:
 *  1. **메시지 내용은 절대 저장하지 않는다.** 길이(글자수)·시각·이모지 이름만 센다.
 *     결산에 필요한 건 "누가 얼마나 떠들었나"지 "뭐라고 했나"가 아니다.
 *  2. **일(day) 버킷.** KST 기준 YYYY-MM-DD 로 쪼개 두면 주간/월간/연간이 전부 같은 코드로 나온다.
 *  3. **집계는 순수 함수.** 파일 I/O·throttle 은 recorder 가 갖고, 기록·요약 함수는 state 를
 *     받아 state 를 고치는 순수 로직 → 테스트가 Discord 없이 돈다.
 *
 * 저장 위치 = `data/server-stats-state.json` (`.gitignore` 의 `data/*-state.json` 에 이미 걸림).
 */
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { PKG_ROOT } from '../paths';

/** 하루치 유저 1명 기록. 내용은 없고 세는 값만. */
export interface UserDayStat {
  /** 보낸 메시지 수 */
  msgs: number;
  /** 보낸 글자 수 합 (내용 X, 길이만) */
  chars: number;
  /** 그중 새벽(KST 0~6시)에 보낸 수 */
  nightMsgs: number;
  /** 남에게 눌러 준 반응 수 */
  reactionsGiven: number;
  /** 내 메시지가 받은 반응 수 */
  reactionsGot: number;
  /** 표시용 이름 (마지막 관측값) */
  name: string;
}

export interface DayStat {
  users: Record<string, UserDayStat>;
  /** 채널별 메시지 수 */
  channels: Record<string, number>;
  /** KST 0~23시별 메시지 수 (길이 24) */
  hours: number[];
  /** 이모지 이름별 사용 수 (메시지 안 + 반응) */
  emojis: Record<string, number>;
}

export interface GuildStat {
  /** 'YYYY-MM-DD'(KST) → 하루치 */
  days: Record<string, DayStat>;
}

export interface ServerStatsState {
  version: 1;
  guilds: Record<string, GuildStat>;
  /**
   * 서버ID → 공유 키. 웹 결산 페이지 주소가 `/w/<키>` 라서,
   * 서버 ID 를 아는 것만으로는 남의 서버 결산을 열 수 없다 (주소 추측 불가).
   */
  shares: Record<string, string>;
  /**
   * 서버ID → 주간 자동 게시 설정. 켠 서버만 들어 있다 (기본 = 꺼짐).
   * 명령을 쳐야만 나오는 결산은 습관이 안 된다 — 월요일 아침에 먼저 와야 한다.
   */
  weekly: Record<string, WeeklySchedule>;
}

export interface WeeklySchedule {
  /** 게시할 채널 — 켠 사람이 명령을 친 그 채널. */
  channelId: string;
  /** 마지막으로 올린 날 (KST). 같은 주에 두 번 올리지 않기 위한 표식. */
  lastPostedDayKey: string | null;
}

/** 며칠치를 보관할지 — 연간 결산까지 커버. */
export const RETENTION_DAYS = 400;

/** 「새벽」 정의 = KST 0시 이상 6시 미만. */
export const NIGHT_START_HOUR = 0;
export const NIGHT_END_HOUR = 6;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** KST 로 옮긴 시각. getUTC* 로 읽으면 KST 벽시계 값이 나온다. */
function toKst(at: Date): Date {
  return new Date(at.getTime() + KST_OFFSET_MS);
}

/** KST 기준 날짜 키 'YYYY-MM-DD'. */
export function kstDayKey(at: Date): string {
  const k = toKst(at);
  const y = k.getUTCFullYear();
  const m = String(k.getUTCMonth() + 1).padStart(2, '0');
  const d = String(k.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** KST 기준 시(0~23). */
export function kstHour(at: Date): number {
  return toKst(at).getUTCHours();
}

/** 최근 n일치 날짜 키 (오늘 포함, 최신순). */
export function recentDayKeys(now: Date, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i += 1) {
    keys.push(kstDayKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

export function emptyState(): ServerStatsState {
  return { version: 1, guilds: {}, shares: {}, weekly: {} };
}

/** 월요일(KST) 아침 게시 기준. 시각은 「이후 아무 때나」 — 봇이 꺼져 있었어도 켜지면 따라잡는다. */
export const WEEKLY_POST_WEEKDAY = 1; // 0=일, 1=월
export const WEEKLY_POST_HOUR = 10;

/**
 * 지금 주간 결산을 올려야 하는 서버들.
 * 시각이 정확히 맞아떨어질 때만 보내면 봇이 잠깐 꺼진 주는 통째로 건너뛴다
 * → 「월요일 10시 이후이고, 이번 주에 아직 안 보냈으면」 으로 판단한다.
 */
export function dueWeeklyPosts(
  state: ServerStatsState,
  now: Date,
): { guildId: string; channelId: string }[] {
  const dayKey = kstDayKey(now);
  const weekday = weekdayOf(dayKey);
  const hour = kstHour(now);
  const due: { guildId: string; channelId: string }[] = [];

  for (const [guildId, schedule] of Object.entries(state.weekly)) {
    if (!schedule?.channelId) continue;
    // 이번 주 월요일의 날짜 키 — 이걸 표식으로 삼으면 주 단위로 정확히 한 번이 된다.
    const daysSinceMonday = (weekday + 6) % 7;
    if (daysSinceMonday === 0 && hour < WEEKLY_POST_HOUR) continue; // 월요일 아침 전
    const mondayKey = kstDayKey(new Date(now.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000));
    if (schedule.lastPostedDayKey === mondayKey) continue; // 이번 주 몫은 이미 보냄
    due.push({ guildId, channelId: schedule.channelId });
  }
  return due;
}

/** 이번 주 몫을 보냈다고 표시. 기준일 = 이번 주 월요일. */
export function markWeeklyPosted(state: ServerStatsState, guildId: string, now: Date): void {
  const schedule = state.weekly[guildId];
  if (!schedule) return;
  const daysSinceMonday = (weekdayOf(kstDayKey(now)) + 6) % 7;
  schedule.lastPostedDayKey = kstDayKey(new Date(now.getTime() - daysSinceMonday * 24 * 60 * 60 * 1000));
}

/**
 * 서버의 공유 키 — 없으면 만들어 준다. 한 번 만들면 주소가 안 바뀐다(북마크 가능).
 * 22자 base64url ≈ 128bit → 무작위로 맞힐 수 없다.
 */
export function getOrCreateShareKey(state: ServerStatsState, guildId: string): string {
  const existing = state.shares[guildId];
  if (existing) return existing;
  const key = randomBytes(16).toString('base64url');
  state.shares[guildId] = key;
  return key;
}

/** 공유 키 → 서버 ID. 모르는 키면 null. */
export function guildIdForShareKey(state: ServerStatsState, key: string): string | null {
  for (const [guildId, k] of Object.entries(state.shares)) {
    if (k === key) return guildId;
  }
  return null;
}

/** 부분/구버전 JSON → 완전한 state. 빈 입력 normalize({}) 가 곧 기본값. */
export function normalizeState(parsed: Partial<ServerStatsState> | null | undefined): ServerStatsState {
  const guilds: Record<string, GuildStat> = {};
  const rawGuilds = parsed?.guilds;
  if (rawGuilds && typeof rawGuilds === 'object') {
    for (const [guildId, guild] of Object.entries(rawGuilds)) {
      const days: Record<string, DayStat> = {};
      const rawDays = (guild as GuildStat | undefined)?.days;
      if (rawDays && typeof rawDays === 'object') {
        for (const [dayKey, day] of Object.entries(rawDays)) {
          days[dayKey] = normalizeDay(day as Partial<DayStat>);
        }
      }
      guilds[guildId] = { days };
    }
  }
  const shares: Record<string, string> = {};
  if (parsed?.shares && typeof parsed.shares === 'object') {
    for (const [guildId, key] of Object.entries(parsed.shares)) {
      if (typeof key === 'string' && key) shares[guildId] = key;
    }
  }
  const weekly: Record<string, WeeklySchedule> = {};
  if (parsed?.weekly && typeof parsed.weekly === 'object') {
    for (const [guildId, raw] of Object.entries(parsed.weekly)) {
      const s = raw as Partial<WeeklySchedule> | undefined;
      if (s && typeof s.channelId === 'string' && s.channelId) {
        weekly[guildId] = {
          channelId: s.channelId,
          lastPostedDayKey: typeof s.lastPostedDayKey === 'string' ? s.lastPostedDayKey : null,
        };
      }
    }
  }
  return { version: 1, guilds, shares, weekly };
}

function normalizeDay(day: Partial<DayStat> | undefined): DayStat {
  const hours = Array.from({ length: 24 }, (_, i) => numberAt(day?.hours, i));
  const users: Record<string, UserDayStat> = {};
  if (day?.users && typeof day.users === 'object') {
    for (const [userId, stat] of Object.entries(day.users)) {
      const s = stat as Partial<UserDayStat> | undefined;
      users[userId] = {
        msgs: safeNumber(s?.msgs),
        chars: safeNumber(s?.chars),
        nightMsgs: safeNumber(s?.nightMsgs),
        reactionsGiven: safeNumber(s?.reactionsGiven),
        reactionsGot: safeNumber(s?.reactionsGot),
        name: typeof s?.name === 'string' ? s.name : userId,
      };
    }
  }
  return {
    users,
    channels: normalizeCounter(day?.channels),
    hours,
    emojis: normalizeCounter(day?.emojis),
  };
}

function normalizeCounter(raw: Record<string, number> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw)) out[key] = safeNumber(value);
  }
  return out;
}

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function numberAt(arr: number[] | undefined, index: number): number {
  return Array.isArray(arr) ? safeNumber(arr[index]) : 0;
}

function ensureDay(state: ServerStatsState, guildId: string, dayKey: string): DayStat {
  const guild = (state.guilds[guildId] ??= { days: {} });
  return (guild.days[dayKey] ??= {
    users: {},
    channels: {},
    hours: Array.from({ length: 24 }, () => 0),
    emojis: {},
  });
}

function ensureUser(day: DayStat, userId: string, name: string): UserDayStat {
  const user = (day.users[userId] ??= {
    msgs: 0,
    chars: 0,
    nightMsgs: 0,
    reactionsGiven: 0,
    reactionsGot: 0,
    name,
  });
  // 닉네임은 바뀌므로 마지막 관측값으로 갱신.
  if (name) user.name = name;
  return user;
}

/**
 * 메시지에서 이모지 이름만 뽑는다 (내용 저장 X).
 * - 커스텀: `<:이름:id>` / `<a:이름:id>` → `이름`
 * - 유니코드: 그림문자 자체를 키로
 */
export function extractEmojiNames(content: string): string[] {
  const names: string[] = [];
  for (const match of content.matchAll(/<a?:([A-Za-z0-9_]+):\d+>/g)) {
    names.push(match[1]);
  }
  for (const match of content.matchAll(/\p{Extended_Pictographic}/gu)) {
    names.push(match[0]);
  }
  return names;
}

export interface MessageEvent {
  guildId: string;
  userId: string;
  userName: string;
  channelId: string;
  /** 메시지 내용 — 여기서 길이·이모지만 뽑고 **저장하지 않는다**. */
  content: string;
  at: Date;
}

export function recordMessage(state: ServerStatsState, event: MessageEvent): void {
  const dayKey = kstDayKey(event.at);
  const hour = kstHour(event.at);
  const day = ensureDay(state, event.guildId, dayKey);
  const user = ensureUser(day, event.userId, event.userName);

  user.msgs += 1;
  user.chars += event.content.length;
  if (hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR) user.nightMsgs += 1;
  day.channels[event.channelId] = (day.channels[event.channelId] ?? 0) + 1;
  day.hours[hour] += 1;
  for (const name of extractEmojiNames(event.content)) {
    day.emojis[name] = (day.emojis[name] ?? 0) + 1;
  }
}

export interface ReactionEvent {
  guildId: string;
  /** 반응을 누른 사람 */
  giverId: string;
  giverName: string;
  /** 반응을 받은 메시지의 작성자 (봇이면 null 로 넘겨 무시) */
  authorId: string | null;
  authorName: string | null;
  emojiName: string;
  at: Date;
}

export function recordReaction(state: ServerStatsState, event: ReactionEvent): void {
  const dayKey = kstDayKey(event.at);
  const day = ensureDay(state, event.guildId, dayKey);

  ensureUser(day, event.giverId, event.giverName).reactionsGiven += 1;
  if (event.authorId && event.authorId !== event.giverId) {
    ensureUser(day, event.authorId, event.authorName ?? event.authorId).reactionsGot += 1;
  }
  if (event.emojiName) {
    day.emojis[event.emojiName] = (day.emojis[event.emojiName] ?? 0) + 1;
  }
}

/** 보관 기간 밖 날짜 버킷을 버린다. */
export function trimState(state: ServerStatsState, now: Date, retentionDays = RETENTION_DAYS): ServerStatsState {
  const keep = new Set(recentDayKeys(now, retentionDays));
  for (const guild of Object.values(state.guilds)) {
    for (const dayKey of Object.keys(guild.days)) {
      if (!keep.has(dayKey)) delete guild.days[dayKey];
    }
  }
  return state;
}

// ────────────────────────────── 요약(카드에 실릴 값) ──────────────────────────────

export interface RankedUser {
  userId: string;
  name: string;
  value: number;
}

export interface ServerSummary {
  /** 집계 대상 일수 */
  days: number;
  /** 실제로 기록이 있는 날 수 — 0 이면 "아직 쌓인 게 없다" */
  daysWithData: number;
  totalMessages: number;
  totalChars: number;
  activeUsers: number;
  /** 수다왕 */
  topTalkers: RankedUser[];
  /** 반응을 가장 많이 받은 사람 = 인기상 */
  mostReacted: RankedUser[];
  /** 반응을 가장 많이 눌러 준 사람 = 리액션 요정 */
  topReactors: RankedUser[];
  /** 새벽(0~6시) 메시지 비율이 가장 높은 사람. 최소 표본 미달이면 null */
  nightOwl: (RankedUser & { ratio: number }) | null;
  /** 이모지 top */
  topEmojis: { name: string; count: number }[];
  /** 가장 붐빈 시각(KST) */
  busiestHour: { hour: number; count: number } | null;
  /** 가장 붐빈 채널 */
  busiestChannel: { channelId: string; count: number } | null;
  /** 24시간 분포 (스파크라인용) */
  hours: number[];
}

/** 새벽형 판정 최소 표본 — 3개 보내고 다 새벽이면 "새벽 유령"이라 하기 민망하다. */
export const NIGHT_OWL_MIN_MESSAGES = 10;

export function summarize(
  state: ServerStatsState,
  guildId: string,
  options: { days: number; now: Date; topN?: number },
): ServerSummary {
  const topN = options.topN ?? 3;
  const guild = state.guilds[guildId];
  const dayKeys = recentDayKeys(options.now, options.days);

  const users = new Map<string, UserDayStat>();
  const channels = new Map<string, number>();
  const emojis = new Map<string, number>();
  const hours = Array.from({ length: 24 }, () => 0);
  let totalMessages = 0;
  let totalChars = 0;
  let daysWithData = 0;

  for (const dayKey of dayKeys) {
    const day = guild?.days[dayKey];
    if (!day) continue;
    daysWithData += 1;
    for (const [userId, stat] of Object.entries(day.users)) {
      const acc = users.get(userId) ?? {
        msgs: 0,
        chars: 0,
        nightMsgs: 0,
        reactionsGiven: 0,
        reactionsGot: 0,
        name: stat.name,
      };
      acc.msgs += stat.msgs;
      acc.chars += stat.chars;
      acc.nightMsgs += stat.nightMsgs;
      acc.reactionsGiven += stat.reactionsGiven;
      acc.reactionsGot += stat.reactionsGot;
      if (stat.name) acc.name = stat.name;
      users.set(userId, acc);
    }
    for (const [channelId, count] of Object.entries(day.channels)) {
      channels.set(channelId, (channels.get(channelId) ?? 0) + count);
    }
    for (const [name, count] of Object.entries(day.emojis)) {
      emojis.set(name, (emojis.get(name) ?? 0) + count);
    }
    for (let h = 0; h < 24; h += 1) {
      hours[h] += day.hours[h] ?? 0;
      totalMessages += day.hours[h] ?? 0;
    }
    for (const stat of Object.values(day.users)) totalChars += stat.chars;
  }

  const rank = (pick: (s: UserDayStat) => number): RankedUser[] =>
    [...users.entries()]
      .map(([userId, stat]) => ({ userId, name: stat.name, value: pick(stat) }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value || a.userId.localeCompare(b.userId))
      .slice(0, topN);

  const busiestHour = hours.some((c) => c > 0)
    ? hours.reduce(
        (best, count, hour) => (count > best.count ? { hour, count } : best),
        { hour: 0, count: -1 },
      )
    : null;

  // 새벽 유령 = 자기 메시지 중 새벽 비율이 가장 높은 사람.
  // 표본이 적으면(3개 중 3개가 새벽) 칭호가 민망하므로 최소 표본을 건다.
  const nightOwl =
    [...users.entries()]
      .filter(([, s]) => s.msgs >= NIGHT_OWL_MIN_MESSAGES && s.nightMsgs > 0)
      .map(([userId, s]) => ({ userId, name: s.name, value: s.nightMsgs, ratio: s.nightMsgs / s.msgs }))
      .sort((a, b) => b.ratio - a.ratio || b.value - a.value || a.userId.localeCompare(b.userId))[0] ?? null;

  const busiestChannel =
    [...channels.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([channelId, count]) => ({ channelId, count }))[0] ?? null;

  return {
    days: options.days,
    daysWithData,
    totalMessages,
    totalChars,
    activeUsers: [...users.values()].filter((u) => u.msgs > 0).length,
    topTalkers: rank((s) => s.msgs),
    mostReacted: rank((s) => s.reactionsGot),
    topReactors: rank((s) => s.reactionsGiven),
    nightOwl,
    topEmojis: [...emojis.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, topN)
      .map(([name, count]) => ({ name, count })),
    busiestHour,
    busiestChannel,
    hours,
  };
}

// ────────────────────────────── 디버그 ──────────────────────────────

export interface DebugRow {
  userId: string;
  name: string;
  msgs: number;
  chars: number;
  nightMsgs: number;
  reactionsGiven: number;
  reactionsGot: number;
}

export interface DebugDump {
  /** 이 서버에 기록이 있는 날짜 키 (최신순) */
  dayKeys: string[];
  /** 오늘(KST) 날짜 키 — 방금 보낸 메시지가 여기 잡혀야 정상 */
  todayKey: string;
  /** 요청 범위 안의 유저별 원시 수치 (많이 쓴 순) */
  rows: DebugRow[];
  /** 시각별 메시지 수 (0~23시) */
  hours: number[];
  /** 채널별 메시지 수 (많은 순) */
  channels: { channelId: string; count: number }[];
  /** 이모지 전체 (많은 순) — 카드는 3개만 보여주지만 여기선 다 준다 */
  emojis: { name: string; count: number }[];
  /** 날짜별 추이 (오래된 순) — 요일·흐름을 보려면 이게 있어야 한다 */
  daily: { dayKey: string; msgs: number; users: number }[];
  /** 아직 파일에 안 쓴 변경이 있나 */
  dirty: boolean;
  /** state 파일 경로 + 존재 여부 + 마지막 저장 시각 */
  statePath: string;
  stateFileExists: boolean;
  stateFileMtime: string | null;
}

/** 원시 수치 덤프 — 카드가 이상할 때 "집계 자체가 틀렸나 표시가 틀렸나"를 가른다. */
export function debugDump(
  state: ServerStatsState,
  guildId: string,
  options: { days: number; now: Date },
): Omit<DebugDump, 'dirty' | 'statePath' | 'stateFileExists' | 'stateFileMtime'> {
  const guild = state.guilds[guildId];
  const inRange = new Set(recentDayKeys(options.now, options.days));
  const rows = new Map<string, DebugRow>();
  const hours = Array.from({ length: 24 }, () => 0);
  const channels = new Map<string, number>();
  const emojis = new Map<string, number>();
  const daily: { dayKey: string; msgs: number; users: number }[] = [];

  for (const [dayKey, day] of Object.entries(guild?.days ?? {})) {
    if (!inRange.has(dayKey)) continue;
    daily.push({
      dayKey,
      msgs: day.hours.reduce((sum, count) => sum + count, 0),
      users: Object.values(day.users).filter((u) => u.msgs > 0).length,
    });
    for (const [name, count] of Object.entries(day.emojis)) {
      emojis.set(name, (emojis.get(name) ?? 0) + count);
    }
    for (const [userId, stat] of Object.entries(day.users)) {
      const row = rows.get(userId) ?? {
        userId,
        name: stat.name,
        msgs: 0,
        chars: 0,
        nightMsgs: 0,
        reactionsGiven: 0,
        reactionsGot: 0,
      };
      row.name = stat.name || row.name;
      row.msgs += stat.msgs;
      row.chars += stat.chars;
      row.nightMsgs += stat.nightMsgs;
      row.reactionsGiven += stat.reactionsGiven;
      row.reactionsGot += stat.reactionsGot;
      rows.set(userId, row);
    }
    for (let h = 0; h < 24; h += 1) hours[h] += day.hours[h] ?? 0;
    for (const [channelId, count] of Object.entries(day.channels)) {
      channels.set(channelId, (channels.get(channelId) ?? 0) + count);
    }
  }

  return {
    dayKeys: Object.keys(guild?.days ?? {}).sort().reverse(),
    todayKey: kstDayKey(options.now),
    rows: [...rows.values()].sort((a, b) => b.msgs - a.msgs || a.userId.localeCompare(b.userId)),
    hours,
    channels: [...channels.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([channelId, count]) => ({ channelId, count })),
    emojis: [...emojis.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([name, count]) => ({ name, count })),
    daily: daily.sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
  };
}

// ────────────────────────────── 대시보드 분석 ──────────────────────────────

export interface PeriodTotals {
  messages: number;
  chars: number;
  activeUsers: number;
  reactions: number;
}

export interface Analytics {
  days: number;
  /** 집계 범위 (KST 날짜 키) */
  from: string;
  to: string;
  /** 이번 기간 / 바로 앞의 같은 길이 기간 — 늘었나 줄었나를 보려면 둘 다 필요하다 */
  current: PeriodTotals;
  previous: PeriodTotals;
  /** 날짜별 (오래된 순, 빈 날도 0 으로 채움 — 끊긴 날이 보여야 리듬이 읽힌다) */
  daily: { dayKey: string; msgs: number; users: number }[];
  /** [요일][시각] 메시지 수. 요일 0=일 … 6=토 */
  weekdayHour: number[][];
  /** 사람별 전체 (많이 쓴 순) */
  people: DebugRow[];
  channels: { channelId: string; count: number }[];
  emojis: { name: string; count: number }[];
  /** 이 기간에 처음 말한 사람 / 전에도 말했던 사람 */
  newUsers: number;
  returningUsers: number;
  hours: number[];
  busiestDay: { dayKey: string; msgs: number } | null;
}

const EMPTY_TOTALS: PeriodTotals = { messages: 0, chars: 0, activeUsers: 0, reactions: 0 };

/** 'YYYY-MM-DD' → 요일 (0=일). KST 날짜 문자열을 그대로 달력 날짜로 읽는다. */
export function weekdayOf(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function totalsFor(guild: GuildStat | undefined, dayKeys: string[]): PeriodTotals {
  // 참여자는 ID 로 센다 — 닉네임은 기간 중에 바뀔 수 있어 이름으로 세면 두 명이 된다.
  const ids = new Set<string>();
  let messages = 0;
  let chars = 0;
  let reactions = 0;
  for (const dayKey of dayKeys) {
    const day = guild?.days[dayKey];
    if (!day) continue;
    for (const [userId, stat] of Object.entries(day.users)) {
      chars += stat.chars;
      reactions += stat.reactionsGiven;
      if (stat.msgs > 0) ids.add(userId);
    }
    messages += day.hours.reduce((sum, count) => sum + count, 0);
  }
  return { messages, chars, reactions, activeUsers: ids.size };
}

export function buildAnalytics(
  state: ServerStatsState,
  guildId: string,
  options: { days: number; now: Date },
): Analytics {
  const guild = state.guilds[guildId];
  const currentKeys = recentDayKeys(options.now, options.days);
  const previousStart = new Date(options.now.getTime() - options.days * 24 * 60 * 60 * 1000);
  const previousKeys = recentDayKeys(previousStart, options.days);

  const detail = debugDump(state, guildId, options);

  // 빈 날도 0 으로 채운다 — 안 그러면 "쉰 날" 이 그래프에서 사라진다.
  const byDay = new Map(detail.daily.map((d) => [d.dayKey, d]));
  const daily = currentKeys
    .slice()
    .reverse()
    .map((dayKey) => byDay.get(dayKey) ?? { dayKey, msgs: 0, users: 0 });

  const weekdayHour = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const dayKey of currentKeys) {
    const day = guild?.days[dayKey];
    if (!day) continue;
    const weekday = weekdayOf(dayKey);
    for (let h = 0; h < 24; h += 1) weekdayHour[weekday][h] += day.hours[h] ?? 0;
  }

  // 처음 말한 사람 = 이 기간 이전 기록에 한 번도 없던 사람.
  const before = new Set<string>();
  const inRange = new Set(currentKeys);
  for (const [dayKey, day] of Object.entries(guild?.days ?? {})) {
    if (inRange.has(dayKey)) continue;
    if (dayKey >= currentKeys[0]) continue; // 미래 키(시계 어긋남) 무시
    for (const [userId, stat] of Object.entries(day.users)) {
      if (stat.msgs > 0) before.add(userId);
    }
  }
  let newUsers = 0;
  let returningUsers = 0;
  for (const row of detail.rows) {
    if (row.msgs === 0) continue;
    if (before.has(row.userId)) returningUsers += 1;
    else newUsers += 1;
  }

  const busiestDay =
    daily.reduce<{ dayKey: string; msgs: number } | null>(
      (best, d) => (d.msgs > 0 && (!best || d.msgs > best.msgs) ? { dayKey: d.dayKey, msgs: d.msgs } : best),
      null,
    );

  return {
    days: options.days,
    from: currentKeys[currentKeys.length - 1],
    to: currentKeys[0],
    current: guild ? totalsFor(guild, currentKeys) : { ...EMPTY_TOTALS },
    previous: guild ? totalsFor(guild, previousKeys) : { ...EMPTY_TOTALS },
    daily,
    weekdayHour,
    people: detail.rows,
    channels: detail.channels,
    emojis: detail.emojis,
    newUsers,
    returningUsers,
    hours: detail.hours,
    busiestDay,
  };
}

// ────────────────────────────── 저장소(recorder) ──────────────────────────────

const STATE_FILE = 'server-stats-state.json';

/**
 * 메시지마다 파일을 쓰면 디스크가 아프다 → 메모리에 모으고 주기적으로 flush.
 * 프로세스가 죽어도 잃는 건 마지막 몇 초치 카운트뿐이라 결산에 영향 없다.
 */
export class ServerStatsRecorder {
  private state: ServerStatsState | null = null;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE),
    private readonly flushIntervalMs = 20_000,
  ) {}

  load(): ServerStatsState {
    if (this.state) return this.state;
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<ServerStatsState>;
        this.state = normalizeState(parsed);
        return this.state;
      }
    } catch (err) {
      console.warn('[ServerStats] state 읽기 실패 — 새 state 로 시작:', err);
    }
    this.state = emptyState();
    return this.state;
  }

  /** state 를 고치는 모든 진입점. 고치면 dirty 표시 + flush 타이머 예약. */
  private mutate(fn: (state: ServerStatsState) => void): void {
    const state = this.load();
    fn(state);
    this.dirty = true;
    this.scheduleFlush();
  }

  onMessage(event: MessageEvent): void {
    this.mutate((state) => recordMessage(state, event));
  }

  onReaction(event: ReactionEvent): void {
    this.mutate((state) => recordReaction(state, event));
  }

  summarize(guildId: string, days: number, now = new Date()): ServerSummary {
    return summarize(this.load(), guildId, { days, now });
  }

  /** 원시 수치 + 저장 상태. 카드가 이상할 때 여기부터 본다. */
  debug(guildId: string, days: number, now = new Date()): DebugDump {
    const dump = debugDump(this.load(), guildId, { days, now });
    let stateFileExists = false;
    let stateFileMtime: string | null = null;
    try {
      const stat = fs.statSync(this.statePath);
      stateFileExists = true;
      stateFileMtime = stat.mtime.toISOString();
    } catch {
      // 아직 한 번도 저장 안 됨 = 정상(첫 flush 전).
    }
    return { ...dump, dirty: this.dirty, statePath: this.statePath, stateFileExists, stateFileMtime };
  }

  /** 디버그용 즉시 저장 — 20초 기다리지 않고 파일을 눈으로 확인하고 싶을 때. */
  flushNow(): void {
    this.flush();
  }

  /** 대시보드용 분석 (기간 비교·요일×시각 포함). */
  analytics(guildId: string, days: number, now = new Date()): Analytics {
    return buildAnalytics(this.load(), guildId, { days, now });
  }

  /** 웹 결산 주소용 공유 키 (없으면 생성 + 저장). */
  shareKey(guildId: string): string {
    const state = this.load();
    const before = state.shares[guildId];
    const key = getOrCreateShareKey(state, guildId);
    if (!before) {
      this.dirty = true;
      this.flush();
    }
    return key;
  }

  /** 공유 키로 서버 찾기 — 모르는 키면 null. */
  guildIdForShareKey(key: string): string | null {
    return guildIdForShareKey(this.load(), key);
  }

  /** 주간 자동 게시 켜기/끄기. 켜면 그 채널로 월요일마다 간다. */
  setWeekly(guildId: string, channelId: string | null): void {
    const state = this.load();
    if (channelId) state.weekly[guildId] = { channelId, lastPostedDayKey: null };
    else delete state.weekly[guildId];
    this.dirty = true;
    this.flush();
  }

  weeklyOf(guildId: string): WeeklySchedule | null {
    return this.load().weekly[guildId] ?? null;
  }

  /** 지금 보내야 할 주간 결산 목록. */
  dueWeekly(now = new Date()): { guildId: string; channelId: string }[] {
    return dueWeeklyPosts(this.load(), now);
  }

  markWeeklyPosted(guildId: string, now = new Date()): void {
    markWeeklyPosted(this.load(), guildId, now);
    this.dirty = true;
    this.flush();
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.flushIntervalMs);
    this.timer.unref?.();
  }

  flush(now = new Date()): void {
    if (!this.dirty || !this.state) return;
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      trimState(this.state, now);
      fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      this.dirty = false;
    } catch (err) {
      // 통계 저장 실패가 봇을 막지 않는다.
      console.warn('[ServerStats] state 저장 실패:', err);
    }
  }
}

let recorder: ServerStatsRecorder | null = null;

export function getServerStatsRecorder(): ServerStatsRecorder {
  return (recorder ??= new ServerStatsRecorder());
}
