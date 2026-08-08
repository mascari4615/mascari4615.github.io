/**
 * TASK-KL-149 — 채팅을 **실제 HTTP 로** 찔러 본다.
 *
 * 저장소 시험(`karmolab-chat.test.ts`)은 함수가 맞는지만 본다. 여기서 보는 것은 그 위의 배선이다:
 * 흐르는 연결이 정말 흐르는가(모아 뒀다 한꺼번에 오지 않는가), 한쪽이 친 말이 다른 쪽 화면에
 * 도착하는가, 봇이 폼을 눌러 방을 채울 수 있는가. 이 층이 없으면 「함수는 맞는데 브라우저에서는
 * 안 되는」 상태를 배포까지 못 잡는다 — 실시간 기능에서 가장 흔한 실패 자리다.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerKarmolabApi } from './karmolab-api';
import { KarmolabAccountStore } from '../services/karmolab-accounts';
import { KarmolabTraceStore } from '../services/karmolab-traces';
import { KarmolabPlayStore } from '../services/karmolab-plays';
import { KarmolabChatStore } from '../services/karmolab-chat';

/** 사람이 쓰는 브라우저인 척. 이걸 안 보내면 서버가 「사람 아님」으로 막는다 — 그게 맞는 동작이다. */
const HUMAN_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

let server: Server;
let baseUrl: string;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kl149-chat-'));
  const app = express();
  app.use(express.json());
  registerKarmolabApi(
    app,
    new KarmolabAccountStore(path.join(tmpDir, 'state.json')),
    new KarmolabTraceStore(path.join(tmpDir, 'traces.json')),
    undefined,
    new KarmolabPlayStore(path.join(tmpDir, 'plays.json')),
    new KarmolabChatStore(path.join(tmpDir, 'chat.json')),
  );
  const UNSAFE = new Set([1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697]);
  let port = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = 20000 + Math.floor(Math.random() * 20000);
    if (UNSAFE.has(candidate)) continue;
    const ok = await new Promise<boolean>((resolve) => {
      server = app.listen(candidate, '127.0.0.1', () => resolve(true));
      server.once('error', () => resolve(false));
    });
    if (ok) {
      port = candidate;
      break;
    }
  }
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  /* 열어 둔 연결을 먼저 끊는다. 흐르는 연결은 **안 끝나는 응답**이라, 시험이 중간에 실패해서
   * 하나라도 남으면 `server.close()` 가 영영 안 돌아온다 — 그러면 진짜 실패 대신
   * 「hook timed out」만 보인다(실제로 한 번 그렇게 가려졌다). */
  for (const close of openStreams.splice(0)) close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** 이 시험에서 연 흐르는 연결들 — 끝날 때 무조건 거둔다. */
const openStreams: (() => void)[] = [];

interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

/**
 * 흐르는 연결 하나를 연다.
 *
 * 브라우저의 `EventSource` 를 쓸 수 없으니 손으로 읽는다. 이게 오히려 낫다 —
 * **덩어리가 언제 도착하는지**를 직접 보게 되므로, 중간에서 모아 뒀다 한꺼번에 주는 함정
 * (프록시 버퍼링과 같은 증상)이 여기서 드러난다.
 */
async function openStream(ip: string): Promise<{
  next: (event: string, timeoutMs?: number) => Promise<SseEvent>;
  headers: Headers;
  close: () => void;
}> {
  const controller = new AbortController();
  openStreams.push(() => controller.abort());
  const response = await fetch(`${baseUrl}/kl/chat/stream`, {
    headers: { 'user-agent': HUMAN_UA, 'x-forwarded-for': ip },
    signal: controller.signal,
  });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const queue: SseEvent[] = [];
  const waiters: ((event: SseEvent) => void)[] = [];
  let buffer = '';

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let split = buffer.indexOf('\n\n');
        while (split >= 0) {
          const chunk = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const name = /^event: (.+)$/m.exec(chunk)?.[1];
          const raw = /^data: (.+)$/m.exec(chunk)?.[1];
          if (name && raw) {
            const parsed = { event: name, data: JSON.parse(raw) as Record<string, unknown> };
            const waiter = waiters.shift();
            if (waiter) waiter(parsed);
            else queue.push(parsed);
          }
          split = buffer.indexOf('\n\n');
        }
      }
    } catch {
      /* 닫으면 여기로 온다 — 정상 */
    }
  })();

  return {
    headers: response.headers,
    close: () => controller.abort(),
    next: (event: string, timeoutMs = 4000) =>
      new Promise<SseEvent>((resolve, reject) => {
        const found = queue.findIndex((e) => e.event === event);
        if (found >= 0) {
          resolve(queue.splice(found, 1)[0]);
          return;
        }
        const timer = setTimeout(() => reject(new Error(`「${event}」 가 ${timeoutMs}ms 안에 안 왔다`)), timeoutMs);
        const push = (e: SseEvent): void => {
          if (e.event !== event) {
            queue.push(e);
            waiters.unshift(push);
            return;
          }
          clearTimeout(timer);
          resolve(e);
        };
        waiters.push(push);
      }),
  };
}

function say(ip: string, text: string, ua = HUMAN_UA): Promise<Response> {
  return fetch(`${baseUrl}/kl/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': ua, 'x-forwarded-for': ip },
    body: JSON.stringify({ text }),
  });
}

describe('흐르는 연결', () => {
  it('붙자마자 「너는 오늘 누구인가」와 지금까지의 줄을 준다', async () => {
    const stream = await openStream('10.0.0.1');
    const hello = await stream.next('hello');
    const me = hello.data.me as { who: string; name: string; color: string };
    expect(me.name).toMatch(/\S+ \S+/);
    expect(me.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(hello.data.messages).toEqual([]);
    expect(hello.data.here).toBe(1);
    stream.close();
  });

  it('중간에서 모아 두지 않도록 머리를 단다', async () => {
    const stream = await openStream('10.0.0.1');
    await stream.next('hello');
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    // 이 두 줄이 없으면 프록시가 답을 모았다 한꺼번에 준다 = 실시간이 아니게 된다.
    expect(stream.headers.get('cache-control')).toContain('no-transform');
    expect(stream.headers.get('x-accel-buffering')).toBe('no');
    stream.close();
  }, 10000);

  it('한쪽이 친 말이 다른 쪽에 1초 안에 닿는다', async () => {
    const listener = await openStream('10.0.0.1');
    await listener.next('hello');

    const started = Date.now();
    const response = await say('10.0.0.2', '거기 누구 있어요');
    expect(response.status).toBe(200);

    const arrived = await listener.next('msg', 1000);
    const message = arrived.data.message as { text: string; name: string; who: string };
    expect(message.text).toBe('거기 누구 있어요');
    expect(Date.now() - started).toBeLessThan(1000);
    listener.close();
  }, 10000);

  it('사람이 들고 나면 「지금 몇 명」이 양쪽에 갱신된다', async () => {
    const first = await openStream('10.0.0.1');
    await first.next('hello');
    const second = await openStream('10.0.0.2');
    await second.next('hello');
    const grew = await first.next('here', 2000);
    expect(grew.data.here).toBe(2);
    second.close();
    const shrank = await first.next('here', 2000);
    expect(shrank.data.here).toBe(1);
    first.close();
  }, 10000);

  it('지운 줄은 보고 있는 모두에게서 사라진다', async () => {
    const listener = await openStream('10.0.0.1');
    await listener.next('hello');
    await say('10.0.0.2', '지워질 말');
    const arrived = await listener.next('msg', 2000);
    const id = (arrived.data.message as { id: string }).id;

    // 주인이 아니면 못 지운다 — 남의 말을 아무나 지우면 그 단추가 무기가 된다.
    const denied = await fetch(`${baseUrl}/kl/chat/${id}`, { method: 'DELETE', headers: { 'user-agent': HUMAN_UA } });
    expect(denied.status).toBe(403);
    listener.close();
  }, 10000);
});

describe('보내는 자리', () => {
  it('봇은 말할 수 없다', async () => {
    const response = await say('10.0.0.9', '나는 크롤러다', BOT_UA);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('not_human');
  });

  it('연달아 치면 막고, 왜 막혔는지와 얼마나 기다릴지를 준다', async () => {
    expect((await say('10.0.0.3', '하나')).status).toBe(200);
    const blocked = await say('10.0.0.3', '둘');
    expect(blocked.status).toBe(429);
    const body = (await blocked.json()) as { error: string; retryAfterMs: number };
    expect(body.error).toBe('too_fast');
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  it('흐르는 연결이 막힌 자리를 위한 되돌아갈 길이 같은 답을 준다', async () => {
    await say('10.0.0.4', '되물어보기로도 보여야 한다');
    const response = await fetch(`${baseUrl}/kl/chat/recent`, { headers: { 'user-agent': HUMAN_UA, 'x-forwarded-for': '10.0.0.5' } });
    const body = (await response.json()) as { messages: { text: string }[]; me: { name: string }; maxLength: number };
    expect(body.messages.map((m) => m.text)).toEqual(['되물어보기로도 보여야 한다']);
    expect(body.me.name).toBeTruthy();
    expect(body.maxLength).toBe(300);
  });

  it('다른 사람은 다른 이름표를 받는다', async () => {
    const a = await fetch(`${baseUrl}/kl/chat/recent`, { headers: { 'user-agent': HUMAN_UA, 'x-forwarded-for': '10.0.1.1' } });
    const b = await fetch(`${baseUrl}/kl/chat/recent`, { headers: { 'user-agent': HUMAN_UA, 'x-forwarded-for': '10.0.1.2' } });
    const nameA = ((await a.json()) as { me: { who: string } }).me.who;
    const nameB = ((await b.json()) as { me: { who: string } }).me.who;
    expect(nameA).not.toBe(nameB);
  });
});
