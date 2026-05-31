import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseDecision,
  countRecentSelfUtterances,
  handleTrigger,
  decideUtterance,
  LlmCallBudget,
} from './agent-daemon.js';
import { publishBusEvent, readRecentBusEvents } from './services/agent-bus.js';
import type { CoreDef } from './services/agent-core.js';
import type { GenerativeTextClient } from 'karmolab-ai/node';

function fakeCore(id: string, overrides: Partial<CoreDef> = {}): CoreDef {
  return {
    id,
    role: `${id} role`,
    status: 'active',
    defaultSkin: 'alisa',
    emoji: '🛰',
    displayName: id.charAt(0).toUpperCase() + id.slice(1),
    body: '직무: 테스트 코어. 시각 있을 때만 답한다.',
    skills: [],
    frontmatter: {},
    ...overrides,
  };
}

function fakeLLM(resp: string | (() => string)): GenerativeTextClient {
  return {
    surface: 'aiStudio',
    modelId: 'test',
    async generateFromPrompt(): Promise<string> {
      return typeof resp === 'function' ? resp() : resp;
    },
  } as unknown as GenerativeTextClient;
}

async function freshRoots(label: string): Promise<{ bus: string; memo: string }> {
  const bus = path.join(os.tmpdir(), `daemon-bus-${label}-${process.pid}-${Date.now()}`);
  const memo = path.join(os.tmpdir(), `daemon-memo-${label}-${process.pid}-${Date.now()}`);
  await fsp.rm(bus, { recursive: true, force: true });
  await fsp.rm(memo, { recursive: true, force: true });
  await fsp.mkdir(bus, { recursive: true });
  await fsp.mkdir(memo, { recursive: true });
  return { bus, memo };
}

describe('parseDecision', () => {
  it('clean json answer', () => {
    expect(parseDecision('{"decision":"answer","text":"안녕"}')).toEqual({
      decision: 'answer',
      text: '안녕',
    });
  });
  it('clean json skip', () => {
    expect(parseDecision('{"decision":"skip","text":"내 시각 없음"}')).toEqual({
      decision: 'skip',
      text: '내 시각 없음',
    });
  });
  it('code fence wrapped', () => {
    expect(parseDecision('```json\n{"decision":"answer","text":"hi"}\n```')).toEqual({
      decision: 'answer',
      text: 'hi',
    });
  });
  it('empty answer text = skip (silence default)', () => {
    expect(parseDecision('{"decision":"answer","text":""}').decision).toBe('skip');
  });
  it('garbage = skip', () => {
    expect(parseDecision('no json here').decision).toBe('skip');
    expect(parseDecision('{broken json').decision).toBe('skip');
  });
});

describe('countRecentSelfUtterances', () => {
  it('cap 안 자기 발화 카운트', () => {
    const now = new Date('2026-05-23T12:00:00Z');
    const evs = [
      {
        ts: '2026-05-23T11:58:00Z',
        type: 'core-utter' as const,
        channelId: 'ch1',
        source: 'core:atlas',
        coreId: 'atlas',
        text: 'x',
      },
      {
        ts: '2026-05-23T11:59:30Z',
        type: 'core-utter' as const,
        channelId: 'ch1',
        source: 'core:atlas',
        coreId: 'atlas',
        text: 'y',
      },
      {
        ts: '2026-05-23T11:50:00Z',
        type: 'core-utter' as const,
        channelId: 'ch1',
        source: 'core:atlas',
        coreId: 'atlas',
        text: 'old',
      },
      {
        ts: '2026-05-23T11:59:00Z',
        type: 'core-utter' as const,
        channelId: 'ch1',
        source: 'core:echo',
        coreId: 'echo',
        text: 'other',
      },
    ];
    expect(countRecentSelfUtterances(evs, 'atlas', 5, now)).toBe(2);
    expect(countRecentSelfUtterances(evs, 'echo', 5, now)).toBe(1);
  });
});

describe('handleTrigger', () => {
  let bus: string;
  let memo: string;
  beforeEach(async () => {
    ({ bus, memo } = await freshRoots('ht'));
  });

  it('answer 결정 → core-utter publish + mem write', async () => {
    const core = fakeCore('atlas');
    const llm = fakeLLM('{"decision":"answer","text":"나는 끼어든다"}');
    const trigger = await publishBusEvent(bus, {
      type: 'channel-msg',
      channelId: 'ch1',
      source: 'discord:user',
      text: '아키텍처 어떻게 박을까',
      refs: { author: 'mascari' },
    });
    await handleTrigger(
      {
        core,
        llm,
        busRoot: bus,
        channelId: 'ch1',
        memoRoot: memo,
        ratePer5min: 2,
        contextMinutes: 5,
      },
      trigger,
    );
    const events = await readRecentBusEvents(bus, 'ch1', 10);
    const utter = events.find((e) => e.type === 'core-utter');
    expect(utter).toBeDefined();
    expect(utter!.text).toBe('나는 끼어든다');
    expect(utter!.coreId).toBe('atlas');
  });

  it('skip 결정 → core-react-skip publish (채널 미발화)', async () => {
    const core = fakeCore('atlas');
    const llm = fakeLLM('{"decision":"skip","text":"내 시각 없음"}');
    const trigger = await publishBusEvent(bus, {
      type: 'channel-msg',
      channelId: 'ch1',
      source: 'discord:user',
      text: '점심 뭐 먹지',
    });
    await handleTrigger(
      {
        core,
        llm,
        busRoot: bus,
        channelId: 'ch1',
        memoRoot: memo,
        ratePer5min: 2,
        contextMinutes: 5,
      },
      trigger,
    );
    const events = await readRecentBusEvents(bus, 'ch1', 10);
    expect(events.find((e) => e.type === 'core-utter')).toBeUndefined();
    expect(events.find((e) => e.type === 'core-react-skip')).toBeDefined();
  });

  it('자기 발화 echo = skip (LLM 호출 X)', async () => {
    const core = fakeCore('atlas');
    let called = 0;
    const llm = fakeLLM(() => {
      called += 1;
      return '{"decision":"answer","text":"왜 또"}';
    });
    const trigger = await publishBusEvent(bus, {
      type: 'core-utter',
      channelId: 'ch1',
      source: 'core:atlas',
      coreId: 'atlas',
      text: '내가 한 말',
    });
    await handleTrigger(
      {
        core,
        llm,
        busRoot: bus,
        channelId: 'ch1',
        memoRoot: memo,
        ratePer5min: 2,
        contextMinutes: 5,
      },
      trigger,
    );
    expect(called).toBe(0);
  });

  it('rate limit 초과 → core-react-skip (rate-limit reason)', async () => {
    const core = fakeCore('atlas');
    const now = new Date();
    for (let i = 0; i < 2; i += 1) {
      await publishBusEvent(bus, {
        ts: new Date(now.getTime() - (i + 1) * 30 * 1000).toISOString(),
        type: 'core-utter',
        channelId: 'ch1',
        source: 'core:atlas',
        coreId: 'atlas',
        text: `prev-${i}`,
      });
    }
    let called = 0;
    const llm = fakeLLM(() => {
      called += 1;
      return '{"decision":"answer","text":"3번째"}';
    });
    const trigger = await publishBusEvent(bus, {
      type: 'channel-msg',
      channelId: 'ch1',
      source: 'discord:user',
      text: '다시 한번',
    });
    await handleTrigger(
      {
        core,
        llm,
        busRoot: bus,
        channelId: 'ch1',
        memoRoot: memo,
        ratePer5min: 2,
        contextMinutes: 5,
      },
      trigger,
    );
    expect(called).toBe(0);
    const events = await readRecentBusEvents(bus, 'ch1', 10);
    const skip = events.find(
      (e) => e.type === 'core-react-skip' && e.refs?.skipReason === 'rate-limit',
    );
    expect(skip).toBeDefined();
  });

  it('다른 채널 메시지 = 무시', async () => {
    const core = fakeCore('atlas');
    let called = 0;
    const llm = fakeLLM(() => {
      called += 1;
      return '{"decision":"answer","text":"x"}';
    });
    const trigger = await publishBusEvent(bus, {
      type: 'channel-msg',
      channelId: 'other-ch',
      source: 'discord:user',
      text: '다른 방',
    });
    await handleTrigger(
      {
        core,
        llm,
        busRoot: bus,
        channelId: 'ch1',
        memoRoot: memo,
        ratePer5min: 2,
        contextMinutes: 5,
      },
      trigger,
    );
    expect(called).toBe(0);
  });
});

describe('!kill watcher (P-5)', () => {
  it('!kill 파일 존재 check 패턴', async () => {
    // 본 daemon 의 watcher 는 main() 안 setInterval 이라 직접 unit test 어려움
    // (process.exit 호출). 대신 file existence check 동작 verify.
    const root = path.join(os.tmpdir(), `kill-${process.pid}-${Date.now()}`);
    await fsp.mkdir(path.join(root, '.claude'), { recursive: true });
    const killFile = path.join(root, '.claude', 'agent-kill');
    // 파일 없음 = false
    expect(await fsp.access(killFile).then(() => true).catch(() => false)).toBe(false);
    // 파일 생성
    await fsp.writeFile(killFile, '1', 'utf8');
    expect(await fsp.access(killFile).then(() => true).catch(() => false)).toBe(true);
    await fsp.rm(root, { recursive: true, force: true });
  });
});

describe('LlmCallBudget', () => {
  it('cap 이하 = canCall true, record 누적', () => {
    const b = new LlmCallBudget(3);
    const t = Date.now();
    expect(b.canCall(t)).toBe(true);
    b.record(t);
    b.record(t);
    expect(b.canCall(t)).toBe(true);
    expect(b.count(t)).toBe(2);
    b.record(t);
    expect(b.canCall(t)).toBe(false);
    expect(b.count(t)).toBe(3);
  });
  it('1h 윈도우 밖 entry = prune', () => {
    const b = new LlmCallBudget(3);
    const old = Date.now() - 70 * 60 * 1000;
    b.record(old);
    b.record(old);
    b.record(old);
    const now = Date.now();
    expect(b.canCall(now)).toBe(true);
    expect(b.count(now)).toBe(0);
  });
});

describe('handleTrigger + budget', () => {
  let bus: string;
  let memo: string;
  beforeEach(async () => {
    ({ bus, memo } = await freshRoots('budget'));
  });

  it('budget cap 초과 = LLM 호출 X + skip publish', async () => {
    const core = fakeCore('atlas');
    let called = 0;
    const llm = fakeLLM(() => {
      called += 1;
      return '{"decision":"answer","text":"x"}';
    });
    const budget = new LlmCallBudget(1);
    budget.record();
    const trigger = await publishBusEvent(bus, {
      type: 'channel-msg',
      channelId: 'ch1',
      source: 'discord:user',
      text: 'hi',
    });
    await handleTrigger(
      {
        core,
        llm,
        busRoot: bus,
        channelId: 'ch1',
        memoRoot: memo,
        ratePer5min: 2,
        contextMinutes: 5,
        budget,
      },
      trigger,
    );
    expect(called).toBe(0);
    const evs = await readRecentBusEvents(bus, 'ch1', 10);
    const skip = evs.find(
      (e) => e.type === 'core-react-skip' && e.refs?.skipReason === 'llm-budget-cap',
    );
    expect(skip).toBeDefined();
  });

  it('budget 여유 = LLM 호출 + record', async () => {
    const core = fakeCore('atlas');
    const llm = fakeLLM('{"decision":"answer","text":"답"}');
    const budget = new LlmCallBudget(5);
    const trigger = await publishBusEvent(bus, {
      type: 'channel-msg',
      channelId: 'ch1',
      source: 'discord:user',
      text: 'hi',
    });
    await handleTrigger(
      {
        core,
        llm,
        busRoot: bus,
        channelId: 'ch1',
        memoRoot: memo,
        ratePer5min: 2,
        contextMinutes: 5,
        budget,
      },
      trigger,
    );
    expect(budget.count()).toBe(1);
  });
});

describe('decideUtterance (LLM prompt 구성)', () => {
  it('LLM 응답 형식 잘 들어오면 answer parse', async () => {
    const core = fakeCore('atlas');
    const llm = fakeLLM('{"decision":"answer","text":"hello"}');
    const r = await decideUtterance(llm, core, [], {
      ts: new Date().toISOString(),
      type: 'channel-msg',
      channelId: 'ch1',
      source: 'discord:user',
      text: 'test',
    });
    expect(r.decision).toBe('answer');
    expect(r.text).toBe('hello');
  });

  it('LLM throw = skip', async () => {
    const core = fakeCore('atlas');
    const llm: GenerativeTextClient = {
      surface: 'aiStudio',
      modelId: 'test',
      async generateFromPrompt(): Promise<string> {
        throw new Error('quota exceeded');
      },
    } as unknown as GenerativeTextClient;
    const r = await decideUtterance(llm, core, [], {
      ts: new Date().toISOString(),
      type: 'channel-msg',
      channelId: 'ch1',
      source: 'discord:user',
      text: 'test',
    });
    expect(r.decision).toBe('skip');
    expect(r.text).toContain('llm-error');
  });
});
