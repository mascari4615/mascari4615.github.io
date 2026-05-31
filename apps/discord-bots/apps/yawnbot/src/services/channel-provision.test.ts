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

/** discord.js GuildChannelManager 의 최소 구조적 페이크. create 는 id 증가 + cache push.
 *  GuildForum 채널은 availableTags 보관 + setAvailableTags 메소드 노출 (드리프트 sync 시뮬). */
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
        if (opts.availableTags) ch.availableTags = [...opts.availableTags];
        if (opts.type === ChannelType.GuildForum) {
          ch.setAvailableTags = async (tags) => {
            ch.availableTags = [...tags];
          };
        }
        channels.push(ch);
        return ch;
      },
    },
  };
}

// prod 라벨 = 카테고리명 = spec.categoryName (suffix 없음, 시드 단순).
const PROD = { YAWNBOT_ENV: 'prod' } as unknown as NodeJS.ProcessEnv;
const DEV = { YAWNBOT_ENV: 'dev' } as unknown as NodeJS.ProcessEnv;

afterEach(() => {
  for (const gid of usedGuildIds.splice(0)) {
    for (const label of ['prod', 'dev']) {
      const p = path.join(PKG_ROOT, 'data', `provisioned-channels.${gid}.${label}.json`);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  }
});

describe('reconcileGuildChannels — 멱등 desired-state', () => {
  it('빈 길드: 카테고리 + spec 채널 전부 생성', async () => {
    const r = await reconcileGuildChannels(fakeGuild(newGuildId()), spec, PROD);
    expect(r.created).toContain('__category');
    for (const e of spec.channels) expect(r.created).toContain(e.key);
    expect(r.claimed).toEqual([]);
    expect(Object.keys(r.map)).toContain(spec.channels[0].key);
  });

  it('두 번째 reconcile: 생성 0 — 전부 재사용 (멱등)', async () => {
    const guild = fakeGuild(newGuildId());
    await reconcileGuildChannels(guild, spec, PROD);
    const r2 = await reconcileGuildChannels(guild, spec, PROD);
    expect(r2.created).toEqual([]);
    expect(r2.reused.length).toBe(spec.channels.length + 1); // +카테고리
  });

  it('이름이 이미 존재하면 생성 X — 기존 채널 claim (카테고리 하위 스코프)', async () => {
    const seed: ChannelLike[] = [
      { id: 'cat-x', name: spec.categoryName, type: ChannelType.GuildCategory, parentId: null },
      { id: 'ch-news', name: 'news', type: ChannelType.GuildText, parentId: 'cat-x' },
    ];
    const r = await reconcileGuildChannels(fakeGuild(newGuildId(), seed), spec, PROD);
    expect(r.claimed).toContain('__category');
    expect(r.claimed).toContain('news');
    expect(r.map.news).toBe('ch-news');
    expect(r.created).not.toContain('news');
  });

  it('같은 이름이라도 다른 카테고리(부모)면 claim X — 새로 생성', async () => {
    // 다른 인스턴스 카테고리 하위의 'news' 는 가로채면 안 됨.
    const seed: ChannelLike[] = [
      { id: 'other-cat', name: '딴카테고리', type: ChannelType.GuildCategory, parentId: null },
      { id: 'foreign-news', name: 'news', type: ChannelType.GuildText, parentId: 'other-cat' },
    ];
    const r = await reconcileGuildChannels(fakeGuild(newGuildId(), seed), spec, PROD);
    expect(r.map.news).not.toBe('foreign-news');
    expect(r.created).toContain('news');
  });

  it('저장 ID 가 살아있으면 채널 이름이 바뀌어도 추적 (rename 내성)', async () => {
    const gid = newGuildId();
    const guild = fakeGuild(gid);
    const r1 = await reconcileGuildChannels(guild, spec, PROD);
    const newsId = r1.map.news;
    // 사용자가 디스코드에서 news → 잡담 으로 rename 했다고 가정.
    const renamed = fakeGuild(gid, [
      { id: r1.map.__category, name: spec.categoryName, type: ChannelType.GuildCategory },
      ...spec.channels.map((e) => ({
        id: r1.map[e.key],
        name: e.key === 'news' ? '잡담' : e.name,
        type: e.type === 'GuildForum' ? ChannelType.GuildForum : ChannelType.GuildText,
        parentId: r1.map.__category,
      })),
    ]);
    const r2 = await reconcileGuildChannels(renamed, spec, PROD);
    expect(r2.created).toEqual([]);
    expect(r2.map.news).toBe(newsId); // 이름 바뀌어도 같은 채널
  });

  it('같은 길드 prod+dev 공존 — 카테고리 분리 + 교차 claim 0 (사용자 케이스)', async () => {
    const gid = newGuildId();
    const channels: ChannelLike[] = []; // 한 길드를 두 인스턴스가 공유
    let seq = 5000;
    const guild: GuildLike = {
      id: gid,
      channels: {
        cache: { find: (fn) => channels.find(fn) },
        create: async (o) => {
          const c: ChannelLike = {
            id: `g${seq++}`,
            name: o.name,
            type: o.type,
            parentId: o.parent ?? null,
          };
          if (o.availableTags) c.availableTags = [...o.availableTags];
          if (o.type === ChannelType.GuildForum) {
            c.setAvailableTags = async (tags) => {
              c.availableTags = [...tags];
            };
          }
          channels.push(c);
          return c;
        },
      },
    };
    const rp = await reconcileGuildChannels(guild, spec, PROD); // 욘봇
    const rd = await reconcileGuildChannels(guild, spec, DEV); // 욘봇-dev
    // 카테고리 2개 (분리)
    const cats = channels.filter((c) => c.type === ChannelType.GuildCategory);
    expect(cats.map((c) => c.name).sort()).toEqual(
      [spec.categoryName, `${spec.categoryName}-dev`].sort(),
    );
    // dev 가 prod 채널을 단 하나도 가로채지 않음
    for (const e of spec.channels) {
      expect(rd.map[e.key]).not.toBe(rp.map[e.key]);
    }
    // dev 채널은 dev 카테고리 하위
    const devCat = rd.map.__category;
    for (const e of spec.channels) {
      const ch = channels.find((c) => c.id === rd.map[e.key]);
      expect(ch?.parentId).toBe(devCat);
    }
  });
});

describe('reconcileGuildChannels — GuildForum (TASK-KAR-018-LT-FORUM)', () => {
  it('agent-work entry = GuildForum 타입으로 생성 + availableTags 박힘', async () => {
    const guild = fakeGuild(newGuildId());
    const r = await reconcileGuildChannels(guild, spec, PROD);
    expect(r.created).toContain('agent-work');
    // cache 에서 실제 채널 객체 찾아 검증
    const ch = guild.channels.cache.find((c) => c.id === r.map['agent-work']);
    expect(ch).toBeDefined();
    expect(ch!.type).toBe(ChannelType.GuildForum);
    // spec 의 12개 태그가 그대로 박힘 (discord.js 형식 변환: emoji → { name })
    const tagNames = (ch!.availableTags ?? []).map((t) => t.name).sort();
    expect(tagNames).toContain('proposal');
    expect(tagNames).toContain('worker-report');
    expect(tagNames).toContain('discovery');
    expect(tagNames).toContain('pending');
    expect(tagNames).toContain('done');
    expect(tagNames).toContain('WM');
    expect(tagNames.length).toBe(13);
    // emoji = { name: '<unicode>' } 형식
    const proposalTag = (ch!.availableTags ?? []).find((t) => t.name === 'proposal');
    expect(proposalTag?.emoji).toEqual({ name: '💡' });
  });

  it('두 번째 reconcile: forum 채널도 reused (멱등 + 태그 드리프트 sync)', async () => {
    const guild = fakeGuild(newGuildId());
    await reconcileGuildChannels(guild, spec, PROD);
    // 외부에서 사용자가 태그 임의 제거 (드리프트 시뮬)
    const forumCh = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildForum,
    );
    expect(forumCh).toBeDefined();
    forumCh!.availableTags = [{ name: 'orphan-tag' }];
    const r2 = await reconcileGuildChannels(guild, spec, PROD);
    expect(r2.created).toEqual([]);
    expect(r2.reused).toContain('agent-work');
    // setAvailableTags 가 호출돼 spec 정합으로 복원
    expect((forumCh!.availableTags ?? []).map((t) => t.name).sort()).not.toContain(
      'orphan-tag',
    );
    expect((forumCh!.availableTags ?? []).length).toBe(13);
  });

  it('같은 이름 forum 채널이 미리 있으면 claim (생성 X) + 태그 동기', async () => {
    const gid = newGuildId();
    const seed: ChannelLike[] = [
      { id: 'cat-x', name: spec.categoryName, type: ChannelType.GuildCategory, parentId: null },
      {
        id: 'existing-forum',
        name: 'team-work',
        type: ChannelType.GuildForum,
        parentId: 'cat-x',
        availableTags: [{ name: 'legacy' }],
        setAvailableTags: async function (this: ChannelLike, tags) {
          this.availableTags = [...tags];
        } as ChannelLike['setAvailableTags'],
      },
    ];
    // setAvailableTags 의 this 바인딩 보정 — seed 채널 객체 자체에 박음
    const existing = seed[1];
    existing.setAvailableTags = async (tags) => {
      existing.availableTags = [...tags];
    };
    const guild = fakeGuild(gid, seed);
    const r = await reconcileGuildChannels(guild, spec, PROD);
    expect(r.claimed).toContain('agent-work');
    expect(r.created).not.toContain('agent-work');
    expect(r.map['agent-work']).toBe('existing-forum');
    // 태그 동기로 legacy 제거 + spec 12개 박힘
    expect((existing.availableTags ?? []).map((t) => t.name)).not.toContain('legacy');
    expect((existing.availableTags ?? []).length).toBe(13);
  });
});

describe('isProvisioningEnabled — 기본 ON, =0 opt-out (prod 무관)', () => {
  it('prod 여도 기본 ON (옛 채널 폐기 — dev먼저 철회)', () => {
    expect(
      isProvisioningEnabled({ YAWNBOT_ENV: 'prod' } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
  it('dev 도 기본 ON', () => {
    expect(
      isProvisioningEnabled({ YAWNBOT_ENV: 'dev' } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });
  it('YAWNBOT_CHANNEL_PROVISION=0 비상 비활성', () => {
    expect(
      isProvisioningEnabled({ YAWNBOT_CHANNEL_PROVISION: '0' } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isProvisioningEnabled({ YAWNBOT_CHANNEL_PROVISION: 'off' } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
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
    expect(shouldProvisionGuild('아무거나', {} as unknown as NodeJS.ProcessEnv)).toBe(false);
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
