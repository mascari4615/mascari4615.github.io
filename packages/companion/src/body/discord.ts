import type { Body, Sensation, Sense, Utterance, Voice } from '../types';

/**
 * 디스코드 몸 — **관객이 있는 자리.**
 *
 * 사용자 결정(2026-08-08): 무대는 곁의 존재(1:1) **와** 관객 앞, 둘 다. 그러면 구조가
 * 강제된다 — 코어 하나에 몸 여럿. 이 프로토타입이 처음부터 증명하려던 명제(「몸을 늘려도
 * `core.ts` 는 안 바뀐다」)를 실제로 증명하는 자리가 여기다.
 *
 * 데스크톱 몸과 다른 점은 하나다: **사람이 여럿이다.** 그래서 들어오는 말마다 누가 했는지
 * 붙인다(`Sensation.누가`, b060d43f 에서 코어에 박은 자리). 그게 없으면 대화록이 한 사람의
 * 독백이 되고 이름을 부를 수도 없다.
 *
 * **접속하는 물건을 밖에서 받는다.** 토큰은 이 기계에 없다(prod 는 노트북, 열쇠는 저장소
 * 비밀). 몸 안에 discord.js 를 박아 두면 토큰이 있는 자리에서만 시험할 수 있게 되는데,
 * 그건 「접속이 되나」와 「몸이 제대로 붙나」를 영영 못 가른다는 뜻이다. 그래서 붙는 물건은
 * 갈아끼우는 자리로 두고, 가짜로 전 경로를 시험한다.
 */
export interface 디스코드채널 {
  /** 이 채널에 한 마디 보낸다. */
  보내기: (글: string) => Promise<void>;
}

export interface 디스코드붙이기 {
  /** 사람이 말할 때마다 부른다. 봇 자신의 말은 넘기지 않는다. */
  들어올때: (듣기: (말: { 글: string; 누가: string; 채널: string; 봇인가: boolean }) => void) => void;
  /** 이 채널을 잡는다. 없으면 null. */
  채널잡기: (채널: string) => 디스코드채널 | null;
  /** 끊는다. */
  끊기?: () => void | Promise<void>;
}

export interface DiscordBodyOptions {
  /** 붙는 물건. 밖에서 준다 — 토큰이 없는 자리에서도 몸을 시험할 수 있게. */
  붙이기: 디스코드붙이기;
  /**
   * 여기서만 듣는다. 안 주면 들어오는 모든 채널.
   *
   * 아무 데나 듣게 두면 남의 방에서 갑자기 끼어든다 — 관객이 있는 자리일수록 **어디서
   * 듣는지**가 분명해야 한다.
   */
  채널들?: readonly string[];
  /** 이 통로 이름으로 감각이 들어온다. */
  channel?: string;
  log?: (message: string) => void;
}

/**
 * 몸 하나 = 감각 + 목소리 한 쌍.
 *
 * 말이 나갈 채널은 **마지막으로 들어온 말의 채널**이다. 여러 방에서 말이 오가는데 한 방에만
 * 답하면 딴 데 대고 말하는 꼴이 된다.
 */
export function discordBody(options: DiscordBodyOptions): Body {
  const channel = options.channel ?? 'discord';
  const log = options.log ?? (() => {});
  const 들을곳 = options.채널들 === undefined ? null : new Set(options.채널들);
  let 마지막채널: string | null = null;

  const sense: Sense = {
    name: `${channel}:sense`,
    start(emit: (sensation: Sensation) => void) {
      options.붙이기.들어올때((말) => {
        // 제 말에 제가 답하면 끝없이 돈다 — 봇 글은 아예 안 듣는다.
        if (말.봇인가) return;
        if (들을곳 !== null && 들을곳.has(말.채널) === false) return;
        const 글 = 말.글.trim();
        if (글 === '') return;
        마지막채널 = 말.채널;
        emit({ channel, kind: 'text', text: 글, at: Date.now(), 누가: 말.누가 });
      });
      log(`디스코드 몸이 듣기 시작했다${들을곳 === null ? '' : ` (${[...들을곳].join(', ')})`}`);
    },
    async stop() {
      await options.붙이기.끊기?.();
    },
  };

  const voice: Voice = {
    name: `${channel}:voice`,
    async speak(utterance: Utterance) {
      const 글 = utterance.text.trim();
      if (글 === '') return;
      if (마지막채널 === null) {
        // 아직 아무 말도 안 들어왔는데 말이 나가려 한다 — 어디로 보낼지 모른다.
        log('어디로 보낼지 몰라서 못 보냈다 (아직 들어온 말이 없다)');
        return;
      }
      const 방 = options.붙이기.채널잡기(마지막채널);
      if (방 === null) {
        log(`채널을 못 잡았다: ${마지막채널}`);
        return;
      }
      try {
        await 방.보내기(글);
      } catch (e) {
        // 한 마디 못 보냈다고 얘가 죽으면 안 된다.
        log(`못 보냈다: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  };

  return { name: channel, sense, voice };
}

/**
 * 진짜 discord.js 로 붙는 자리.
 *
 * 이 함수만 토큰을 필요로 한다 — 나머지(몸·코어)는 토큰 없이 전부 시험된다. 라이브러리는
 * 부를 때 불러온다: 디스코드를 안 쓰는 자리에서 얘가 그것 때문에 못 뜨면 안 된다.
 */
export async function discordJs(options: {
  token: string;
  log?: (message: string) => void;
}): Promise<디스코드붙이기> {
  const log = options.log ?? (() => {});
  /* 이름을 변수에 담아 부른다 — 이 패키지는 discord.js 를 **필수 의존성으로 안 갖는다.**
     디스코드를 안 쓰는 자리(대부분)에서 그것 때문에 빌드가 막히면 안 된다. 없으면 이
     함수만 실패하고, 몸·코어는 그대로 돈다. */
  const 라이브러리 = 'discord.js';
  const { Client, GatewayIntentBits, Partials } = (await import(라이브러리)) as unknown as {
    Client: new (o: unknown) => {
      on: (e: string, f: (...a: unknown[]) => void) => void;
      login: (t: string) => Promise<unknown>;
      destroy: () => Promise<void>;
      channels: { cache: { get: (id: string) => { send?: (s: string) => Promise<unknown> } | undefined } };
    };
    GatewayIntentBits: Record<string, number>;
    Partials: Record<string, number>;
  };

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  await client.login(options.token);
  log('디스코드에 붙었다');

  return {
    들어올때(듣기) {
      client.on('messageCreate', (...a: unknown[]) => {
        const m = a[0] as {
          content?: string;
          author?: { bot?: boolean; username?: string; displayName?: string };
          channelId?: string;
        };
        듣기({
          글: m.content ?? '',
          // 보이는 이름이 있으면 그걸 쓴다 — 대화록에 적힐 이름이다.
          누가: m.author?.displayName ?? m.author?.username ?? '누군가',
          채널: m.channelId ?? '',
          봇인가: m.author?.bot === true,
        });
      });
    },
    채널잡기(채널) {
      const c = client.channels.cache.get(채널);
      if (c === undefined || typeof c.send !== 'function') return null;
      return { 보내기: async (글) => { await c.send?.(글); } };
    },
    async 끊기() {
      await client.destroy();
    },
  };
}
