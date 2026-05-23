// chat-adapter unit smoke (TASK-KAR-110 Phase 2).
// 실행: cd apps/discord-bots/apps/yawnbot && npx tsx --test src/bot/chat-adapter.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectKind, buildPayload, createAdapter, richToDiscordWebhook, richToSlackBlocks, richToPlainText, buildRichPayload } from './chat-adapter';

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

const sampleRich = {
  title: 'WM build GREEN',
  body: 'PR #172 merged',
  fields: [{ name: 'tests', value: '42/42 PASS' }],
  level: 'info' as const,
  url: 'https://example.com/run/1',
  footer: 'agent-cadence-worker',
};

test('richToDiscordWebhook: embed', () => {
  const out = richToDiscordWebhook(sampleRich) as { embeds: Array<{ title: string; color: number }> };
  assert.equal(out.embeds[0].title, 'WM build GREEN');
  assert.equal(out.embeds[0].color, 0x4caf50);
});

test('richToSlackBlocks: block kit', () => {
  const out = richToSlackBlocks(sampleRich) as { blocks: Array<{ type: string }> };
  assert.equal(out.blocks[0].type, 'header');
  assert.equal(out.blocks[out.blocks.length - 1].type, 'context');
});

test('richToPlainText: markdown', () => {
  const out = richToPlainText(sampleRich);
  assert.match(out, /\*\*WM build GREEN\*\*/);
  assert.match(out, /\*tests\*: 42\/42 PASS/);
});

test('buildRichPayload: kind 분기', () => {
  assert.ok('embeds' in buildRichPayload('discord', sampleRich));
  assert.ok('blocks' in buildRichPayload('slack', sampleRich));
  assert.ok('text' in buildRichPayload('generic', sampleRich));
});

test('createAdapter.sendRich: kind 별 fetch body', async () => {
  const calls: { body: unknown }[] = [];
  const mockFetch = async (_url: string, init: RequestInit) => {
    calls.push({ body: JSON.parse(init.body as string) });
    return { ok: true, status: 200 };
  };
  await createAdapter('https://discord.com/api/webhooks/1/x', mockFetch).sendRich(sampleRich);
  await createAdapter('https://hooks.slack.com/services/T/B/x', mockFetch).sendRich(sampleRich);
  await createAdapter('https://example.com/hook', mockFetch).sendRich(sampleRich);
  assert.ok('embeds' in (calls[0].body as Record<string, unknown>));
  assert.ok('blocks' in (calls[1].body as Record<string, unknown>));
  assert.ok('text' in (calls[2].body as Record<string, unknown>));
});
