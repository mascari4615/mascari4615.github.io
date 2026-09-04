/**
 * 온라인 방 한 번의 상태 (연결, 참가자, 자리표, 공개 목록)
 *
 * `net.ts` 가 아닌 여기 두는 까닭: 로비가 늘 드는 상태인데 `net.ts` 를 값으로 들여오면
 * P2P(trystero) 55KB 동반. 그 55KB 는 방을 열 때만 (`net-loader.ts`)
 * `net.ts` 는 **타입으로만**. 값 import 한 줄이면 도로 붙음
 * 지키는 검사: `test:arcade` 의 "로비 묶음에 P2P 없음"
 */
import type { Net } from './net';
import type { Peer } from '../../lib/room';

interface RoomListing {
  stop(): void;
  poke(): void;
}

/** 온라인 방 한 번의 연결, 참가자, 자리표와 공개 목록을 함께 지킨다. */
export class OnlineRun {
  connection: Net | null = null;
  peers: Peer[] = [];
  seatOf: Record<string, number> = {};
  listing: RoomListing | null = null;

  leave(): void {
    this.connection?.leave();
    this.connection = null;
    this.peers = [];
    this.seatOf = {};
  }

  closeListing(): void {
    this.listing?.stop();
    this.listing = null;
  }

  reset(): void {
    this.closeListing();
    this.leave();
  }
}
