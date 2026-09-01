/**
 * 명령에서 카드까지 한 줄로 (사용자 2026-09-01: 디코도 검사되나)
 *
 * 조각별 검사는 있었는데 **이어 붙인 것을 잰 적이 없었다.** 그래서 이 검사는
 * `/오락실` 을 진짜 핸들러로 부르고, 진짜 방 라우트에 진짜 POST 를 쏘고,
 * 그 결과로 글이 고쳐졌는지까지
 *
 * 가짜인 것은 디스코드뿐. 상호작용과 채널과 글을 흉내 냄
 * 진짜 디스코드가 있어야만 아는 것 둘은 여기서 못 잡음
 *  - 카드가 눈에 어떻게 보이나
 *  - 권한이 실제로 글 고치기를 허락하나
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { handleArcade, loadGames } from './slash/arcade';
import { registerArcadeRooms, resetRooms } from './arcade-rooms';
import { registerArcadeResult, resetResults } from './arcade-result';
import { moveCard, cardOf, resetInvites } from './arcade-invite';
import { wasOpen } from './arcade-rooms';

interface Payload {
  content?: string;
  embeds?: Array<{ toJSON: () => { title?: string; description?: string } }>;
  components?: Array<{ toJSON: () => { components: Array<{ label?: string; url?: string }> } }>;
}

/* 보낸 것과 고친 것을 다 적어 두는 가짜 디스코드 */
let sent: Payload | null = null;
const edits: Payload[] = [];

const message = {
  id: 'msg-1',
  channelId: 'chan-1',
  edit: async (p: Payload): Promise<void> => {
    edits.push(p);
  }
};

const client = {
  channels: {
    fetch: async (): Promise<unknown> => ({
      isTextBased: () => true,
      isSendable: () => true,
      messages: { fetch: async (): Promise<unknown> => message },
      send: async (): Promise<unknown> => message
    })
  }
} as never;

/** `/오락실 <놀이> [@상대]` 를 친 척 */
function fakeInteraction(game: string, foe?: string): never {
  return {
    options: {
      getString: (name: string): string | null => (name === '놀이' ? game : null),
      getUser: (name: string): { toString: () => string } | null =>
        name === '상대' && foe ? { toString: () => `<@${foe}>` } : null
    },
    reply: async (p: Payload): Promise<void> => {
      sent = p;
    },
    fetchReply: async (): Promise<unknown> => message
  } as never;
}

const labels = (p: Payload | null): string[] =>
  (p?.components ?? []).flatMap((row) => row.toJSON().components.map((c) => String(c.label ?? '')));
const embedText = (p: Payload | null): string =>
  (p?.embeds ?? []).map((e) => `${e.toJSON().title ?? ''} ${e.toJSON().description ?? ''}`).join(' ');

let server: Server;
let base = '';

beforeAll(async () => {
  const app = express();
  registerArcadeRooms(
    app,
    (code) => void moveCard(client, code, 'done', '방 닫힘'),
    (room) => {
      if (room.playing) void moveCard(client, room.code, 'playing', `${room.seats}명`);
    }
  );
  registerArcadeResult(app, client, wasOpen);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

beforeEach(() => {
  sent = null;
  edits.length = 0;
  resetRooms();
  resetResults();
  resetInvites();
});

const beat = async (code: string, patch: Record<string, unknown> = {}): Promise<void> => {
  await fetch(`${base}/kl/arcade/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, game: 'gomoku', host: '주인', ...patch })
  });
};

/** 이 판에서 방 코드를 알아내는 유일한 길은 카드에 적힌 글 */
const codeFrom = (p: Payload | null): string => {
  const m = /`([A-Z0-9]{4,12})`/.exec(embedText(p));
  if (!m) throw new Error('카드에 방 코드가 없다: ' + embedText(p));
  return m[1];
};

describe('명령에서 카드까지', () => {
  /* 검사에서는 i18n 묶음 자리가 안 잡힐 수 있다(빌드 전 소스로 도는 탓).
     그때는 이름이 오락실이 된다. 이름이 아니라 이음매를 재는 검사라 그래도 뜻이 산다 */
  const expected = loadGames().find((g) => g.id === 'gomoku')?.name ?? '오락실';

  it('명령을 치면 카드와 들어가기 버튼이 나온다', async () => {
    await handleArcade(fakeInteraction('gomoku'));
    expect(embedText(sent)).toContain(expected);
    expect(labels(sent)).toEqual(['들어가기']);
    expect(cardOf(codeFrom(sent))?.stage).toBe('waiting');
  });

  it('상대를 고르면 그 사람을 부른다. 멘션은 글 본문에 (카드 안이면 알림이 안 감)', async () => {
    await handleArcade(fakeInteraction('gomoku', '42'));
    expect(sent?.content).toContain('<@42>');
  });

  it('대국이 시작되면 그 글이 구경하기로 바뀐다', async () => {
    await handleArcade(fakeInteraction('gomoku'));
    const code = codeFrom(sent);
    await beat(code, { seats: 2, playing: true });
    expect(edits).toHaveLength(1);
    expect(embedText(edits[0])).toContain('두는 중');
    expect(embedText(edits[0])).toContain('2명');
    expect(labels(edits[0])).toEqual(['구경하기']);
  });

  it('안 바뀐 알림으로는 글을 안 고친다. 1분마다 오는 것이라 도배가 된다', async () => {
    await handleArcade(fakeInteraction('gomoku'));
    const code = codeFrom(sent);
    await beat(code, { seats: 2, playing: true });
    await beat(code, { seats: 2, playing: true });
    expect(edits).toHaveLength(1);
  });

  it('방을 내리면 방 닫힘으로 바뀌고 버튼이 사라진다', async () => {
    await handleArcade(fakeInteraction('gomoku'));
    const code = codeFrom(sent);
    await beat(code);
    await fetch(`${base}/kl/arcade/rooms/${code}`, { method: 'DELETE' });
    expect(embedText(edits.at(-1) ?? null)).toContain('방 닫힘');
    expect(labels(edits.at(-1) ?? null)).toEqual([]);
  });

  it('대국이 끝나면 그 결과가 카드에 적힌다', async () => {
    await handleArcade(fakeInteraction('gomoku'));
    const code = codeFrom(sent);
    await beat(code, { seats: 2, playing: true });
    await fetch(`${base}/kl/arcade/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        game: 'gomoku',
        seats: [{ name: '주인', score: 1 }, { name: '손님', score: 0 }]
      })
    });
    expect(embedText(edits.at(-1) ?? null)).toContain('주인 이겼다');
  });

  it('끝난 대국은 방 닫힘으로 되돌아가지 않는다', async () => {
    await handleArcade(fakeInteraction('gomoku'));
    const code = codeFrom(sent);
    await beat(code, { seats: 2, playing: true });
    await fetch(`${base}/kl/arcade/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, game: 'gomoku', seats: [{ name: '주인', score: 1 }] })
    });
    const after = edits.length;
    await fetch(`${base}/kl/arcade/rooms/${code}`, { method: 'DELETE' });
    expect(edits).toHaveLength(after);
  });
});
