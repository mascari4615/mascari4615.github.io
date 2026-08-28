/**
 * 방 — 서버 없이 둘 이상을 붙이는 **한 자리** (TASK-KL-264)
 *
 * 지금까지 이 일을 하는 코드가 네 곳에 흩어져 있었다: 오락실(`arcade/net.ts`), 번개 대결
 * (`tools/duel.ts` 안에 통째로), 이상형 월드컵, 같이 쓰기. 같은 것을 네 번 적으면 **네 곳이
 * 서로 다른 함정에 걸린다** — 실제로 그랬다:
 *
 *  - 방 이름을 `#` 뒤에 달면 셸이 화면 이름으로 덮어써서 링크가 죽는다(오락실에서 실측).
 *    번개 대결은 도구 상세 페이지에서만 열려 그 함정을 아직 안 밟았을 뿐이다.
 *  - 방 코드에 `0`·`O`·`1`·`I` 가 섞이면 사람이 불러 주다 틀린다.
 *  - 「누가 판을 돌리나」를 아무렇게나 정하면 양쪽이 서로 자기가 주인인 줄 안다.
 *
 * 그래서 **여기 한 곳**에 모은다: 방 코드 규칙 · 초대 링크 규칙 · 짝짓기 · 통로(채널) ·
 * 주인 뽑기. 놀이마다 다른 것(무엇을 주고받나)은 각자 `channel()` 로 판다.
 *
 * 우리 쪽에 방도 기록도 남지 않는다 — 짝짓기는 공개망(nostr)을 거치고, 오간 것은 그 방
 * 사람들 사이에서만 흐른다.
 */
import { joinRoom, selfId, type DataPayload } from 'trystero/nostr';
import { toolPage } from './site-base';

/**
 * 짝짓기를 거칠 **중계 목록**. 기본값에 맡기면 앱 이름으로 뽑기 때문에 항상 같은 다섯 곳이
 * 걸리는데, 거기 `relay.damus.io` 가 끼어 있었다 — 오락실 콘솔이 계속 뱉던
 * `rate-limited: you are noting too much` 의 정체다. 짝짓기 신호는 **잠깐 쓰고 버리는
 * 소식**(ephemeral)이라 초당 여러 번 나가는데, 그런 쓰기를 막는 곳이 섞이면 방이 안 붙는다.
 *
 * 아래 다섯은 2026-08-29에 직접 재서 골랐다 — 한 번에 여섯 통을 던져 전부 받아 준 곳만 남겼다.
 * 거른 것: damus(연결 실패·rate limit) · self-determined(rate limit) ·
 * libernet(ephemeral 거부) · nostr.place(작업증명 요구) · froth/openhoofd/angor(연결 실패) ·
 * kojira(`blocked: kind not accepted here` — 놀이마다 종류 번호가 달라 어떤 판은 통째로 막혔다).
 * 다시 안 붙으면 같은 방법으로 재고 이 줄을 갈아라.
 */
const RELAY_URLS = [
  'wss://nos.lol',
  'wss://nostr.data.haus',
  'wss://purplerelay.com',
  'wss://nostr.sathoarder.com',
  'wss://nostr-01.yakihonne.com'
];

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Payload = { [k: string]: Json };

export interface Peer {
  id: string;
  name: string;
}

/** 사람이 불러 주기 쉬운 글자만 — `0·O·1·I` 는 뺀다(전화로 불러 주다 늘 틀린다). */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 방 코드 하나. 다섯 글자면 같은 순간에 겹칠 일이 사실상 없고, 외워서 부를 수 있다. */
export function makeCode(len = 5): string {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return [...buf].map((n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
}

/**
 * 초대 링크. **방 이름은 물음표 뒤에 단다** — `#` 뒤는 셸이 「어느 화면인가」를 적는 자리라,
 * `#r=CODE` 로 열면 그 순간 `#arcade` 로 덮여 사라진다(오락실에서 실측했다).
 */
export function inviteLink(toolPath: string, code: string): string {
  const path = toolPath.startsWith('/') ? toolPath : toolPage(toolPath);
  return `${location.origin}${path}?r=${code}`;
}

/**
 * 주소에서 방 코드를 읽는다. 물음표 뒤가 정본이고, `#r=` 는 **옛 링크만** 위해 같이 본다
 * (번개 대결이 그렇게 뿌린 링크가 아직 돌아다닌다).
 */
export function codeFromUrl(): string | null {
  const q = new URLSearchParams(location.search).get('r');
  if (q) return q.trim().toUpperCase();
  const m = location.hash.match(/[#&]r=([^&]+)/);
  return m ? decodeURIComponent(m[1]).trim() : null;
}

export interface Channel<T> {
  send(data: T, target?: string): void;
}

export interface Room {
  readonly selfId: string;
  /** 이 창이 판을 돌리는 쪽인가 */
  readonly host: boolean;
  readonly code: string;
  /** 지금 방에 있는 사람들 (나 빼고) */
  peers(): Peer[];
  /** 주고받을 통로 하나. 이름은 12글자 안쪽(트리스테로 제한). */
  channel<T extends DataPayload>(name: string, onMessage?: (data: T, peerId: string) => void): Channel<T>;
  /**
   * 내 이름이 바뀌었다고 방 사람들에게 알린다.
   *
   * ★ 왜 필요한가 (2026-08-14): 이름은 방에 들어갈 때 **한 번만** 갔다. 그래서 링크로 들어온
   *   사람이 그 뒤에 이름을 적으면 **상대 화면에는 영영 「누군가」**였다. 사람은 보통
   *   들어가고 나서 이름을 적는다 — 그 순서가 정상인데 안 됐다(`test:duel` 이 몇 달간
   *   빨간 채로 그 사실을 적고 있었는데 아무도 그 검사를 안 돌렸다).
   */
  rename(name: string): void;
  leave(): void;
}

export interface RoomOptions {
  /** 놀이마다 다른 값 — 다른 놀이의 방과 섞이지 않게 한다 */
  appId: string;
  code: string;
  host: boolean;
  /** 남에게 보일 이름. 이름을 안 보여 주는 놀이는 안 줘도 된다. */
  name?: string;
  /** 사람이 들고 날 때 */
  onPeers?(peers: Peer[]): void;
}

/**
 * 방에 든다. 이름 알리기(`hello`)는 여기서 자동으로 한다 — 네 곳이 각자 적던 것이고,
 * 각자 적으면 「이름이 안 뜨는 창」이 하나씩 생긴다.
 */
export function openRoom(opts: RoomOptions): Room {
  const room = joinRoom({ appId: opts.appId, relayConfig: { urls: RELAY_URLS } }, opts.code);
  const names = new Map<string, string>();
  const list = (): Peer[] => [...names].map(([id, name]) => ({ id, name }));

  const hello = room.makeAction<{ name: string }>('hello', {
    onMessage: (data, { peerId }) => {
      names.set(peerId, String(data?.name || '누군가').slice(0, 12));
      opts.onPeers?.(list());
    }
  });

  /* 내 이름은 바뀔 수 있다 — 들어온 뒤에 적는 것이 오히려 보통이다. */
  let myName = opts.name || '누군가';

  /* 새로 온 사람에게 곧장 내 이름을 건다 — 통째로 뿌리면 이미 아는 사람에게도 다시 간다. */
  room.onPeerJoin = (peerId: string): void => {
    hello.send({ name: myName }, { target: peerId });
  };
  room.onPeerLeave = (peerId: string): void => {
    names.delete(peerId);
    opts.onPeers?.(list());
  };

  return {
    selfId,
    host: opts.host,
    code: opts.code,
    peers: list,
    channel<T extends DataPayload>(name: string, onMessage?: (data: T, peerId: string) => void): Channel<T> {
      const act = room.makeAction<T>(name, {
        onMessage: (data, { peerId }) => onMessage?.(data, peerId)
      });
      return {
        send: (data, target) => act.send(data, target ? { target } : undefined)
      };
    },
    rename(name: string) {
      const next = String(name || '').slice(0, 12);
      if (!next || next === myName) return;
      myName = next;
      /* 이번에는 **모두에게** 보낸다 — 바뀐 사실은 이미 아는 사람도 알아야 한다. */
      hello.send({ name: myName });
    },
    leave() {
      try {
        room.leave();
      } catch {
        /* 이미 닫혔으면 그만 */
      }
    }
  };
}

export interface QuickMatch {
  cancel(): void;
}

/**
 * 아무나와 붙기. 다들 같은 대기방에 들어가 있다가 둘이 만나면 **둘만의 방 이름을 서로 계산해**
 * 옮겨 간다 — 그 이름을 누가 정해서 알려 주는 게 아니라 양쪽이 같은 값을 낸다(주고받다 어긋날
 * 자리가 없어진다). 주인도 같은 방법으로 뽑는다: **번호가 앞선 쪽**.
 */
export function quickMatch(
  appId: string,
  onPaired: (code: string, host: boolean) => void
): QuickMatch {
  const lobby = joinRoom({ appId, relayConfig: { urls: RELAY_URLS } }, 'lobby');
  let paired = false;
  lobby.onPeerJoin = (peerId: string): void => {
    if (paired) return;
    paired = true;
    const code = 'p' + [selfId, peerId].sort().join('').replace(/[^A-Za-z0-9]/g, '').slice(0, 24);
    void lobby.leave();
    onPaired(code, selfId < peerId);
  };
  return {
    cancel: () => {
      paired = true;
      try {
        void lobby.leave();
      } catch {
        /* 이미 닫혔으면 그만 */
      }
    }
  };
}
