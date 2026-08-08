/**
 * KarmoLab 계정 저장소 (TASK-KL-098 Cycle 1).
 *
 * 왜 있나: 지금까지 KarmoLab 의 도전과제·뱃지·연속기록은 **브라우저 안에만** 있었다
 * (`apps/karmolab/src/widgets/user.ts` 의 localStorage). 브라우저를 지우면 증발하고,
 * 남에게는 한 글자도 안 보인다 — 「내 기록이 남는다」·「북적북적」의 정반대다.
 * 이 파일이 그 기록의 새 정본이다.
 *
 * 왜 자체 계정인가 (사용자 결정 2026-08-07): 기록·프로필의 소유는 우리 서버다.
 * 디스코드는 **로그인 수단 하나**로 붙을 뿐이라, 나중에 패스키·다른 수단을 같은 계정에
 * 더 걸 수 있다 (`identities` 가 배열이 아니라 종류별 칸인 이유).
 *
 * 저장 위치 = `data/karmolab-accounts-state.json` (`.gitignore` 의 `data/*-state.json` 에 이미 걸림).
 * server-stats 와 같은 패턴 — 프로세스가 죽어도 남고, 레포에는 안 올라간다.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PKG_ROOT } from '../paths';

/** 도구들이 쌓는 기록. 브라우저에 있던 모양을 그대로 받는다 (변환 없이 왕복). */
export interface AccountRecords {
  /** 달성한 도전과제 id */
  achievements: string[];
  /** 획득한 뱃지 id */
  badges: string[];
  /** 누적 카운터 — 예: `pet_strokes` */
  progress: Record<string, number>;
  /** 연속 기록 — 트랙 id → 현재·최장·마지막 활동일 */
  streaks: Record<string, { current: number; longest: number; lastActivityDate: string | null }>;
}

export interface AccountIdentityDiscord {
  discordId: string;
  username: string;
  linkedAt: string;
}

/**
 * 계정별 발자국 (TASK-KL-152 C1).
 *
 * 서버는 「어느 도구가 열렸나」를 오래전부터 세고 있었다 — 그런데 **익명 집계뿐**이라
 * 「내가 무엇을 했나」는 아무도 못 봤다. 모으기만 하고 안 돌려주면 없는 것과 같다.
 * 잔디(C2)·돌아보기(C3)가 전부 이 한 벌 위에 선다.
 *
 * 로그인한 사람만 쌓인다. 안 한 사람 것은 지금까지처럼 익명 집계로만 남는다.
 */
export interface AccountFootprint {
  /** `YYYY-MM-DD`(KST) → 그날 연 도구 수. 그냥 다녀가기만 해도 그날은 0 으로 찍힌다. */
  days: Record<string, number>;
  /** 도구 id → 연 횟수 (누적) */
  tools: Record<string, number>;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

/** 잔디는 1년 남짓이면 된다. 그보다 오래된 날은 지운다 — 파일이 끝없이 커지지 않게. */
export const FOOTPRINT_KEEP_DAYS = 400;

/** 이 사이트는 KST 로 말한다. 날짜 칸이 UTC 면 밤에 연 것이 「어제」로 찍힌다. */
export function kstDayKey(at: Date = new Date()): string {
  // en-CA 는 `YYYY-MM-DD` 로 준다 — 손으로 자르지 않는다.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(at);
}

/** 날짜 칸에서 하루 뒤로 (문자열만으로 옮긴다 — 시간대에 다시 안 걸리게). */
function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export interface Account {
  id: string;
  /** 공개 주소에 쓰는 이름 (`/karmolab/u/<handle>`). 소문자·영숫자·`-`·`_` 만. */
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
  identities: { discord?: AccountIdentityDiscord };
  records: AccountRecords;
  recordsUpdatedAt: string | null;
  /**
   * 복구 코드 — **들어오는 문이 하나뿐이면 그 문이 잠기는 날 계정을 통째로 잃는다.**
   * 디스코드 계정을 잃거나 정지당하면 지금은 되찾을 방법이 하나도 없다.
   *
   * 원문은 저장하지 않는다. 되돌릴 수 없게 섞은 값만 둔다 — 이 파일이 새어 나가도
   * 그것으로는 아무도 로그인하지 못한다. 원문은 만들 때 딱 한 번 보여 준다.
   */
  recoveryCodes?: { hash: string; usedAt: string | null }[];
  /** 내가 언제 무엇을 열었나 (TASK-KL-152 C1). 없을 수 있다 — 옛 계정은 이 칸 없이 저장돼 있다. */
  footprint?: AccountFootprint;
  /** 남에게 무엇을 보일지 (TASK-KL-152 C4). 없으면 지금까지처럼 전부 공개. */
  visibility?: Partial<AccountVisibility>;
  /** 프로필 꾸미기 (TASK-KL-152 C5). 안 채우면 지금과 똑같은 모습이다. */
  card?: ProfileCard;
  /** 내 계정에 무슨 일이 있었나 (TASK-KL-152 C7). 최근 것부터. */
  events?: AccountEvent[];
}

/**
 * 프로필 꾸미기 (TASK-KL-152 C5).
 *
 * 지금 프로필은 **아무나 똑같이 생겼다** — 이름·아바타·숫자뿐이라 누구 것인지 말해 주는
 * 자리가 없다. 한 줄 소개와 「내가 자주 쓰는 것」이 있으면 그때부터 명함이 된다
 * (GitHub 프로필 README · Steam 쇼케이스가 같은 자리를 그렇게 쓴다).
 *
 * 자유 HTML 은 안 받는다. 글 한 줄과 **우리 도구 id 목록**뿐이라, 남의 화면에서 무엇이
 * 그려질지 우리가 전부 안다.
 */
export interface ProfileCard {
  /** 한 줄 소개 */
  bio: string;
  /** 대표 도구 id (최대 3개) */
  pins: string[];
}

export const BIO_MAX = 80;
export const PIN_MAX = 3;

/** 도구 id 로 받아들일 모양 — 주소에 그대로 들어가는 값이라 좁게 잡는다. */
function isToolIdLike(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(value);
}

/**
 * 공개 범위 (TASK-KL-152 C4).
 *
 * 지금까지 프로필은 **전부 공개**였고 숨길 방법이 하나도 없었다. 사람이 늘어난 뒤에
 * 잠그는 것은 이미 늦다 — 0건인 지금이 잠글 때다.
 *
 * 기본값은 지금까지와 같은 「전부 공개」다. 잠금을 기본으로 바꾸면 이미 프로필을 걸어 둔
 * 사람의 링크가 하루아침에 죽는다.
 */
export interface AccountVisibility {
  /** 프로필 자체를 남이 볼 수 있나. false 면 주소를 알아도 안 보인다. */
  profile: boolean;
  achievements: boolean;
  badges: boolean;
  streaks: boolean;
  /** 커뮤니티에 남긴 글·답글 */
  community: boolean;
  /** 발자국(잔디·연속·써 본 도구) */
  activity: boolean;
}

export const DEFAULT_VISIBILITY: AccountVisibility = {
  profile: true,
  achievements: true,
  badges: true,
  streaks: true,
  community: true,
  activity: true,
};

interface Session {
  accountId: string;
  createdAt: number;
  expiresAt: number;
  /** 어떤 기기·브라우저인가 (TASK-KL-152 C6). 「2곳」이라는 숫자만으로는 끊을 결심을 못 한다. */
  device?: string;
  /** 이 로그인이 마지막으로 쓰인 시각 — 몇 달 잠든 로그인을 알아볼 수 있어야 한다. */
  lastSeenAt?: number;
}

/**
 * 보안 기록 (TASK-KL-152 C7).
 *
 * 「내 계정에 무슨 일이 있었나」를 계정 자신이 말할 수 있어야 한다. 로그인·로그아웃·복구코드
 * 사용은 지금까지 **아무 데도 안 남았다** — 남이 내 계정에 들어와도 알 방법이 없었다.
 *
 * 남기는 것은 **일어난 일과 기기 이름**뿐이다. 주소(IP)는 안 적는다 — 있으면 언젠가 새고,
 * 없어도 「내가 한 것인지」는 시각과 기기로 충분히 가려진다.
 */
export interface AccountEvent {
  at: string;
  kind: 'login' | 'logout' | 'recovery-used' | 'link-used' | 'name-changed' | 'visibility-changed' | 'sessions-revoked';
  device?: string;
  detail?: string;
}

/** 남기는 줄 수 상한. 오래된 것부터 버린다 — 계정 파일이 끝없이 커지지 않게. */
export const EVENT_KEEP = 50;

/**
 * 브라우저가 밝힌 긴 문자열에서 **사람이 알아볼 이름**만 남긴다.
 * 원문을 그대로 두면 화면에 못 쓰고, 그 자체가 사람을 지목하는 표식이 된다.
 */
export function deviceLabel(userAgent: unknown): string {
  const ua = String(userAgent ?? '');
  if (!ua) return '알 수 없는 기기';
  const os =
    /Windows/i.test(ua) ? 'Windows'
    : /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Linux/i.test(ua) ? 'Linux'
    : '알 수 없는 기기';
  const browser =
    /Edg\//i.test(ua) ? 'Edge'
    : /OPR\//i.test(ua) ? 'Opera'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Safari\//i.test(ua) ? 'Safari'
    : '';
  return browser ? `${os} · ${browser}` : os;
}

interface AccountsState {
  version: 1;
  accounts: Record<string, Account>;
  /** `discord:<id>` → accountId. 로그인마다 전수 훑지 않으려고 둔다. */
  identityIndex: Record<string, string>;
  /** handle(소문자) → accountId. 중복 handle 방지 + 공개 프로필 조회. */
  handleIndex: Record<string, string>;
  sessions: Record<string, Session>;
}

const STATE_FILE = 'karmolab-accounts-state.json';

/** 로그인 유지 기간. 도구 사이트는 어쩌다 한 번 오는 곳이라 짧으면 매번 다시 로그인이 된다. */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** 보이는 이름 상한. 길면 목록이 깨지고, 긴 이름은 대개 장난이다. */
export const DISPLAY_NAME_MAX = 24;

/** 한 번에 만들어 주는 복구 코드 수. 적으면 금세 떨어지고, 많으면 아무도 안 챙긴다. */
export const RECOVERY_CODE_COUNT = 8;

/** 다른 기기 로그인 코드가 살아 있는 시간. 짧아야 한다 — 화면에 떠 있는 동안만 쓰는 것이다. */
export const LINK_CODE_TTL_MS = 5 * 60 * 1000;

/** 사람이 옮겨 적을 코드 — 헷갈리는 글자(0/O, 1/I/l)는 뺀다. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomCode(length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** 코드를 되돌릴 수 없게 섞는다. 사람이 적는 것이라 대소문자·붙임표는 무시한다. */
function hashCode(raw: string): string {
  const normalized = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(`karmolab-code:${normalized}`).digest('hex');
}

export function emptyRecords(): AccountRecords {
  return { achievements: [], badges: [], progress: {}, streaks: {} };
}

/**
 * 디스코드 사용자명 → 주소에 쓸 수 있는 handle.
 * 한글·공백·특수문자는 주소에서 깨지므로 떨어내고, 남는 게 없으면 임의 이름을 준다.
 */
export function slugifyHandle(raw: string): string {
  const base = String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
  return base.length >= 2 ? base : '';
}

/**
 * 두 벌의 기록을 합친다 — **어느 쪽도 잃지 않는 방향으로만**.
 *
 * 왜 덮어쓰기가 아닌가: 로그인은 보통 이미 한참 쓴 뒤에 한다. 덮어쓰면 「로그인했더니
 * 내 기록이 사라졌다」가 된다. 그래서 도전과제·뱃지는 합집합, 누적값은 큰 쪽,
 * 연속기록은 최장·최신을 남긴다. 이 함수는 순서를 바꿔 불러도 결과가 같다.
 */
export function mergeRecords(a: AccountRecords, b: AccountRecords): AccountRecords {
  const merged = emptyRecords();

  merged.achievements = [...new Set([...(a.achievements ?? []), ...(b.achievements ?? [])])].sort();
  merged.badges = [...new Set([...(a.badges ?? []), ...(b.badges ?? [])])].sort();

  for (const source of [a.progress ?? {}, b.progress ?? {}]) {
    for (const [key, value] of Object.entries(source)) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      merged.progress[key] = Math.max(merged.progress[key] ?? 0, n);
    }
  }

  for (const source of [a.streaks ?? {}, b.streaks ?? {}]) {
    for (const [key, value] of Object.entries(source)) {
      if (!value || typeof value !== 'object') continue;
      const prev = merged.streaks[key];
      const current = Math.max(prev?.current ?? 0, Number(value.current) || 0);
      const longest = Math.max(prev?.longest ?? 0, Number(value.longest) || 0, current);
      // 날짜는 문자열 비교로 최신을 고른다 — YYYY-MM-DD 는 사전순 = 시간순.
      const dates = [prev?.lastActivityDate ?? null, value.lastActivityDate ?? null].filter(
        (d): d is string => typeof d === 'string' && d.length > 0,
      );
      merged.streaks[key] = {
        current,
        longest,
        lastActivityDate: dates.length ? dates.sort()[dates.length - 1] : null,
      };
    }
  }

  return merged;
}

/**
 * 공개 프로필에 내보낼 모양 — 안쪽 id·세션·디스코드 id 는 절대 안 나간다.
 *
 * `avatarPath` 가 디스코드 주소가 아닌 이유: 디스코드 아바타 주소에는 **그 사람의 디스코드 id 가
 * 그대로 박혀 있다** (`cdn.discordapp.com/avatars/<id>/…`). 프로필에 그 주소를 실으면 사이트를
 * 쓴 것만으로 디스코드 계정이 공개된다 — 본인이 그러겠다고 한 적이 없다. 그래서 우리 주소로
 * 한 겹 감싸고, 그림 자체는 서버가 대신 받아 보낸다.
 */
export interface PublicProfile {
  handle: string;
  displayName: string;
  /** 우리 서버의 그림 주소 (`/kl/u/<handle>/avatar`). 그림이 없으면 null. */
  avatarPath: string | null;
  joinedAt: string;
  achievements: string[];
  badges: string[];
  streaks: Record<string, { current: number; longest: number }>;
  updatedAt: string | null;
  /** 프로필 꾸미기 (TASK-KL-152 C5). 안 채웠으면 빈 값 — 그때는 지금까지와 같은 모습이다. */
  card?: ProfileCard;
  /** 본인이 **일부러 가린** 칸들 (TASK-KL-152 C4). 「없는 것」과 「가린 것」은 다르다. */
  hidden?: string[];
}

export class KarmolabAccountStore {
  private state: AccountsState;

  /** 다른 기기 로그인 코드 — 메모리에만. 몇 분짜리라 다시 뜨면 사라지는 게 맞다. */
  private readonly linkCodes = new Map<string, { accountId: string; expiresAt: number }>();

  constructor(private readonly statePath = path.join(PKG_ROOT, 'data', STATE_FILE)) {
    this.state = this.load();
    this.pruneSessions();
  }

  private load(): AccountsState {
    try {
      if (fs.existsSync(this.statePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.statePath, 'utf-8')) as Partial<AccountsState>;
        return {
          version: 1,
          accounts: parsed.accounts ?? {},
          identityIndex: parsed.identityIndex ?? {},
          handleIndex: parsed.handleIndex ?? {},
          sessions: parsed.sessions ?? {},
        };
      }
    } catch (error) {
      // 파일이 깨졌다고 로그인 자체를 못 하게 만들면 사이트가 통째로 멈춘다.
      // 빈 상태로 계속 가되, 덮어쓰기 전에 사람이 볼 수 있게 크게 남긴다.
      console.error('[karmolab-accounts] 상태 파일을 못 읽었다 — 빈 상태로 시작한다:', error);
    }
    return { version: 1, accounts: {}, identityIndex: {}, handleIndex: {}, sessions: {} };
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
      // 같은 자리에 바로 쓰다가 프로세스가 죽으면 반쯤 쓰인 파일이 남아 다음 기동에서
      // 계정 전체가 사라진다. 옆에 다 쓰고 갈아끼운다.
      const tmp = `${this.statePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2) + '\n', 'utf-8');
      fs.renameSync(tmp, this.statePath);
    } catch (error) {
      console.error('[karmolab-accounts] 상태 저장 실패:', error);
    }
  }

  private pruneSessions(): void {
    const now = Date.now();
    let removed = 0;
    for (const [token, session] of Object.entries(this.state.sessions)) {
      if (session.expiresAt <= now) {
        delete this.state.sessions[token];
        removed += 1;
      }
    }
    if (removed > 0) this.save();
  }

  /** 이미 쓰이는 handle 이면 뒤에 숫자를 붙여 비는 것을 찾는다. */
  private uniqueHandle(desired: string): string {
    const base = slugifyHandle(desired) || `karmo-${crypto.randomBytes(3).toString('hex')}`;
    if (!this.state.handleIndex[base]) return base;
    for (let n = 2; n < 1000; n += 1) {
      const candidate = `${base}-${n}`;
      if (!this.state.handleIndex[candidate]) return candidate;
    }
    return `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }

  /**
   * 디스코드로 들어온 사람을 계정에 잇는다 — 처음이면 만들고, 있으면 표시 이름·사진만 새로 맞춘다.
   * 계정 정본은 우리 쪽이므로 handle 은 **처음 한 번만** 정해지고 이후 디스코드가 바뀌어도 안 흔들린다.
   */
  upsertFromDiscord(input: {
    discordId: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  }): Account {
    const key = `discord:${input.discordId}`;
    const existingId = this.state.identityIndex[key];
    const now = new Date().toISOString();

    if (existingId && this.state.accounts[existingId]) {
      const account = this.state.accounts[existingId];
      account.displayName = input.displayName || account.displayName;
      account.avatarUrl = input.avatarUrl;
      account.identities.discord = {
        discordId: input.discordId,
        username: input.username,
        linkedAt: account.identities.discord?.linkedAt ?? now,
      };
      this.save();
      return account;
    }

    const id = crypto.randomUUID();
    const handle = this.uniqueHandle(input.username || input.displayName);
    const account: Account = {
      id,
      handle,
      displayName: input.displayName || input.username || handle,
      avatarUrl: input.avatarUrl,
      createdAt: now,
      identities: { discord: { discordId: input.discordId, username: input.username, linkedAt: now } },
      records: emptyRecords(),
      recordsUpdatedAt: null,
    };
    this.state.accounts[id] = account;
    this.state.identityIndex[key] = id;
    this.state.handleIndex[handle] = id;
    this.save();
    return account;
  }

  createSession(accountId: string, device?: string): { token: string; expiresAt: number } {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.state.sessions[token] = { accountId, createdAt: now, expiresAt, device, lastSeenAt: now };
    this.save();
    return { token, expiresAt };
  }

  /**
   * 이 로그인이 방금 쓰였다 (TASK-KL-152 C6).
   * 저장은 **하루 한 번**만 한다 — 요청마다 파일을 쓰면 도구 한 번 열 때마다 디스크가 돈다.
   */
  touchSession(token: string | undefined | null, now: number = Date.now()): void {
    if (!token) return;
    const session = this.state.sessions[token];
    if (!session) return;
    if (session.lastSeenAt && now - session.lastSeenAt < 24 * 60 * 60 * 1000) return;
    session.lastSeenAt = now;
    this.save();
  }

  /** 무슨 일이 있었는지 한 줄 남긴다 (TASK-KL-152 C7). 주소(IP)는 안 적는다 — 있으면 언젠가 샌다. */
  noteEvent(accountId: string, kind: AccountEvent['kind'], input: { device?: string; detail?: string } = {}): void {
    const account = this.state.accounts[accountId];
    if (!account) return;
    const events = account.events ?? [];
    events.unshift({ at: new Date().toISOString(), kind, device: input.device, detail: input.detail });
    account.events = events.slice(0, EVENT_KEEP);
    this.save();
  }

  /** 내 보안 기록 — 최근 것부터. */
  eventsFor(accountId: string): AccountEvent[] {
    return [...(this.state.accounts[accountId]?.events ?? [])];
  }

  /** 이 로그인 하나만 끊는다 (TASK-KL-152 C6). 「이 기기만 빼고 전부」로는 못 하는 일이 있다. */
  revokeSession(accountId: string, sessionId: string): boolean {
    for (const [token, session] of Object.entries(this.state.sessions)) {
      if (session.accountId !== accountId) continue;
      if (this.sessionId(token) !== sessionId) continue;
      delete this.state.sessions[token];
      this.save();
      return true;
    }
    return false;
  }

  /**
   * 화면에 내보낼 로그인 이름표.
   * **토큰 자체는 절대 안 내보낸다** — 그걸 아는 사람은 그 계정으로 로그인할 수 있다.
   */
  private sessionId(token: string): string {
    return crypto.createHash('sha256').update(`karmolab-session:${token}`).digest('hex').slice(0, 16);
  }

  accountForSession(token: string | undefined | null): Account | null {
    if (!token) return null;
    const session = this.state.sessions[token];
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      delete this.state.sessions[token];
      this.save();
      return null;
    }
    return this.state.accounts[session.accountId] ?? null;
  }

  destroySession(token: string | undefined | null): void {
    if (!token || !this.state.sessions[token]) return;
    delete this.state.sessions[token];
    this.save();
  }

  /**
   * 보이는 이름 바꾸기.
   *
   * 지금까지 이름은 디스코드에서 온 것으로 **고정**이었다. 그런데 계정의 정본은 우리 쪽이고
   * 디스코드는 들어오는 문 하나일 뿐이다 — 문에 적힌 이름을 평생 달고 다닐 이유가 없다.
   * 주소(handle)는 안 바꾼다: 남이 링크로 걸어 둔 자리가 깨진다.
   */
  setDisplayName(accountId: string, raw: unknown): Account | null {
    const account = this.state.accounts[accountId];
    if (!account) return null;
    const name = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX);
    if (!name) return null;
    account.displayName = name;
    this.save();
    return account;
  }

  /**
   * 발자국 한 줄 남기기 (TASK-KL-152 C1).
   *
   * 도구를 열면 `toolId` 와 함께, 그냥 다녀가기만 하면 `toolId` 없이 부른다.
   * 다녀간 날도 잔디에 칠해져야 한다 — 도구를 안 연 날을 「안 온 날」로 적으면 거짓말이 된다.
   */
  noteFootprint(accountId: string, input: { toolId?: string | null; at?: Date } = {}): void {
    const account = this.state.accounts[accountId];
    if (!account) return;
    const at = input.at ?? new Date();
    const key = kstDayKey(at);
    const footprint: AccountFootprint = account.footprint ?? {
      days: {},
      tools: {},
      firstSeenAt: null,
      lastSeenAt: null,
    };

    // 날 칸은 **다녀간 것만으로도 생긴다**(0). 도구를 열면 그 위에 센다.
    if (footprint.days[key] === undefined) footprint.days[key] = 0;
    const toolId = typeof input.toolId === 'string' ? input.toolId : null;
    if (toolId) {
      footprint.days[key] += 1;
      footprint.tools[toolId] = (footprint.tools[toolId] ?? 0) + 1;
    }

    const iso = at.toISOString();
    footprint.firstSeenAt = footprint.firstSeenAt ?? iso;
    footprint.lastSeenAt = iso;

    // 오래된 날은 버린다. 자르는 기준도 KST 날짜 칸이라 시간대에 두 번 안 걸린다.
    const keys = Object.keys(footprint.days).sort();
    if (keys.length > FOOTPRINT_KEEP_DAYS) {
      for (const old of keys.slice(0, keys.length - FOOTPRINT_KEEP_DAYS)) delete footprint.days[old];
    }

    account.footprint = footprint;
    this.save();
  }

  /**
   * 내 발자국 — 잔디·돌아보기가 읽는 자리.
   *
   * 연속일은 **오늘 또는 어제**에서 이어져야 살아 있는 것으로 본다. 오늘 아직 안 왔다고
   * 어제까지의 연속을 0 으로 지우면, 아침에 열어 본 사람은 늘 「끊겼다」를 본다.
   */
  footprintFor(accountId: string, now: Date = new Date()): {
    days: Record<string, number>;
    tools: Record<string, number>;
    totals: { opens: number; activeDays: number; distinctTools: number };
    streak: { current: number; longest: number };
    firstSeenAt: string | null;
    lastSeenAt: string | null;
  } {
    const account = this.state.accounts[accountId];
    const footprint = account?.footprint;
    const days = { ...(footprint?.days ?? {}) };
    const tools = { ...(footprint?.tools ?? {}) };
    const opens = Object.values(tools).reduce((sum, n) => sum + (Number(n) || 0), 0);

    const present = new Set(Object.keys(days));
    const today = kstDayKey(now);
    const yesterday = prevDayKey(today);

    let current = 0;
    let cursor = present.has(today) ? today : present.has(yesterday) ? yesterday : null;
    while (cursor && present.has(cursor)) {
      current += 1;
      cursor = prevDayKey(cursor);
    }

    let longest = 0;
    let run = 0;
    for (const key of [...present].sort()) {
      run = present.has(prevDayKey(key)) ? run + 1 : 1;
      if (run > longest) longest = run;
    }

    return {
      days,
      tools,
      totals: { opens, activeDays: present.size, distinctTools: Object.keys(tools).length },
      streak: { current, longest },
      firstSeenAt: footprint?.firstSeenAt ?? account?.createdAt ?? null,
      lastSeenAt: footprint?.lastSeenAt ?? null,
    };
  }

  /** 지금 살아 있는 내 로그인들 — 「어디서 로그인돼 있나」를 볼 수 있어야 끊을 수도 있다. */
  sessionsFor(
    accountId: string,
    currentToken: string | null = null,
  ): { id: string; createdAt: string; lastSeenAt: string | null; device: string; current: boolean }[] {
    const now = Date.now();
    return Object.entries(this.state.sessions)
      .filter(([, session]) => session.accountId === accountId && session.expiresAt > now)
      .map(([token, session]) => ({
        id: this.sessionId(token),
        createdAt: new Date(session.createdAt).toISOString(),
        lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt).toISOString() : null,
        device: session.device || '알 수 없는 기기',
        current: token === currentToken,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * 지금 쓰는 것만 남기고 나머지 로그인을 전부 끊는다.
   * (기기를 잃어버렸거나 남의 컴퓨터에서 로그인한 채 나왔을 때 쓸 유일한 수단이다.)
   * @returns 끊은 개수.
   */
  revokeOtherSessions(accountId: string, keepToken: string | null): number {
    let removed = 0;
    for (const [token, session] of Object.entries(this.state.sessions)) {
      if (session.accountId !== accountId || token === keepToken) continue;
      delete this.state.sessions[token];
      removed += 1;
    }
    if (removed > 0) this.save();
    return removed;
  }

  /**
   * 계정을 지운다. **되돌릴 수 없다.**
   *
   * 계정·기록·로그인은 전부 사라진다. 이미 남긴 글은 이 함수가 안 건드린다 — 답글이 달린
   * 글을 통째로 지우면 그 답글들이 뜻을 잃는다. 글 쪽 처리는 부르는 쪽이 따로 한다
   * (거기서 글쓴이를 「지운 계정」으로 바꾼다).
   */
  deleteAccount(accountId: string): Account | null {
    const account = this.state.accounts[accountId];
    if (!account) return null;
    delete this.state.accounts[accountId];
    delete this.state.handleIndex[account.handle.toLowerCase()];
    for (const [key, id] of Object.entries(this.state.identityIndex)) {
      if (id === accountId) delete this.state.identityIndex[key];
    }
    for (const [token, session] of Object.entries(this.state.sessions)) {
      if (session.accountId === accountId) delete this.state.sessions[token];
    }
    this.save();
    return account;
  }

  /**
   * 복구 코드를 새로 만든다 (있던 것은 전부 버린다).
   * @returns 사람에게 보여 줄 원문. **이때 한 번만** 볼 수 있다 — 서버에는 안 남는다.
   */
  issueRecoveryCodes(accountId: string): string[] | null {
    const account = this.state.accounts[accountId];
    if (!account) return null;
    const plain: string[] = [];
    const stored: { hash: string; usedAt: string | null }[] = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
      // 네 자씩 끊어 적어야 사람이 안 틀린다.
      const code = `${randomCode(4)}-${randomCode(4)}`;
      plain.push(code);
      stored.push({ hash: hashCode(code), usedAt: null });
    }
    account.recoveryCodes = stored;
    this.save();
    return plain;
  }

  /** 아직 안 쓴 복구 코드가 몇 장 남았나. */
  recoveryCodesLeft(accountId: string): number {
    const account = this.state.accounts[accountId];
    return (account?.recoveryCodes ?? []).filter((c) => c.usedAt === null).length;
  }

  /**
   * 복구 코드로 들어온다. **한 장은 한 번만** 쓴다 — 다시 쓸 수 있으면 적어 둔 종이가
   * 영구 열쇠가 되고, 그건 비밀번호를 종이에 적어 두는 것과 같다.
   */
  consumeRecoveryCode(raw: unknown): Account | null {
    const hash = hashCode(String(raw ?? ''));
    if (!hash) return null;
    for (const account of Object.values(this.state.accounts)) {
      const entry = (account.recoveryCodes ?? []).find((c) => c.hash === hash && c.usedAt === null);
      if (!entry) continue;
      entry.usedAt = new Date().toISOString();
      this.save();
      return account;
    }
    return null;
  }

  /**
   * 다른 기기에서 로그인할 짧은 코드를 낸다 (지금 로그인한 기기에서 만든다).
   *
   * **저장하지 않는다** — 몇 분만 사는 것이고, 봇이 다시 뜨면 사라지는 게 맞다.
   * 디스코드 로그인이 안 되는 기기(티비·남의 컴퓨터)에서 들어오는 길이다.
   */
  issueLinkCode(accountId: string, now: Date = new Date()): { code: string; expiresAt: string } | null {
    if (!this.state.accounts[accountId]) return null;
    for (const [code, entry] of this.linkCodes) {
      if (entry.expiresAt <= now.getTime()) this.linkCodes.delete(code);
    }
    const code = `${randomCode(3)}-${randomCode(3)}`;
    const expiresAt = now.getTime() + LINK_CODE_TTL_MS;
    this.linkCodes.set(hashCode(code), { accountId, expiresAt });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  /** 그 코드로 들어온다. 한 번 쓰면 사라진다. */
  consumeLinkCode(raw: unknown, now: Date = new Date()): Account | null {
    const key = hashCode(String(raw ?? ''));
    const entry = this.linkCodes.get(key);
    if (!entry) return null;
    this.linkCodes.delete(key);
    if (entry.expiresAt <= now.getTime()) return null;
    return this.state.accounts[entry.accountId] ?? null;
  }

  /** 브라우저가 보낸 기록을 서버 기록과 합쳐 저장한다.  /** 브라우저가 보낸 기록을 서버 기록과 합쳐 저장한다. 반환값 = 합쳐진 결과(브라우저가 이걸로 맞춘다). */
  mergeRecordsForAccount(accountId: string, incoming: AccountRecords): AccountRecords {
    const account = this.state.accounts[accountId];
    if (!account) throw new Error(`없는 계정: ${accountId}`);
    account.records = mergeRecords(account.records ?? emptyRecords(), incoming ?? emptyRecords());
    account.recordsUpdatedAt = new Date().toISOString();
    this.save();
    return account.records;
  }

  /** 디스코드 id 로 계정 찾기 — 주인에게 알림 보낼 때 쓴다. */
  accountForDiscordId(discordId: string): Account | null {
    const id = this.state.identityIndex[`discord:${discordId}`];
    return id ? (this.state.accounts[id] ?? null) : null;
  }

  byHandle(handle: string): Account | null {
    const id = this.state.handleIndex[String(handle ?? '').toLowerCase()];
    return id ? (this.state.accounts[id] ?? null) : null;
  }

  /** 프로필 꾸미기 읽기 (안 채웠으면 빈 것). */
  cardFor(accountId: string): ProfileCard {
    const account = this.state.accounts[accountId];
    return { bio: account?.card?.bio ?? '', pins: account?.card?.pins ?? [] };
  }

  /**
   * 프로필 꾸미기 바꾸기 — 보낸 칸만.
   * 도구 id 는 모양을 확인하고 최대 3개까지만 받는다(같은 것 두 번은 하나로).
   */
  setCard(accountId: string, patch: unknown): ProfileCard | null {
    const account = this.state.accounts[accountId];
    if (!account) return null;
    const source = (patch ?? {}) as Record<string, unknown>;
    const card: ProfileCard = { ...this.cardFor(accountId) };
    if (typeof source.bio === 'string') {
      card.bio = source.bio.replace(/\s+/g, ' ').trim().slice(0, BIO_MAX);
    }
    if (Array.isArray(source.pins)) {
      card.pins = [...new Set(source.pins.filter(isToolIdLike))].slice(0, PIN_MAX);
    }
    account.card = card;
    this.save();
    return card;
  }

  /** 지금 이 계정의 공개 범위 (안 정했으면 전부 공개). */
  visibilityFor(accountId: string): AccountVisibility {
    const account = this.state.accounts[accountId];
    return { ...DEFAULT_VISIBILITY, ...(account?.visibility ?? {}) };
  }

  /** 공개 범위 바꾸기 — 보낸 칸만 바꾼다(모르는 칸은 무시). */
  setVisibility(accountId: string, patch: unknown): AccountVisibility | null {
    const account = this.state.accounts[accountId];
    if (!account) return null;
    const next: Partial<AccountVisibility> = { ...(account.visibility ?? {}) };
    const source = (patch ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(DEFAULT_VISIBILITY) as (keyof AccountVisibility)[]) {
      if (typeof source[key] === 'boolean') next[key] = source[key] as boolean;
    }
    account.visibility = next;
    this.save();
    return this.visibilityFor(accountId);
  }

  /**
   * 남에게 보이는 모습.
   *
   * **꺼 둔 항목은 응답에서 아예 사라진다** — 화면에서만 숨기면 주소를 직접 열어 본 사람에게는
   * 그대로 나간다. 숨긴다는 말은 「안 보낸다」여야 한다.
   */
  publicProfile(account: Account): PublicProfile {
    const visible = this.visibilityFor(account.id);
    const streaks: PublicProfile['streaks'] = {};
    if (visible.streaks) {
      for (const [key, value] of Object.entries(account.records?.streaks ?? {})) {
        streaks[key] = { current: value.current, longest: value.longest };
      }
    }
    return {
      handle: account.handle,
      displayName: account.displayName,
      avatarPath: account.avatarUrl ? `/kl/u/${encodeURIComponent(account.handle)}/avatar` : null,
      joinedAt: account.createdAt,
      achievements: visible.achievements ? account.records?.achievements ?? [] : [],
      badges: visible.badges ? account.records?.badges ?? [] : [],
      streaks,
      updatedAt: account.recordsUpdatedAt,
      card: this.cardFor(account.id),
      hidden: (Object.keys(DEFAULT_VISIBILITY) as (keyof AccountVisibility)[]).filter(
        (key) => key !== 'profile' && !visible[key],
      ),
    };
  }

  /** 관측용 — 지어낸 수가 아니라 실제 계정 수. */
  stats(): { accounts: number; sessions: number } {
    return {
      accounts: Object.keys(this.state.accounts).length,
      sessions: Object.keys(this.state.sessions).length,
    };
  }
}

let singleton: KarmolabAccountStore | null = null;

export function getKarmolabAccountStore(): KarmolabAccountStore {
  if (!singleton) singleton = new KarmolabAccountStore();
  return singleton;
}
