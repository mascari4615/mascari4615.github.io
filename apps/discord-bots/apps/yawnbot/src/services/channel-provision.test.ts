/**
 * 채널 프로비저닝 reconcile 행동 테스트 (실 Discord 0 — 페이크 길드 주입).
 *
 * TDD tracer-bullet (quality.md): public 인터페이스로 *행동* 검증 — 멱등성 /
 * 이름 claim / 저장 ID 추적(rename 내성) / prod env-우선 폴백.
 * 결정적: 길드 ID 유니크 + afterEach 로 파생 파일 정리 (FS 격리).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ChannelType } from 'discord.js';
import { PKG_ROOT } from '../paths';
import {
  reconcileGuildChannels,
  channelIdFor,
  getChannelSpec,
  isProvisioningEnabled,
  shouldProvisionGuild,
  allowedGuildIds,
  type GuildLike,
  type ChannelLike,
} from './channel-provision';

const spec = getChannelSpec();
const usedGuildIds: string[] = [];

function newGuildId(): string {
  const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  usedGuildIds.push(id);
  return id;
}

/** discord.js GuildChannelManager 의 최소 구조적 페이크. create 는 id 증가 + cache push. */
function fakeGuild(id: string, seed: ChannelLike[] = []): GuildLike {
  const channels = [...seed];
  let seq = 1000;
  return {
    id,
    channels: {
      cache: { find: (fn) => channels.find(fn) },
      create: async (opts) => {
        const ch: ChannelLike = {
          id: `gen-${seq++}`,
          name: opts.name,
          type: opts.type,
          parentId: opts.parent ?? null,
        };
        channels.push(ch);
        return ch;
      },
    },
  };
}

afterEach(() => {
  for (const gid of usedGuildIds.splice(0)) {
    const p = path.join(PKG_ROOT, 'data', `provisioned-channels.${gid}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

describe('reconcileGuildChannels — 멱등 desired-state', () => {
  it('빈 길드: 카테고리 + spec 채널 전부 생성', async () => {
    const r = await reconcileGuildChannels(fakeGuild(newGuildId()), spec);
    expect(r.created).toContain('__category');
    for (const e of spec.channels) expect(r.created).toContain(e.key);
    expect(r.claimed).toEqual([]);
    expect(Object.keys(r.map)).toContain(spec.channels[0].key);
  });

  it('두 번째 reconcile: 생성 0 — 전부 재사용 (멱등)', async () => {
    const guild = fakeGuild(newGuildId());
    await reconcileGuildChannels(guild, spec);
    const r2 = await reconcileGuildChannels(guild, spec);
    expect(r2.created).toEqual([]);
    expect(r2.reused.length).toBe(spec.channels.length + 1); // +카테고리
  });

  it('이름이 이미 존재하면 생성 X — 기존 채널 claim', async () => {
    const seed: ChannelLike[] = [
      { id: 'cat-x', name: spec.categoryName, type: ChannelType.GuildCategory, parentId: null },
      { id: 'ch-news', name: 'news', type: ChannelType.GuildText, parentId: 'cat-x' },
    ];
    const r = await reconcileGuildChannels(fakeGuild(newGuildId(), seed), spec);
    expect(r.claimed).toContain('__category');
    expect(r.claimed).toContain('news');
    expect(r.map.news).toBe('ch-news');
    expect(r.created).not.toContain('news');
  });

  it('저장 ID 가 살아있으면 채널 이름이 바뀌어도 추적 (rename 내성)', async () => {
    const gid = newGuildId();
    const guild = fakeGuild(gid);
    const r1 = await reconcileGuildChannels(guild, spec);
    const newsId = r1.map.news;
    // 사용자가 디스코드에서 news → 잡담 으로 rename 했다고 가정.
    const renamed = fakeGuild(gid, [
      { id: r1.map.__category, name: spec.categoryName, type: ChannelType.GuildCategory },
      ...spec.channels.map((e) => ({
        id: r1.map[e.key],
        name: e.key === 'news' ? '잡담' : e.name,
        type: ChannelType.GuildText,
        parentId: r1.map.__category,
      })),
    ]);
    const r2 = await reconcileGuildChannels(renamed, spec);
    expect(r2.created).toEqual([]);
    expect(r2.map.news).toBe(newsId); // 이름 바뀌어도 같은 채널
  });
});

describe('isProvisioningEnabled — 기본 ON, =0 opt-out (prod 무관)', () => {
  it('prod 여도 기본 ON (옛 채널 폐기 — dev먼저 철회)', () => {
    expect(isProvisioningEnabled({ YAWNBOT_ENV: 'prod' } as any)).toBe(true);
  });
  it('dev 도 기본 ON', () => {
    expect(isProvisioningEnabled({ YAWNBOT_ENV: 'dev' } as any)).toBe(true);
  });
  it('YAWNBOT_CHANNEL_PROVISION=0 비상 비활성', () => {
    expect(isProvisioningEnabled({ YAWNBOT_CHANNEL_PROVISION: '0' } as any)).toBe(false);
    expect(isProvisioningEnabled({ YAWNBOT_CHANNEL_PROVISION: 'off' } as any)).toBe(false);
  });
});

describe('shouldProvisionGuild — 허용 길드 한정 (친구 서버 사고 방지)', () => {
  it('YAWNBOT_ALLOWED_GUILD_IDS 우선 — 본진만 true, 친구방 false', () => {
    const env = {
      YAWNBOT_ALLOWED_GUILD_IDS: '본진111',
      DISCORD_GUILD_ID: '본진111,친구방222',
    } as unknown as NodeJS.ProcessEnv;
    expect(shouldProvisionGuild('본진111', env)).toBe(true);
    expect(shouldProvisionGuild('친구방222', env)).toBe(false);
  });
  it('ALLOWED 없으면 DISCORD_GUILD_ID 폴백', () => {
    const env = { DISCORD_GUILD_ID: 'g1,g2' } as unknown as NodeJS.ProcessEnv;
    expect(allowedGuildIds(env)).toEqual(['g1', 'g2']);
    expect(shouldProvisionGuild('g2', env)).toBe(true);
    expect(shouldProvisionGuild('g3', env)).toBe(false);
  });
  it('둘 다 없으면 아무 길드도 프로비저닝 X (안전 default)', () => {
    expect(shouldProvisionGuild('아무거나', {} as any)).toBe(false);
  });
});

describe('channelIdFor — ON 기본, 파생 우선 / =0 시 env', () => {
  it('파생 ID 없으면 env 폴백', () => {
    const env = {
      YAWNBOT_NEWS_CHANNEL_ID: '222',
      YAWNBOT_ALLOWED_GUILD_IDS: 'no-such-guild',
    } as unknown as NodeJS.ProcessEnv;
    expect(channelIdFor('news', env)).toBe('222');
  });

  it('YAWNBOT_CHANNEL_PROVISION=0 이면 env 그대로', () => {
    const env = {
      YAWNBOT_CHANNEL_PROVISION: '0',
      YAWNBOT_NEWS_CHANNEL_ID: '333',
      YAWNBOT_ALLOWED_GUILD_IDS: 'g1',
    } as unknown as NodeJS.ProcessEnv;
    expect(channelIdFor('news', env)).toBe('333');
  });
});
