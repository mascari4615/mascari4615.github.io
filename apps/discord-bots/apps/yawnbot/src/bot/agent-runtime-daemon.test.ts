/**
 * agent-runtime-daemon 회귀 (TASK-KAR-018-LT-DIVERSITY D-3).
 *
 * daemon orchestrator 의 *결정 흐름* 잠금. DI'd LLM/bus/mem 으로 LLM·fs
 * 의존 0 in-test — 폭주 회귀(LLM 호출 N건/메시지) + 자기루프 + silence
 * default + 멘션 우회 의 핵심 path 회귀.
 */
import { describe, it, expect } from 'vitest';
import type { BusEvent } from './agent-channel-bus';
import type { CoreDef } from '../services/agent-core';
import {
  agentRuntimeTickOnce,
  type DaemonDeps,
  type DaemonState,
} from './agent-runtime-daemon';

const NOW = new Date('2026-05-23T03:00:00.000Z');

const atlasCore: CoreDef = {
  id: 'atlas',
  role: '시스템 진단',
  status: 'active',
  defaultSkin: 'atlas',
  emoji: '🛰',
  displayName: 'Atlas',
  body: '직무 본문.',
  skills: [],
  frontmatter: {},
};

interface Spy {
  prefilterCalls: number;
  speakCalls: number;
  publishedUtters: { coreId: string; text: string }[];
  memEntries: { coreId: string; type: string; topic: string }[];
}

function mkDeps(
  events: BusEvent[],
  cfg: {
    prefilterResponse?: string;
    speakResponse?: string;
    publishOk?: boolean;
    spy?: Spy;
    now?: Date;
  } = {},
): DaemonDeps {
  const spy = cfg.spy ?? {
    prefilterCalls: 0,
    speakCalls: 0,
    publishedUtters: [],
    memEntries: [],
  };
  return {
    readSince: (channelId: string, sinceTs: string) => {
      const ms = sinceTs ? Date.parse(sinceTs) : -Infinity;
      return events.filter(
        (e) => e.channelId === channelId && Date.parse(e.ts) > ms,
      );
    },
    prefilterLLM: async (_prompt: string) => {
      spy.prefilterCalls++;
      return cfg.prefilterResponse ?? '{"react": true, "why": "ok"}';
    },
    speakLLM: async (_prompt: string) => {
      spy.speakCalls++;
      return cfg.speakResponse ?? '내 생각엔 이러합니다.';
    },
    publishUtter: (ev) => {
      const ok = cfg.publishOk !== false;
      if (ok) spy.publishedUtters.push({ coreId: ev.coreId, text: ev.text });
      return ok;
    },
    appendMem: (entry) => {
      spy.memEntries.push({
        coreId: entry.coreId,
        type: entry.type,
        topic: entry.topic,
      });
    },
    readRecentMem: () => '',
    now: () => cfg.now ?? NOW,
  };
}

const mkMsg = (ts: string, text = 'hi', refs?: BusEvent['refs']): BusEvent => ({
  ts,
  source: 'discord',
  type: 'channel-msg',
  channelId: 'C1',
  authorName: 'fourth',
  authorId: 'u1',
  text,
  refs,
});
const mkUtter = (ts: string, coreId: string, text = 'x'): BusEvent => ({
  ts,
  source: 'agent-runtime',
  type: 'core-utter',
  channelId: 'C1',
  coreId,
  text,
});

describe('agentRuntimeTickOnce — 결정 흐름 잠금', () => {
  it('빈 bus = LLM 호출 0', async () => {
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([], { spy });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(m.scanned).toBe(0);
    expect(spy.prefilterCalls).toBe(0);
    expect(spy.speakCalls).toBe(0);
  });

  it('새 channel-msg → prefilter → speak → publish + mem', async () => {
    const ev = mkMsg('2026-05-23T02:59:30.000Z', '시스템 어떻게?');
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([ev], { spy });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.prefilterCalls).toBe(1);
    expect(spy.speakCalls).toBe(1);
    expect(spy.publishedUtters).toHaveLength(1);
    expect(spy.publishedUtters[0].coreId).toBe('atlas');
    expect(spy.memEntries).toHaveLength(1);
    expect(m.spoken).toBe(1);
    expect(m.lastSeenTs).toBe(ev.ts);
  });

  it('자기 core-utter 는 평가 skip (자기루프 차단)', async () => {
    const ev = mkUtter('2026-05-23T02:59:30.000Z', 'atlas', '내가 한 말');
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([ev], { spy });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.prefilterCalls).toBe(0);
    expect(spy.speakCalls).toBe(0);
    expect(m.skippedSelf).toBe(1);
  });

  it('다른 코어의 core-utter 는 평가 대상 (ambient)', async () => {
    const ev = mkUtter('2026-05-23T02:59:30.000Z', 'echo', '내 생각엔…');
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([ev], { spy });
    await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.prefilterCalls).toBe(1);
  });

  it('rate-limit 도달(5분 안 2발화) + 미멘션 = LLM 호출 0', async () => {
    // atlas 가 직전 5분 안 이미 2번 발화. 새 메시지 와도 silence.
    const events: BusEvent[] = [
      mkUtter('2026-05-23T02:58:00.000Z', 'atlas'),
      mkUtter('2026-05-23T02:59:00.000Z', 'atlas'),
      mkMsg('2026-05-23T02:59:30.000Z', '새 메시지'),
    ];
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps(events, { spy });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '2026-05-23T02:59:25.000Z' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.prefilterCalls).toBe(0);
    expect(spy.speakCalls).toBe(0);
    expect(m.skippedRateLimited).toBe(1);
  });

  it('rate-limit 중에도 멘션 = prefilter+speak 강제', async () => {
    const events: BusEvent[] = [
      mkUtter('2026-05-23T02:58:00.000Z', 'atlas'),
      mkUtter('2026-05-23T02:59:00.000Z', 'atlas'),
      mkMsg('2026-05-23T02:59:30.000Z', '@atlas 봐줘', {
        mentionedCoreIds: ['atlas'],
      }),
    ];
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps(events, { spy });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '2026-05-23T02:59:25.000Z' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.prefilterCalls).toBe(1);
    expect(spy.speakCalls).toBe(1);
    expect(m.skippedRateLimited).toBe(0);
    expect(m.spoken).toBe(1);
  });

  it('prefilter react=false = silence (speak 호출 0)', async () => {
    const ev = mkMsg('2026-05-23T02:59:30.000Z', '관련 없는 얘기');
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([ev], {
      spy,
      prefilterResponse: '{"react": false, "why": "내 도메인 X"}',
    });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.prefilterCalls).toBe(1);
    expect(spy.speakCalls).toBe(0);
    expect(m.silenced).toBe(1);
    expect(m.spoken).toBe(0);
  });

  it('prefilter react=false 라도 멘션이면 강제 speak (멘션 우회)', async () => {
    const ev = mkMsg('2026-05-23T02:59:30.000Z', '@atlas 봐줘', {
      mentionedCoreIds: ['atlas'],
    });
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([ev], {
      spy,
      prefilterResponse: '{"react": false, "why": "X"}',
    });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.speakCalls).toBe(1);
    expect(m.spoken).toBe(1);
  });

  it('speak 결과가 비었으면 publish skip (silenced 로 분류)', async () => {
    const ev = mkMsg('2026-05-23T02:59:30.000Z', 'q');
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([ev], { spy, speakResponse: '   ' });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(spy.publishedUtters).toHaveLength(0);
    expect(m.silenced).toBe(1);
  });

  it('publish 실패 = publishFailed metric + spoken X', async () => {
    const ev = mkMsg('2026-05-23T02:59:30.000Z', 'q');
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps([ev], { spy, publishOk: false });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(m.publishFailed).toBe(1);
    expect(m.spoken).toBe(0);
    expect(spy.memEntries).toHaveLength(0); // mem 도 skip
  });

  it('lastSeenTs 갱신 — silence 한 event 도 진행 (다음 tick 에서 중복 평가 X)', async () => {
    const events: BusEvent[] = [
      mkMsg('2026-05-23T02:59:00.000Z', 'a'),
      mkMsg('2026-05-23T02:59:30.000Z', 'b'),
    ];
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps = mkDeps(events, {
      spy,
      prefilterResponse: '{"react": false, "why": "skip"}',
    });
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(m.lastSeenTs).toBe('2026-05-23T02:59:30.000Z');
    expect(m.silenced).toBe(2);
  });

  it('prefilter LLM throw = 안전 폴백 silence (예외 전파 X)', async () => {
    const ev = mkMsg('2026-05-23T02:59:30.000Z', 'q');
    const spy: Spy = { prefilterCalls: 0, speakCalls: 0, publishedUtters: [], memEntries: [] };
    const deps: DaemonDeps = {
      ...mkDeps([ev], { spy }),
      prefilterLLM: async () => {
        throw new Error('LLM unavailable');
      },
    };
    const m = await agentRuntimeTickOnce(
      { lastSeenTs: '' },
      deps,
      { core: atlasCore, channelId: 'C1' },
    );
    expect(m.silenced).toBe(1);
    expect(m.spoken).toBe(0);
  });
});
