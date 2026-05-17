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

export interface ChannelSpecEntry {
  /** 논리 키 (코드·env 매핑 안정 식별자, 절대 안 바뀜). */
  key: string;
  /** 디스코드에 만들 채널 이름 (사용자가 바꿔도 저장 ID 로 추적). */
  name: string;
  topic?: string;
}

export interface ChannelSpec {
  categoryName: string;
  channels: ChannelSpecEntry[];
}

/** 논리 키 → 기존 env 키. prod 우선·dev 폴백 매핑의 단일 정본 (평행정의 0). */
export const ENV_KEY_BY_LOGICAL: Record<string, string> = {
  'github-webhook': 'GITHUB_WEBHOOK_CHANNEL_ID',
  'ops-report': 'YAWNBOT_OPS_REPORT_CHANNEL_ID',
  'unity-free': 'YAWNBOT_UNITY_FREE_CHANNEL_ID',
  geeknews: 'YAWNBOT_GEEKNEWS_CHANNEL_ID',
  news: 'YAWNBOT_NEWS_CHANNEL_ID',
  'assistant-public': 'ASSISTANT_PUBLIC_CHANNEL_ID',
  'agent-team': 'YAWNBOT_AGENT_CHANNEL_ID',
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
  } catch (e: any) {
    console.warn(`[ChannelProvision] ${SPEC_PATH} 로드 실패 — 프로비저닝 비활성:`, e?.message ?? e);
    specCache = { categoryName: '욘봇', channels: [] };
  }
  return specCache;
}

/**
 * dev 한정 게이트. YAWNBOT_ENV==='prod' 또는 YAWNBOT_CHANNEL_PROVISION 명시 off 면 false.
 * 명시 on(YAWNBOT_CHANNEL_PROVISION=1) 이면 prod 여도 강제 활성 (수동 마이그레이션용).
 */
export function isProvisioningEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.YAWNBOT_CHANNEL_PROVISION?.trim().toLowerCase();
  if (flag === '0' || flag === 'off' || flag === 'false') return false;
  if (flag === '1' || flag === 'on' || flag === 'true') return true;
  return (env.YAWNBOT_ENV?.trim().toLowerCase() || 'dev') !== 'prod';
}

function mapPath(guildId: string): string {
  return path.join(PKG_ROOT, 'data', `provisioned-channels.${guildId}.json`);
}

export function loadProvisionedMap(guildId: string): Record<string, string> {
  try {
    const raw = JSON.parse(fs.readFileSync(mapPath(guildId), 'utf-8'));
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

function saveProvisionedMap(guildId: string, map: Record<string, string>): void {
  fs.writeFileSync(mapPath(guildId), JSON.stringify(map, null, '\t') + '\n', 'utf-8');
}

// ── reconcile 가 의존하는 *최소* 길드 인터페이스 (discord.js Guild 의 구조적 부분집합).
//    테스트가 페이크를 주입할 수 있도록 좁게 (Deep Modules: 좁은 seam). ──
export interface ChannelLike {
  id: string;
  name: string;
  type: number;
  parentId?: string | null;
}
export interface GuildChannelManagerLike {
  cache: { find(fn: (c: ChannelLike) => boolean): ChannelLike | undefined };
  create(opts: {
    name: string;
    type: number;
    parent?: string | null;
    topic?: string;
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
 * 한 길드의 채널 구조를 spec 에 맞춰 reconcile. 멱등 — 두 번 돌려도 생성 0.
 * 우선순위: 저장 ID 생존 → 이름으로 기존 claim → 생성.
 */
export async function reconcileGuildChannels(
  guild: GuildLike,
  spec: ChannelSpec = getChannelSpec(),
): Promise<ReconcileResult> {
  const map = loadProvisionedMap(guild.id);
  const created: string[] = [];
  const claimed: string[] = [];
  const reused: string[] = [];

  const byId = (id: string | undefined): ChannelLike | undefined =>
    id ? guild.channels.cache.find((c) => c.id === id) : undefined;

  // 1) 카테고리
  let categoryId = map[CATEGORY_MAP_KEY];
  let category = byId(categoryId);
  if (category && category.type === ChannelType.GuildCategory) {
    reused.push(CATEGORY_MAP_KEY);
  } else {
    category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === spec.categoryName,
    );
    if (category) {
      claimed.push(CATEGORY_MAP_KEY);
    } else {
      category = await guild.channels.create({
        name: spec.categoryName,
        type: ChannelType.GuildCategory,
      });
      created.push(CATEGORY_MAP_KEY);
    }
    categoryId = category.id;
    map[CATEGORY_MAP_KEY] = categoryId;
  }

  // 2) 채널
  for (const entry of spec.channels) {
    const stored = byId(map[entry.key]);
    if (stored && stored.type === ChannelType.GuildText) {
      reused.push(entry.key);
      continue;
    }
    const existing = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name === entry.name,
    );
    if (existing) {
      map[entry.key] = existing.id;
      claimed.push(entry.key);
      continue;
    }
    const ch = await guild.channels.create({
      name: entry.name,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: entry.topic,
    });
    map[entry.key] = ch.id;
    created.push(entry.key);
  }

  saveProvisionedMap(guild.id, map);
  return { guildId: guild.id, map, created, claimed, reused };
}

/** 길드별 reconcile 결과를 모듈 메모리에도 캐시 (resolver 가 파일 안 읽고 즉답). */
const liveMaps = new Map<string, Record<string, string>>();

export function rememberMap(guildId: string, map: Record<string, string>): void {
  liveMaps.set(guildId, map);
}

/** dev 기준 길드 = DISCORD_GUILD_ID 의 첫 항목. resolver 의 단일 길드 선택. */
export function primaryGuildId(env: NodeJS.ProcessEnv = process.env): string | null {
  const raw = env.DISCORD_GUILD_ID?.trim();
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  return first || null;
}

function provisionedId(key: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const gid = primaryGuildId(env);
  if (!gid) return null;
  const map = liveMaps.get(gid) ?? loadProvisionedMap(gid);
  return map[key]?.trim() || null;
}

/**
 * 논리 키 → 실제 채널 ID. 소비자(notifier 등)의 단일 진입점.
 *  - 프로비저닝 OFF (prod): env *_CHANNEL_ID 그대로 (기존 동작 byte-identical).
 *  - 프로비저닝 ON  (dev) : 프로비저닝 ID 우선 → 없으면 env 폴백.
 */
export function channelIdFor(key: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const envKey = ENV_KEY_BY_LOGICAL[key];
  const envVal = envKey ? env[envKey]?.trim() || null : null;
  if (!isProvisioningEnabled(env)) return envVal;
  return provisionedId(key, env) ?? envVal;
}
