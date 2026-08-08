/**
 * chat-adapter 단위 smoke (TASK-KAR-110 Phase 2).
 *
 * 원래 `node:test` 로 쓰여 있었다. 그런데 이 패키지의 시험은 vitest 로 돈다 — vitest 는 이
 * 파일에서 스위트를 못 찾아 **매번 「1 파일 실패」로 빨갛게** 떴고, 정작 이 검사들은 아무 데서도
 * 안 돌았다(= 없는 검사인데 경보만 울리는 상태). 전체가 늘 1건 빨가면 진짜 실패가 그 속에 묻힌다.
 * 그래서 vitest 로 옮긴다 — 제외하는 게 아니라 **실제로 돌게** 한다 (TASK-KL-160).
 */
import { test, expect } from 'vitest';
import { detectKind, buildPayload, createAdapter, richToDiscordWebhook, richToSlackBlocks, richToPlainText, buildRichPayload } from './chat-adapter';

test('detectKind: Discord/Slack/generic 자동 매핑', () => {
  expect(detectKind('https://discord.com/api/webhooks/1/abc')).toBe('discord');
  expect(detectKind('https://discordapp.com/api/webhooks/1/abc')).toBe('discord');
  expect(detectKind('https://hooks.slack.com/services/T/B/x')).toBe('slack');
  expect(detectKind('https://yawnbot.mascari4615.com/in/x')).toBe('generic');
});

test('buildPayload: kind 별 schema', () => {
  expect(buildPayload('discord', 'hi')).toEqual({ content: 'hi' });
  expect(buildPayload('slack', 'hi')).toEqual({ text: 'hi' });
  expect(buildPayload('generic', 'hi')).toEqual({ text: 'hi' });
});

test('createAdapter: send 가 kind 별 body 로 fetch 호출', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const mockFetch = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return { ok: true, status: 200 };
  };
  const slack = createAdapter('https://hooks.slack.com/services/T/B/x', mockFetch);
  await slack.send({ text: 'hello slack' });
  expect(calls[0].body).toEqual({ text: 'hello slack' });

  const discord = createAdapter('https://discord.com/api/webhooks/1/abc', mockFetch);
  await discord.send({ text: 'hello discord' });
  expect(calls[1].body).toEqual({ content: 'hello discord' });
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
  expect(out.embeds[0].title).toBe('WM build GREEN');
  expect(out.embeds[0].color).toBe(0x4caf50);
});

test('richToSlackBlocks: block kit', () => {
  const out = richToSlackBlocks(sampleRich) as { blocks: Array<{ type: string }> };
  expect(out.blocks[0].type).toBe('header');
  expect(out.blocks[out.blocks.length - 1].type).toBe('context');
});

test('richToPlainText: markdown', () => {
  const out = richToPlainText(sampleRich);
  expect(out).toMatch(/\*\*WM build GREEN\*\*/);
  expect(out).toMatch(/\*tests\*: 42\/42 PASS/);
});

test('buildRichPayload: kind 분기', () => {
  expect('embeds' in buildRichPayload('discord', sampleRich)).toBe(true);
  expect('blocks' in buildRichPayload('slack', sampleRich)).toBe(true);
  expect('text' in buildRichPayload('generic', sampleRich)).toBe(true);
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
  expect('embeds' in (calls[0].body as Record<string, unknown>)).toBe(true);
  expect('blocks' in (calls[1].body as Record<string, unknown>)).toBe(true);
  expect('text' in (calls[2].body as Record<string, unknown>)).toBe(true);
});
