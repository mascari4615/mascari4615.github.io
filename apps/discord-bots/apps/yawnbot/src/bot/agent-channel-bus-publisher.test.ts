/**
 * agent-channel-bus-publisher 회귀 (TASK-KAR-018-LT-DIVERSITY D-7 substrate
 * 완결). 자기루프 차단·실패 재시도 X·lastSeenTs 진전·excludeSources override
 * 의 결정 흐름 잠금.
 */
import { describe, it, expect } from 'vitest';
import type { BusEvent } from './agent-channel-bus';
import {
  publisherTickOnce,
  summarizePublisherTick,
  type PublisherDeps,
  type PublisherState,
} from './agent-channel-bus-publisher';

const NOW = new Date('2026-05-23T03:00:00.000Z');

interface Spy {
  speakCalls: { coreId: string; text: string }[];
  speakOk: boolean;
  throwOnce?: boolean;
}

function mkDeps(events: BusEvent[], spy: Spy): PublisherDeps {
  return {
    readSince: (channelId: string, sinceTs: string) => {
      const ms = sinceTs ? Date.parse(sinceTs) : -Infinity;
      return events.filter(
        (e) => e.channelId === channelId && Date.parse(e.ts) > ms,
      );
    },
    speak: async (coreId, text) => {
      spy.speakCalls.push({ coreId, text });
      if (spy.throwOnce) {
        spy.throwOnce = false;
        throw new Error('discord-fail');
      }
      return spy.speakOk;
    },
    now: () => NOW,
  };
}

function ev(overrides: Partial<BusEvent>): BusEvent {
  return {
    ts: NOW.toISOString(),
    source: 'agent-runtime',
    type: 'core-utter',
    channelId: 'team-bus',
    coreId: 'echo',
    text: '내 시각.',
    ...overrides,
  };
}

describe('publisherTickOnce', () => {
  it('표면화: agent-runtime core-utter 만 speak 호출', async () => {
    const events = [
      ev({ ts: '2026-05-23T02:55:00.000Z', text: 'first' }),
      ev({ ts: '2026-05-23T02:56:00.000Z', text: 'second' }),
    ];
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus' },
    );
    expect(m.scanned).toBe(2);
    expect(m.attempted).toBe(2);
    expect(m.posted).toBe(2);
    expect(m.failed).toBe(0);
    expect(m.skipped).toBe(0);
    expect(spy.speakCalls).toEqual([
      { coreId: 'echo', text: 'first' },
      { coreId: 'echo', text: 'second' },
    ]);
    expect(m.lastSeenTs).toBe('2026-05-23T02:56:00.000Z');
  });

  it('자기루프 차단: in-process source = skip (이미 표면화된 mirror)', async () => {
    const events = [
      ev({ source: 'in-process', ts: '2026-05-23T02:55:00.000Z', text: 'mirror' }),
      ev({ source: 'agent-runtime', ts: '2026-05-23T02:56:00.000Z', text: 'real' }),
    ];
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus' },
    );
    expect(m.skipped).toBe(1);
    expect(m.attempted).toBe(1);
    expect(m.posted).toBe(1);
    expect(spy.speakCalls).toEqual([{ coreId: 'echo', text: 'real' }]);
  });

  it('channel-msg(외부 사용자) = skip (표면화 대상 X)', async () => {
    const events = [
      ev({ type: 'channel-msg', coreId: undefined, text: '사용자 메시지', ts: '2026-05-23T02:55:00.000Z' }),
    ];
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus' },
    );
    expect(m.skipped).toBe(1);
    expect(m.attempted).toBe(0);
    expect(spy.speakCalls).toEqual([]);
  });

  it('coreId 누락된 core-utter = skip (방어적)', async () => {
    const events = [
      ev({ coreId: undefined, text: '코어 미상', ts: '2026-05-23T02:55:00.000Z' }),
    ];
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus' },
    );
    expect(m.skipped).toBe(1);
    expect(m.attempted).toBe(0);
  });

  it('speak 실패: failed++ · lastSeenTs 진전 · 재시도 X', async () => {
    const events = [
      ev({ ts: '2026-05-23T02:55:00.000Z', text: 'will-fail' }),
      ev({ ts: '2026-05-23T02:56:00.000Z', text: 'next' }),
    ];
    const spy: Spy = { speakCalls: [], speakOk: false };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus' },
    );
    expect(m.attempted).toBe(2);
    expect(m.posted).toBe(0);
    expect(m.failed).toBe(2);
    expect(m.lastSeenTs).toBe('2026-05-23T02:56:00.000Z');
  });

  it('speak throw = failed (catch 안전망)', async () => {
    const events = [ev({ ts: '2026-05-23T02:55:00.000Z' })];
    const spy: Spy = { speakCalls: [], speakOk: true, throwOnce: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus' },
    );
    expect(m.failed).toBe(1);
    expect(m.posted).toBe(0);
  });

  it('lastSeenTs cursor: 이전 이후만 처리', async () => {
    const events = [
      ev({ ts: '2026-05-23T02:50:00.000Z', text: 'old' }),
      ev({ ts: '2026-05-23T02:55:00.000Z', text: 'new' }),
    ];
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '2026-05-23T02:52:00.000Z' },
      mkDeps(events, spy),
      { channelId: 'team-bus' },
    );
    expect(m.scanned).toBe(1);
    expect(spy.speakCalls.map((c) => c.text)).toEqual(['new']);
  });

  it('excludeSources override: empty 배열 = default in-process 적용', async () => {
    const events = [ev({ source: 'in-process', text: 'mirror' })];
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus', excludeSources: [] },
    );
    expect(m.skipped).toBe(1);
  });

  it('excludeSources override: 명시 source 차단', async () => {
    const events = [
      ev({ source: 'agent-runtime', text: 'runtime' }),
      ev({ source: 'kl', text: 'kl', ts: '2026-05-23T02:56:00.000Z' }),
    ];
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '' },
      mkDeps(events, spy),
      { channelId: 'team-bus', excludeSources: ['kl'] },
    );
    expect(m.skipped).toBe(1);
    expect(m.attempted).toBe(1);
    expect(spy.speakCalls.map((c) => c.text)).toEqual(['runtime']);
  });

  it('빈 bus: noop', async () => {
    const spy: Spy = { speakCalls: [], speakOk: true };
    const m = await publisherTickOnce(
      { lastSeenTs: '2026-05-22T00:00:00.000Z' },
      mkDeps([], spy),
      { channelId: 'team-bus' },
    );
    expect(m.scanned).toBe(0);
    expect(m.attempted).toBe(0);
    expect(m.lastSeenTs).toBe('2026-05-22T00:00:00.000Z');
  });

  it('summarizePublisherTick: 한 줄 포맷', () => {
    const line = summarizePublisherTick({
      scanned: 5,
      skipped: 2,
      attempted: 3,
      posted: 2,
      failed: 1,
      lastSeenTs: '2026-05-23T02:55:00.000Z',
    });
    expect(line).toContain('scanned=5');
    expect(line).toContain('posted=2');
    expect(line).toContain('fail=1');
  });
});
