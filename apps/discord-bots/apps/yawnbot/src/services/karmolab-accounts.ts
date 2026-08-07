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
}

interface Session {
  accountId: string;
  createdAt: number;
  expiresAt: number;
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
}

export class KarmolabAccountStore {
  private state: AccountsState;

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

  createSession(accountId: string): { token: string; expiresAt: number } {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    this.state.sessions[token] = { accountId, createdAt: now, expiresAt };
    this.save();
    return { token, expiresAt };
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

  /** 브라우저가 보낸 기록을 서버 기록과 합쳐 저장한다. 반환값 = 합쳐진 결과(브라우저가 이걸로 맞춘다). */
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

  publicProfile(account: Account): PublicProfile {
    const streaks: PublicProfile['streaks'] = {};
    for (const [key, value] of Object.entries(account.records?.streaks ?? {})) {
      streaks[key] = { current: value.current, longest: value.longest };
    }
    return {
      handle: account.handle,
      displayName: account.displayName,
      avatarPath: account.avatarUrl ? `/kl/u/${encodeURIComponent(account.handle)}/avatar` : null,
      joinedAt: account.createdAt,
      achievements: account.records?.achievements ?? [],
      badges: account.records?.badges ?? [],
      streaks,
      updatedAt: account.recordsUpdatedAt,
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
