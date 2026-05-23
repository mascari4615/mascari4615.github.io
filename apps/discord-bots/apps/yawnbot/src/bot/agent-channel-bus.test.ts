/**
 * agent-channel-bus 순수부 회귀 (TASK-KAR-018-LT-DIVERSITY D-1).
 *
 * substrate ↔ adapter race-free 의 핵심: append-only + KST 일자 회전 + 손상
 * 라인 graceful skip. 일자 경계 + 잘못된 schema + sinceTs 슬라이싱 잠금.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  appendBusEvent,
  readRecentBusEvents,
  lastCoreUtterTs,
  dayFilePath,
  busDir,
  channelDir,
} from './agent-channel-bus';

let root: string;
const env = () => ({ MEMO_REPO_PATH: root }) as NodeJS.ProcessEnv;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'channel-bus-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('path resolvers', () => {
  it('MEMO_REPO_PATH 미설정 = busDir 빈 문자열', () => {
    expect(busDir({} as NodeJS.ProcessEnv)).toBe('');
    expect(channelDir({} as NodeJS.ProcessEnv, 'c1')).toBe('');
    expect(dayFilePath({} as NodeJS.ProcessEnv, 'c1')).toBe('');
  });

  it('부적합 channelId(path traversal 시도) = 빈 문자열', () => {
    expect(channelDir(env(), '../escape')).toBe('');
    expect(channelDir(env(), 'a/b')).toBe('');
    expect(dayFilePath(env(), 'a/b')).toBe('');
  });

  it('안전 channelId = path 정상 합성', () => {
    const d = channelDir(env(), 'team-bus_1234');
    expect(d).toMatch(/agent-channel-bus[\\/]team-bus_1234$/);
  });
});

describe('appendBusEvent / readRecentBusEvents 라운드트립', () => {
  it('append → readRecent 가 같은 event 회수 (channel-msg)', () => {
    const ok = appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'discord',
      type: 'channel-msg',
      channelId: 'C1',
      authorName: 'user',
      authorId: 'u1',
      text: 'hi',
    });
    expect(ok).toBe(true);
    const events = readRecentBusEvents(env(), 'C1', {
      now: new Date('2026-05-23T05:00:00.000Z'),
    });
    expect(events.length).toBe(1);
    expect(events[0].text).toBe('hi');
    expect(events[0].type).toBe('channel-msg');
  });

  it('core-utter 는 coreId 누락 시 거부 (스키마 노이즈 차단)', () => {
    const ok = appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'agent-runtime',
      type: 'core-utter',
      channelId: 'C1',
      text: '발화',
    } as any);
    expect(ok).toBe(false);
  });

  it('잘못된 type 거부', () => {
    const ok = appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'x',
      type: 'unknown-type' as any,
      channelId: 'C1',
      text: 't',
    });
    expect(ok).toBe(false);
  });

  it('부적합 channelId = false (substrate 보호)', () => {
    const ok = appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'discord',
      type: 'channel-msg',
      channelId: '../traversal',
      text: 't',
    });
    expect(ok).toBe(false);
  });

  it('MEMO_REPO_PATH 미설정 = false (substrate 미가용 graceful)', () => {
    const ok = appendBusEvent({} as NodeJS.ProcessEnv, {
      ts: 'now',
      source: 'discord',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'hi',
    });
    expect(ok).toBe(false);
  });

  it('sinceTs 이후 event 만 회수 (exclusive)', () => {
    appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'a',
    });
    appendBusEvent(env(), {
      ts: '2026-05-23T04:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'b',
    });
    appendBusEvent(env(), {
      ts: '2026-05-23T05:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'c',
    });
    const events = readRecentBusEvents(env(), 'C1', {
      sinceTs: '2026-05-23T04:00:00.000Z',
      now: new Date('2026-05-23T06:00:00.000Z'),
    });
    expect(events.map((e) => e.text)).toEqual(['c']);
  });

  it('손상된 JSON 라인은 skip — 다른 라인은 회수', () => {
    appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'ok',
    });
    // 일자 파일에 손상 라인을 직접 추가.
    const p = dayFilePath(env(), 'C1', new Date('2026-05-23T03:00:00.000Z'));
    fs.appendFileSync(p, '{not-json\n');
    appendBusEvent(env(), {
      ts: '2026-05-23T04:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'still-ok',
    });
    const events = readRecentBusEvents(env(), 'C1', {
      now: new Date('2026-05-23T06:00:00.000Z'),
    });
    expect(events.map((e) => e.text)).toEqual(['ok', 'still-ok']);
  });

  it('daysBack=0 이면 오늘 일자만 회수 (어제 event 안 보임)', () => {
    // 어제(KST) 일자 파일에 강제 박기 — appendBusEvent 가 ts 기반 일자 파일 결정.
    appendBusEvent(env(), {
      ts: '2026-05-22T03:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'yesterday',
    });
    appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: 'today',
    });
    const today = readRecentBusEvents(env(), 'C1', {
      now: new Date('2026-05-23T06:00:00.000Z'),
      daysBack: 0,
    });
    expect(today.map((e) => e.text)).toEqual(['today']);

    const both = readRecentBusEvents(env(), 'C1', {
      now: new Date('2026-05-23T06:00:00.000Z'),
      daysBack: 1,
    });
    expect(both.map((e) => e.text)).toEqual(['yesterday', 'today']);
  });

  it('limit = 가장 최근 N 만 (누적 cap)', () => {
    for (let i = 0; i < 5; i++) {
      appendBusEvent(env(), {
        ts: `2026-05-23T03:00:0${i}.000Z`,
        source: 'd',
        type: 'channel-msg',
        channelId: 'C1',
        text: `m${i}`,
      });
    }
    const events = readRecentBusEvents(env(), 'C1', {
      now: new Date('2026-05-23T06:00:00.000Z'),
      limit: 3,
    });
    expect(events.map((e) => e.text)).toEqual(['m2', 'm3', 'm4']);
  });

  it('text 6000자 초과 = slice (저장 폭발 방지)', () => {
    const huge = 'x'.repeat(8000);
    appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'd',
      type: 'channel-msg',
      channelId: 'C1',
      text: huge,
    });
    const events = readRecentBusEvents(env(), 'C1', {
      now: new Date('2026-05-23T06:00:00.000Z'),
    });
    expect(events[0].text.length).toBe(6000);
  });
});

describe('lastCoreUtterTs — rate-limit 베이스', () => {
  it('해당 코어 오늘 발화 없음 = null', () => {
    expect(
      lastCoreUtterTs(env(), 'C1', 'atlas', new Date('2026-05-23T03:00:00Z')),
    ).toBeNull();
  });

  it('가장 최근 core-utter ts 반환 (다른 코어는 무시)', () => {
    appendBusEvent(env(), {
      ts: '2026-05-23T03:00:00.000Z',
      source: 'agent-runtime',
      type: 'core-utter',
      channelId: 'C1',
      coreId: 'atlas',
      text: 'hi',
    });
    appendBusEvent(env(), {
      ts: '2026-05-23T03:30:00.000Z',
      source: 'agent-runtime',
      type: 'core-utter',
      channelId: 'C1',
      coreId: 'echo',
      text: 'hello',
    });
    appendBusEvent(env(), {
      ts: '2026-05-23T04:00:00.000Z',
      source: 'agent-runtime',
      type: 'core-utter',
      channelId: 'C1',
      coreId: 'atlas',
      text: 'again',
    });
    expect(
      lastCoreUtterTs(env(), 'C1', 'atlas', new Date('2026-05-23T05:00:00Z')),
    ).toBe('2026-05-23T04:00:00.000Z');
    expect(
      lastCoreUtterTs(env(), 'C1', 'echo', new Date('2026-05-23T05:00:00Z')),
    ).toBe('2026-05-23T03:30:00.000Z');
  });
});
