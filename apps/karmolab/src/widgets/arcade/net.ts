/**
 * 방 — 서버 없이 여럿 (TASK-KL-242)
 *
 * 우리 쪽에 방도 기록도 남지 않는다. 짝짓기는 공개망을 거쳐 붙고(트리스테로), 오간 것은
 * 그 방 사람들 사이에서만 흐른다.
 *
 * 판정은 **방을 만든 쪽 하나**가 맡는다. 커널을 각자 돌리면 봇의 주사위도 제한시간의 끝도
 * 창마다 달라져 승부가 안 갈린다(번개 대결에서 겪었다). 그래서:
 *  - 손님은 **수만 보낸다** (`act`)
 *  - 주인은 커널에 넣고 **판 전체를 보낸다** (`sync`)
 *
 * 마음먹으면 주인은 속일 수 있다. 순위표가 없으니 속일 값도 없다 — 캐주얼 놀이라 감수한다.
 *
 * 이 파일은 커널을 모르고 커널도 이 파일을 모른다. 둘을 붙이는 곳은 위젯 한 군데다 —
 * 그래야 커널을 창 없이 테스트할 수 있다.
 */
import { joinRoom, selfId } from 'trystero/nostr';

const APP_ID = 'karmolab-arcade';

/**
 * 그물망을 건너는 것은 **JSON 이 될 수 있는 값**뿐이다 — 함수도 클래스도 Map 도 못 건넌다.
 * 커널의 상태를 그대로 흘려보내려면 게임의 상태도 이 모양이어야 한다(그래서 판은 배열·수·글자로 짠다).
 */
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Payload = { [k: string]: Json };

export interface Peer {
  id: string;
  name: string;
}

/** 지금 방에 있는 사람들 — 자리마다 다른 판을 보낼 때 쓴다. */
export type PeerId = string;

export interface NetHooks {
  /** 사람이 들고 남 — 주인 쪽이 자리를 다시 짠다 */
  onPeers(peers: Peer[]): void;
  /** 손님이 보낸 수 (주인만 받는다) */
  onAct(peerId: string, action: Payload): void;
  /** 주인이 보낸 판 (손님만 받는다) */
  onSync(payload: Payload): void;
}

export interface Net {
  readonly selfId: string;
  readonly host: boolean;
  act(action: Payload): void;
  /** 받는 사람을 정하면 그 사람에게만 간다 — 감춘 것이 있는 게임은 자리마다 다른 판을 받는다. */
  sync(payload: Payload, target?: string): void;
  leave(): void;
}

export function connect(roomId: string, host: boolean, myName: string, hooks: NetHooks): Net {
  const room = joinRoom({ appId: APP_ID }, roomId);
  const names = new Map<string, string>();
  const announce = (): void =>
    hooks.onPeers([...names].map(([id, name]) => ({ id, name })));

  /* 받는 자리를 만들 때 보내는 자리도 같이 생긴다 (트리스테로 0.25 부터 이 모양). */
  const hello = room.makeAction<{ name: string }>('hello', {
    onMessage: (data, { peerId }) => {
      names.set(peerId, String(data?.name || '누군가').slice(0, 12));
      announce();
    }
  });

  const actAction = room.makeAction<Payload>('act', {
    onMessage: (data, { peerId }) => {
      if (host) hooks.onAct(peerId, data);
    }
  });

  const syncAction = room.makeAction<Payload>('sync', {
    onMessage: (data) => {
      if (!host) hooks.onSync(data);
    }
  });

  /* 새로 온 사람에게 곧장 내 이름을 건다 — 통째로 뿌리면 이미 아는 사람에게도 다시 간다. */
  room.onPeerJoin = (peerId: string): void => {
    hello.send({ name: myName }, { target: peerId });
  };

  room.onPeerLeave = (peerId: string): void => {
    names.delete(peerId);
    announce();
  };

  return {
    selfId,
    host,
    act: (action) => {
      if (!host) actAction.send(action);
    },
    sync: (payload, target) => {
      if (host) syncAction.send(payload, target ? { target } : undefined);
    },
    leave: () => {
      try {
        room.leave();
      } catch {
        /* 이미 닫혔으면 그만 */
      }
    }
  };
}
