// chat-adapter unit smoke (TASK-KAR-110 Phase 2).
// 실행: cd apps/discord-bots/apps/yawnbot && npx tsx --test src/bot/chat-adapter.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKind, buildPayload, createAdapter } from './chat-adapter';

test('detectKind: Discord/Slack/generic 자동 매핑', () => {
  assert.equal(detectKind('https://discord.com/api/webhooks/1/abc'), 'discord');
  assert.equal(detectKind('https://discordapp.com/api/webhooks/1/abc'), 'discord');
  assert.equal(detectKind('https://hooks.slack.com/services/T/B/x'), 'slack');
  assert.equal(detectKind('https://yawnbot.mascari4615.com/in/x'), 'generic');
});

test('buildPayload: kind 별 schema', () => {
  assert.deepEqual(buildPayload('discord', 'hi'), { content: 'hi' });
  assert.deepEqual(buildPayload('slack', 'hi'), { text: 'hi' });
  assert.deepEqual(buildPayload('generic', 'hi'), { text: 'hi' });
});

test('createAdapter: send 가 kind 별 body 로 fetch 호출', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const mockFetch = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return { ok: true, status: 200 };
  };
  const slack = createAdapter('https://hooks.slack.com/services/T/B/x', mockFetch);
  await slack.send({ text: 'hello slack' });
  assert.deepEqual(calls[0].body, { text: 'hello slack' });

  const discord = createAdapter('https://discord.com/api/webhooks/1/abc', mockFetch);
  await discord.send({ text: 'hello discord' });
  assert.deepEqual(calls[1].body, { content: 'hello discord' });
});
