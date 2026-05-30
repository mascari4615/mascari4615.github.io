/**
 * 채널 자동 프로비저닝 — 선언적 desired-state + 부팅 reconcile.
 *
 * 문제: 채널 ID 가 config/*.txt · GitHub secret 에 하드코딩 → 새 서버·채널 교체마다
 *       사람이 우클릭→ID복사→편집→재배포. (사용자: "봇이 직접 카테고리·채널을 만들 수 없나")
 *
 * 근본: ID 를 *유지* 하지 말고 *선언에서 파생*. 정본 = `data/channel-spec.json`
 *       (원하는 구조만, 커밋). ID = 길드별 런타임 캐시
 *       `data/provisioned-channels.<guildId>.json` (gitignore).
 *
 * reconcile (멱등): 저장된 ID 가 살아있으면 그대로 → 없으면 *이름으로 기존 채널 claim*
 *                   → 그것도 없으면 생성. 사용자가 채널 이름 바꿔도 저장 ID 로 추적.
 *
 * 범위 게이트 (사용자 결정 2026-05-17 "dev 서버만 먼저"): YAWNBOT_ENV==='prod' 면 OFF.
 *   prod 는 env *_CHANNEL_ID 가 그대로 우선 → 본 모듈은 prod 동작 무영향.
 *
 * 정합: process.md § Ops 인터페이스 사람·AI 공용 / active-sessions 보드 = live 파생 투영
 *       (유지하지 말고 파생하라) / code-style.md § Deep Modules (좁은 seam).
 */
import fs from 'fs';
import path from 'path';
import { ChannelType } from 'discord.js';

/**
 * 패키지 루트 = `package.json` 을 가진 첫 상위 디렉터리.
 * paths.ts 의 PKG_ROOT 는 *컴파일된 dist 2-depth* 를 가정 → vitest(소스 1-depth)
 * 에서 어긋남. 상향 탐색은 src/dist 양쪽에서 동일하게 yawnbot 루트를 잡는다.
 */
function pkgRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..');
}
const PKG_ROOT = pkgRoot();

/** spec 의 forum 태그 (JSON 친화 — emoji = unicode 단일 문자). */
export interface ForumTag {
  name: string;
  emoji?: string;
  moderated?: boolean;
}

/** type=GuildForum 일 때만 적용되는 추가 설정. */
export interface ForumConfig {
  /** Discord native 값: 60 / 1440 / 4320 / 10080 (분). */
  defaultAutoArchiveDuration?: number;
  availableTags?: ForumTag[];
}

export interface ChannelSpecEntry {
  /** 논리 키 (코드·env 매핑 안정 식별자, 절대 안 바뀜). */
  key: string;
  /** 디스코드에 만들 채널 이름 (사용자가 바꿔도 저장 ID 로 추적). */
  name: string;
  /** 채널 종류. 미지정 = GuildText (하위호환). */
  type?: 'GuildText' | 'GuildForum';
  topic?: string;
  /** type === 'GuildForum' 일 때만 의미. */
  forum?: ForumConfig;
}

export interface ChannelSpec {
  categoryName: string;
  channels: ChannelSpecEntry[];
}

/** discord.js v14 GuildForumTagData 형식 (실 API 호출 시 패스). */
export interface DiscordForumTagInput {
  /** 기존 태그 업데이트 시 Discord 가 ID 를 보존하도록 포함. 신규 생성 시 생략. */
  id?: string;
  name: string;
  emoji?: { id?: string | null; name?: string | null };
  moderated?: boolean;
}

function specTagsToDiscord(tags: ForumTag[]): DiscordForumTagInput[] {
  return tags.map((t) => ({
    name: t.name,
    ...(t.emoji ? { emoji: { name: t.emoji } } : {}),
    ...(t.moderated !== undefined ? { moderated: t.moderated } : {}),
  }));
}

/** entry 의 channel 종류 → discord.js ChannelType. 미지정 = GuildText (하위호환). */
function entryChannelType(entry: ChannelSpecEntry): number {
  return entry.type === 'GuildForum' ? ChannelType.GuildForum : ChannelType.GuildText;
}

/** 논리 키 → 기존 env 키. prod 우선·dev 폴백 매핑의 단일 정본 (평행정의 0). */
export const ENV_KEY_BY_LOGICAL: Record<string, string> = {
  'github-webhook': 'GITHUB_WEBHOOK_CHANNEL_ID',
  'ops-report': 'YAWNBOT_OPS_REPORT_CHANNEL_ID',
  'unity-free': 'YAWNBOT_UNITY_FREE_CHANNEL_ID',
  news: 'YAWNBOT_NEWS_CHANNEL_ID',
  'agent-team': 'YAWNBOT_AGENT_CHANNEL_ID',
  digest: 'YAWN_DIGEST_CHANNEL_ID',
};

const SPEC_PATH = path.join(PKG_ROOT, 'data', 'channel-spec.json');
const CATEGORY_MAP_KEY = '__category';

let specCache: ChannelSpec | null = null;

export function getChannelSpec(): ChannelSpec {
  if (specCache) return specCache;
  try {
    const raw = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf-8')) as Partial<ChannelSpec>;
    const channels = Array.isArray(raw.channels)
      ? raw.channels.filter(
          (c): c is ChannelSpecEntry =>
            !!c && typeof c.key === 'string' && typeof c.name === 'string',
        )
      : [];
    specCache = { categoryName: String(raw.categoryName ?? '욘봇'), channels };
  } catch (e: unknown) {
    console.warn(
      `[ChannelProvision] ${SPEC_PATH} 로드 실패 — 프로비저닝 비활성:`,
      e instanceof Error ? e.message : String(e),
    );
    specCache = { categoryName: '욘봇', channels: [] };
  }
  return specCache;
}

/**
 * dev 한정 게이트. YAWNBOT_ENV==='prod' 또는 YAWNBOT_CHANNEL_PROVISION 명시 off 면 false.
 * 명시 on(YAWNBOT_CHANNEL_PROVISION=1) 이면 prod 여도 강제 활성 (수동 마이그레이션용).
 */
export function isProvisioningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // 기본 ON (dev·prod 무관) — 사용자 「기존 채팅방 안 쓰고 싶다」(2026-05-17,
  // "dev 먼저" 철회). 옛 하드코딩 채널을 prod 포함 전부 폐기. 안전성은
  // shouldProvisionGuild(허용 길드 한정)이 담보 — 봇이 초대된 아무 서버에나
  // 채널을 만들지 않음. YAWNBOT_CHANNEL_PROVISION=0/off 로 비상 비활성.
  const flag = env.YAWNBOT_CHANNEL_PROVISION?.trim().toLowerCase();
  if (flag === '0' || flag === 'off' || flag === 'false') return false;
  return true;
}

/**
 * 프로비저닝 *대상 길드* 화이트리스트. 봇이 초대된 모든 길드(친구 서버 등)에
 * 카테고리·채널을 만드는 사고 방지 = 근본 안전 가드.
 * 우선순위: YAWNBOT_ALLOWED_GUILD_IDS → DISCORD_GUILD_ID → (없으면 빈=아무데도 X).
 */
export function allowedGuildIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const pick = (raw: string | undefined): string[] =>
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const allowed = pick(env.YAWNBOT_ALLOWED_GUILD_IDS);
  if (allowed.length) return allowed;
  return pick(env.DISCORD_GUILD_ID);
}

/** 이 길드에 프로비저닝해도 되는가 (화이트리스트 멤버십). */
export function shouldProvisionGuild(
  guildId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return allowedGuildIds(env).includes(guildId);
}

/**
 * 인스턴스 라벨 = 같은 길드에 prod·dev 봇이 공존할 때의 격리 축.
 * 욘봇(prod)·욘봇Dev(dev)가 같은 서버를 쓰므로 카테고리·맵을 라벨로 분리한다.
 */
export function provisionInstanceLabel(env: NodeJS.ProcessEnv = process.env): string {
  return env.YAWNBOT_ENV?.trim().toLowerCase() || 'dev';
}

/** prod = 기본 카테고리명(사용자 정면), 그 외 = `<base>-<label>` (dev 분리). */
export function effectiveCategoryName(
  spec: ChannelSpec = getChannelSpec(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  const label = provisionInstanceLabel(env);
  return label === 'prod' ? spec.categoryName : `${spec.categoryName}-${label}`;
}

function mapPath(guildId: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(
    PKG_ROOT,
    'data',
    `provisioned-channels.${guildId}.${provisionInstanceLabel(env)}.json`,
  );
}

export function loadProvisionedMap(
  guildId: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(mapPath(guildId, env), 'utf-8'));
    if (raw && typeof raw === 'object') {
      return Object.fromEntries(
        Object.entries(raw).filter(([, v]) => typeof v === 'string'),
      ) as Record<string, string>;
    }
  } catch {
    /* 파일 없음 = 첫 부팅. {} */
  }
  return {};
}

function saveProvisionedMap(
  guildId: string,
  map: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  fs.writeFileSync(mapPath(guildId, env), JSON.stringify(map, null, '\t') + '\n', 'utf-8');
}

// ── reconcile 가 의존하는 *최소* 길드 인터페이스 (discord.js Guild 의 구조적 부분집합).
//    테스트가 페이크를 주입할 수 있도록 좁게 (Deep Modules: 좁은 seam). ──
export interface ChannelLike {
  id: string;
  name: string;
  type: number;
  parentId?: string | null;
  /** type === GuildForum 일 때만 의미. discord.js ForumChannel 구조적 부분집합. */
  availableTags?: DiscordForumTagInput[];
  /** ForumChannel 만 노출. spec 드리프트 동기용. */
  setAvailableTags?: (tags: DiscordForumTagInput[]) => Promise<void>;
}
export interface GuildChannelManagerLike {
  cache: { find(fn: (c: ChannelLike) => boolean): ChannelLike | undefined };
  create(opts: {
    name: string;
    type: number;
    parent?: string | null;
    topic?: string;
    availableTags?: DiscordForumTagInput[];
    defaultAutoArchiveDuration?: number;
  }): Promise<ChannelLike>;
}
export interface GuildLike {
  id: string;
  channels: GuildChannelManagerLike;
}

export interface ReconcileResult {
  guildId: string;
  map: Record<string, string>;
  created: string[];
  claimed: string[];
  reused: string[];
}

/**
 * 기존 forum 채널 (reused/claimed) 의 availableTags 를 spec 정합 동기.
 * 신규 생성은 create 옵션이 직접 박혀 호출 불요. best-effort — setAvailableTags
 * 미지원 채널/페이크는 silent skip (드리프트만 잡으면 됨, 신규 채널엔 안전).
 *
 * ID 보존: 이름 집합이 이미 일치하면 setAvailableTags 자체를 skip (Discord 가
 * 호출마다 새 ID 를 발급해 기존 포스트 appliedTags 를 무효화하는 것 방지).
 * 이름이 다를 때만 동기 — 동명 기존 태그는 ID 재사용해 파괴 최소화.
 */
async function syncForumTagsIfNeeded(
  channel: ChannelLike,
  entry: ChannelSpecEntry,
): Promise<void> {
  if (entry.type !== 'GuildForum') return;
  if (!entry.forum?.availableTags) return;
  if (!channel.setAvailableTags) return;

  const specNames = entry.forum.availableTags.map((t) => t.name);
  const currentTags = channel.availableTags ?? [];
  const currentNameSet = new Set(currentTags.map((t) => t.name));

  // 이름 집합 동일 = 변경 불요 → skip (ID 재발급 방지).
  const namesMatch =
    specNames.length === currentNameSet.size &&
    specNames.every((n) => currentNameSet.has(n));
  if (namesMatch) return;

  // 변경 필요 — 동명 기존 태그 ID 보존해 appliedTags 파괴 최소화.
  const existingIdByName = new Map(
    currentTags.filter((t) => t.id !== undefined).map((t) => [t.name, t.id!]),
  );
  const merged = entry.forum.availableTags.map((t) => {
    const base = specTagsToDiscord([t])[0];
    const existingId = existingIdByName.get(t.name);
    return existingId !== undefined ? { ...base, id: existingId } : base;
  });
  await channel.setAvailableTags(merged);
}

/**
 * 한 길드의 채널 구조를 spec 에 맞춰 reconcile. 멱등 — 두 번 돌려도 생성 0.
 * 우선순위: 저장 ID 생존 → 이름으로 기존 claim → 생성.
 */
export async function reconcileGuildChannels(
  guild: GuildLike,
  spec: ChannelSpec = getChannelSpec(),
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReconcileResult> {
  const map = loadProvisionedMap(guild.id, env);
  const created: string[] = [];
  const claimed: string[] = [];
  const reused: string[] = [];

  // 인스턴스별 카테고리명 — prod·dev 가 같은 길드를 써도 분리.
  const categoryName = effectiveCategoryName(spec, env);

  const byId = (id: string | undefined): ChannelLike | undefined =>
    id ? guild.channels.cache.find((c) => c.id === id) : undefined;

  // 1) 카테고리 (인스턴스 전용 이름으로만 claim — 남의 인스턴스 것 안 뺏음)
  let categoryId = map[CATEGORY_MAP_KEY];
  let category = byId(categoryId);
  if (category && category.type === ChannelType.GuildCategory) {
    reused.push(CATEGORY_MAP_KEY);
  } else {
    category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === categoryName,
    );
    if (category) {
      claimed.push(CATEGORY_MAP_KEY);
    } else {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
      });
      created.push(CATEGORY_MAP_KEY);
    }
    categoryId = category.id;
    map[CATEGORY_MAP_KEY] = categoryId;
  }

  // 2) 채널 — 이름 claim 을 *이 카테고리 하위로* 스코프 (다른 인스턴스의
  //    동일 이름 채널을 가로채지 않음 = prod↔dev 교차오염 차단).
  for (const entry of spec.channels) {
    const wantType = entryChannelType(entry);
    const stored = byId(map[entry.key]);
    if (stored && stored.type === wantType) {
      await syncForumTagsIfNeeded(stored, entry);
      reused.push(entry.key);
      continue;
    }
    const existing = guild.channels.cache.find(
      (c) =>
        c.type === wantType &&
        c.name === entry.name &&
        c.parentId === categoryId,
    );
    if (existing) {
      map[entry.key] = existing.id;
      await syncForumTagsIfNeeded(existing, entry);
      claimed.push(entry.key);
      continue;
    }
    const createOpts: {
      name: string;
      type: number;
      parent?: string | null;
      topic?: string;
      availableTags?: DiscordForumTagInput[];
      defaultAutoArchiveDuration?: number;
    } = {
      name: entry.name,
      type: wantType,
      parent: categoryId,
      topic: entry.topic,
    };
    if (wantType === ChannelType.GuildForum && entry.forum) {
      if (entry.forum.availableTags) {
        createOpts.availableTags = specTagsToDiscord(entry.forum.availableTags);
      }
      if (entry.forum.defaultAutoArchiveDuration) {
        createOpts.defaultAutoArchiveDuration = entry.forum.defaultAutoArchiveDuration;
      }
    }
    const ch = await guild.channels.create(createOpts);
    map[entry.key] = ch.id;
    created.push(entry.key);
  }

  saveProvisionedMap(guild.id, map, env);
  return { guildId: guild.id, map, created, claimed, reused };
}

/** (길드,인스턴스)별 reconcile 결과 메모리 캐시 (resolver 가 파일 안 읽고 즉답). */
const liveMaps = new Map<string, Record<string, string>>();
const liveKey = (guildId: string, env: NodeJS.ProcessEnv): string =>
  `${guildId}:${provisionInstanceLabel(env)}`;

export function rememberMap(
  guildId: string,
  map: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
): void {
  liveMaps.set(liveKey(guildId, env), map);
}

/** dev 기준 길드 = DISCORD_GUILD_ID 의 첫 항목. resolver 의 단일 길드 선택. */
export function primaryGuildId(env: NodeJS.ProcessEnv = process.env): string | null {
  // 허용 길드 우선 → reconcile 가 프로비저닝한 길드와 resolver 가 동일 길드를
  // 가리키게 함 (prod DISCORD_GUILD_ID 는 친구방 포함 다중이라 first 가 어긋날
  // 수 있음 — 허용 길드[0] 가 정답).
  const ids = allowedGuildIds(env);
  return ids[0] ?? null;
}

function provisionedId(key: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const gid = primaryGuildId(env);
  if (!gid) return null;
  const map = liveMaps.get(liveKey(gid, env)) ?? loadProvisionedMap(gid, env);
  return map[key]?.trim() || null;
}

/**
 * 논리 키 → 실제 채널 ID. 소비자(notifier 등)의 단일 진입점.
 *  - 프로비저닝 OFF (=0): env *_CHANNEL_ID 그대로 (비상 폴백, byte-identical).
 *  - 프로비저닝 ON  (기본): 인스턴스(prod/dev)별 프로비저닝 ID 우선 → 없으면 env.
 */
export function channelIdFor(key: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const envKey = ENV_KEY_BY_LOGICAL[key];
  const envVal = envKey ? env[envKey]?.trim() || null : null;
  if (!isProvisioningEnabled(env)) return envVal;
  return provisionedId(key, env) ?? envVal;
}
