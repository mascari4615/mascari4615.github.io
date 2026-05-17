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

describe('channelIdFor — prod env-우선 / dev 프로비저닝-우선', () => {
  it('프로비저닝 OFF(prod): env *_CHANNEL_ID 그대로', () => {
    const env = {
      YAWNBOT_ENV: 'prod',
      YAWNBOT_NEWS_CHANNEL_ID: '111',
      DISCORD_GUILD_ID: 'g1',
    } as unknown as NodeJS.ProcessEnv;
    expect(channelIdFor('news', env)).toBe('111');
  });

  it('프로비저닝 ON(dev) 인데 파생 ID 없으면 env 폴백', () => {
    const env = {
      YAWNBOT_ENV: 'dev',
      YAWNBOT_NEWS_CHANNEL_ID: '222',
      DISCORD_GUILD_ID: 'no-such-guild',
    } as unknown as NodeJS.ProcessEnv;
    expect(channelIdFor('news', env)).toBe('222');
  });

  it('명시 off 플래그는 prod 판정보다 우선', () => {
    const env = {
      YAWNBOT_ENV: 'dev',
      YAWNBOT_CHANNEL_PROVISION: '0',
      YAWNBOT_NEWS_CHANNEL_ID: '333',
      DISCORD_GUILD_ID: 'g1',
    } as unknown as NodeJS.ProcessEnv;
    expect(channelIdFor('news', env)).toBe('333');
  });
});
