/**
 * 오락실이 방을 쓰는 법 (TASK-KL-242 · 방 엔진 분리 = TASK-KL-264)
 *
 * 방을 여는 일 자체는 이제 `lib/room.ts` 한 곳에 있다(방 코드·초대 링크·짝짓기·통로·주인 뽑기).
 * 여기 남은 것은 **오락실만의 약속** 둘뿐이다:
 *
 *  - 손님은 **수만 보낸다** (`act`)
 *  - 주인은 커널에 넣고 **판 전체를 보낸다** (`sync`) — 감출 것이 있으면 자리마다 따로
 *  - 주인은 **판 밖의 소식**도 보낸다 (`room`) — 「다음 판 고르는 중」 같은 것.
 *    `sync` 로는 못 한다. 판이 없는 동안의 이야기라 보낼 판이 없기 때문이다.
 *
 * 판정은 방을 만든 쪽 하나가 맡는다. 커널을 각자 돌리면 봇의 주사위도 제한시간의 끝도 창마다
 * 달라져 승부가 안 갈린다(번개 대결에서 겪었다).
 *
 * 마음먹으면 주인은 속일 수 있다. 순위표가 없으니 속일 값도 없다 — 캐주얼 놀이라 감수한다.
 *
 * 이 파일은 커널을 모르고 커널도 이 파일을 모른다. 둘을 붙이는 곳은 위젯 한 군데다 —
 * 그래야 커널을 창 없이 테스트할 수 있다.
 */
import { openRoom, type Payload, type Peer } from '../../lib/room';

export type { Json, Payload, Peer } from '../../lib/room';

const APP_ID = 'karmolab-arcade';

export type PeerId = string;

export interface NetHooks {
  /** 사람이 들고 남 — 주인 쪽이 자리를 다시 짠다 */
  onPeers(peers: Peer[]): void;
  /** 손님이 보낸 수 (주인만 받는다) */
  onAct(peerId: string, action: Payload): void;
  /** 주인이 보낸 판 (손님만 받는다) */
  onSync(payload: Payload): void;
  /** 주인이 보낸 판 밖의 소식 (손님만 받는다) */
  onSay(payload: Payload): void;
}

export interface Net {
  readonly selfId: string;
  readonly host: boolean;
  act(action: Payload): void;
  /** 받는 사람을 정하면 그 사람에게만 간다 — 감춘 것이 있는 게임은 자리마다 다른 판을 받는다. */
  sync(payload: Payload, target?: string): void;
  /** 판 밖의 소식 — 판이 없는 동안에도 방은 살아 있다. */
  say(payload: Payload): void;
  leave(): void;
}

export function connect(roomId: string, host: boolean, myName: string, hooks: NetHooks): Net {
  const room = openRoom({
    appId: APP_ID,
    code: roomId,
    host,
    name: myName,
    onPeers: hooks.onPeers
  });

  const actCh = room.channel<Payload>('act', (data, peerId) => {
    if (host) hooks.onAct(peerId, data);
  });
  const syncCh = room.channel<Payload>('sync', (data) => {
    if (!host) hooks.onSync(data);
  });
  const sayCh = room.channel<Payload>('room', (data) => {
    if (!host) hooks.onSay(data);
  });

  return {
    selfId: room.selfId,
    host,
    act: (action) => {
      if (!host) actCh.send(action);
    },
    sync: (payload, target) => {
      if (host) syncCh.send(payload, target);
    },
    say: (payload) => {
      if (host) sayCh.send(payload);
    },
    leave: () => room.leave()
  };
}
