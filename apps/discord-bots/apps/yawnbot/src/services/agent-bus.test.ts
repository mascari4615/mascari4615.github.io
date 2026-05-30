import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  publishBusEvent,
  readRecentBusEvents,
  subscribeBusEvents,
  busFilePath,
  resolveBusRoot,
} from './agent-bus.js';

async function freshRoot(label: string): Promise<string> {
  const root = path.join(
    os.tmpdir(),
    `agent-bus-${label}-${process.pid}-${Date.now()}`,
  );
  await fsp.rm(root, { recursive: true, force: true });
  await fsp.mkdir(root, { recursive: true });
  return root;
}

async function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('agent-bus', () => {
  describe('resolveBusRoot', () => {
    it('env override 우선', () => {
      expect(resolveBusRoot({ LAPTOP_AGENT_BUS_ROOT: '/tmp/foo' } as any)).toBe(
        '/tmp/foo',
      );
    });
    it('default = ~/.karmoddrine/agent-bus', () => {
      const r = resolveBusRoot({} as any);
      expect(r).toContain('.karmoddrine');
      expect(r).toContain('agent-bus');
    });
  });

  describe('busFilePath', () => {
    it('KST 일자로 rotate', () => {
      // UTC 2026-05-23T15:30 = KST 2026-05-24 00:30 → 새 파일
      const utcEvening = new Date('2026-05-23T15:30:00Z');
      const file = busFilePath('/r', 'ch1', utcEvening);
      expect(file).toContain('2026-05-24.jsonl');
    });
    it('invalid channelId throw', () => {
      expect(() => busFilePath('/r', '../escape', new Date())).toThrow();
      expect(() => busFilePath('/r', '', new Date())).toThrow();
    });
  });

  describe('publish + readRecent round trip', () => {
    let root: string;
    beforeEach(async () => {
      root = await freshRoot('rt');
    });

    it('단일 publish → recent read 잡힘', async () => {
      await publishBusEvent(root, {
        type: 'channel-msg',
        channelId: 'ch1',
        source: 'discord',
        text: 'hello',
      });
      const got = await readRecentBusEvents(root, 'ch1', 60);
      expect(got).toHaveLength(1);
      expect(got[0].text).toBe('hello');
      expect(got[0].type).toBe('channel-msg');
    });

    it('windowMinutes 밖 = 누락', async () => {
      const oldTs = new Date(Date.now() - 120 * 60 * 1000).toISOString();
      await publishBusEvent(root, {
        ts: oldTs,
        type: 'channel-msg',
        channelId: 'ch1',
        source: 'discord',
        text: 'old',
      });
      const got = await readRecentBusEvents(root, 'ch1', 60);
      expect(got).toHaveLength(0);
    });

    it('손상 라인 silently skip', async () => {
      const today = busFilePath(root, 'ch1');
      await fsp.mkdir(path.dirname(today), { recursive: true });
      await fsp.writeFile(
        today,
        ['{not json}', JSON.stringify({
          ts: new Date().toISOString(),
          type: 'channel-msg',
          channelId: 'ch1',
          source: 'discord',
          text: 'ok',
        })].join('\n'),
      );
      const got = await readRecentBusEvents(root, 'ch1', 60);
      expect(got).toHaveLength(1);
      expect(got[0].text).toBe('ok');
    });
  });

  describe('concurrent publish race-safety', () => {
    it('9 동시 writer 모두 잡힘 (append-only atomic)', async () => {
      const root = await freshRoot('race');
      const writers = Array.from({ length: 9 }, (_, i) =>
        publishBusEvent(root, {
          type: 'core-utter',
          channelId: 'ch1',
          source: `core:agent-${i}`,
          coreId: `agent-${i}`,
          text: `발화 ${i}`,
        }),
      );
      await Promise.all(writers);
      const got = await readRecentBusEvents(root, 'ch1', 60);
      expect(got).toHaveLength(9);
      const ids = new Set(got.map((e) => e.coreId));
      expect(ids.size).toBe(9);
    });
  });

  describe('subscribe (tail)', () => {
    it('subscribe 후 새 publish 만 onEvent', async () => {
      const root = await freshRoot('sub');
      // 시작 전 1건 (이건 안 잡혀야 — already-written skip)
      await publishBusEvent(root, {
        type: 'channel-msg',
        channelId: 'ch1',
        source: 'discord',
        text: 'before',
      });
      const got: string[] = [];
      const sub = subscribeBusEvents(
        root,
        'ch1',
        (e) => got.push(e.text),
        { intervalMs: 50 },
      );
      // initial tick + offset 결정 대기
      await wait(100);
      await publishBusEvent(root, {
        type: 'channel-msg',
        channelId: 'ch1',
        source: 'discord',
        text: 'after1',
      });
      await publishBusEvent(root, {
        type: 'core-utter',
        channelId: 'ch1',
        source: 'core:atlas',
        coreId: 'atlas',
        text: 'after2',
      });
      await wait(200);
      sub.stop();
      expect(got).toContain('after1');
      expect(got).toContain('after2');
      expect(got).not.toContain('before');
    });

    it('stop 후 추가 publish = onEvent 호출 X', async () => {
      const root = await freshRoot('stop');
      const got: string[] = [];
      const sub = subscribeBusEvents(
        root,
        'ch1',
        (e) => got.push(e.text),
        { intervalMs: 50 },
      );
      await wait(100);
      sub.stop();
      await publishBusEvent(root, {
        type: 'channel-msg',
        channelId: 'ch1',
        source: 'discord',
        text: 'post-stop',
      });
      await wait(150);
      expect(got).not.toContain('post-stop');
    });
  });
});
