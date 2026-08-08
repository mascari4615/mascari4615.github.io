/**
 * 같이 쓰기 — 방과 커서 (TASK-KL-180).
 *
 * 이 사이트는 「지금 N명」이라는 **숫자**까지 와 있었다. 그런데 그 N명은 서로를 못 본다 —
 * 같은 도구를 동시에 열고 있어도 각자 혼자 쓰는 화면이다. 숫자는 사람이 있다는 소문이고,
 * 움직이는 커서는 **증거**다.
 *
 * 성질 셋:
 *  ① **아무것도 저장하지 않는다.** 지나간 커서 좌표는 값이 0 이다. 메모리에만 살고 죽는다.
 *  ② 좌표는 **비율(0~1)** — 화면 크기가 달라도 같은 자리를 가리킨다. 픽셀을 보내면
 *     큰 화면의 오른쪽 끝이 작은 화면에서는 화면 밖이 된다.
 *  ③ 조용한 사람은 **자동으로 나간다.** 브라우저는 창을 닫을 때 인사하지 않는 경우가 많아,
 *     「나갔다」를 말이 아니라 침묵으로 판정해야 유령이 안 남는다.
 */

/** 이만큼 조용하면 나간 것으로 본다. 커서는 1초에 여러 번 오므로 넉넉해도 유령이 오래 안 남는다. */
export const IDLE_MS = 30 * 1000;

/** 방 하나에 담을 수 있는 사람 수 — 상한을 두지 않는다(사용자 요구). 다만 한 사람이 창을 수십 개
 *  열어 두는 사고를 막으려고 **같은 방문자 열쇠**당 창 수만 제한한다. */
export const MAX_TABS_PER_VISITOR = 8;

export interface RoomMember {
  /** 이 창 하나를 가리키는 id. 같은 사람이 창을 둘 열면 둘이다(둘 다 보이는 게 맞다). */
  id: string;
  name: string;
  color: string;
  /** 로그인했으면 그 사람의 주소. 없으면 null(익명도 같이 쓸 수 있어야 한다). */
  handle: string | null;
  x: number;
  y: number;
  /** 화면에 커서를 그릴까 — 창 밖으로 나가면 false 로 온다. */
  active: boolean;
  lastSeen: number;
}

export type RoomEvent =
  | { type: 'join'; member: PublicMember }
  | { type: 'move'; id: string; x: number; y: number; active: boolean }
  | { type: 'leave'; id: string };

export type PublicMember = Omit<RoomMember, 'lastSeen'>;

type Listener = (event: RoomEvent) => void;

/** 이름을 색으로 — 같은 사람은 어느 방에서든 같은 색이라 눈이 기억한다. */
export function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue} 70% 62%)`;
}

interface Room {
  members: Map<string, RoomMember>;
  listeners: Set<Listener>;
}

export class KarmolabRoomStore {
  private rooms = new Map<string, Room>();

  private room(roomId: string): Room {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { members: new Map(), listeners: new Set() };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  private emit(roomId: string, event: RoomEvent): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const listener of room.listeners) {
      try {
        listener(event);
      } catch {
        /* 한 창이 죽어도 나머지는 계속 본다 */
      }
    }
  }

  /** 조용한 사람을 내보낸다. 부를 때마다 훑는다 — 방은 작고, 타이머를 하나 더 두는 것보다 싸다. */
  private sweep(roomId: string, now = Date.now()): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const [id, member] of room.members) {
      if (now - member.lastSeen <= IDLE_MS) continue;
      room.members.delete(id);
      this.emit(roomId, { type: 'leave', id });
    }
    if (room.members.size === 0 && room.listeners.size === 0) this.rooms.delete(roomId);
  }

  /** 지금 이 방에 있는 사람들 (조용한 사람은 빼고). */
  members(roomId: string, now = Date.now()): PublicMember[] {
    this.sweep(roomId, now);
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return [...room.members.values()].map(({ lastSeen: _lastSeen, ...rest }) => rest);
  }

  /** 들어온다. 이미 있으면 이름·색만 새로 맞춘다(새로고침해도 커서가 두 개가 되지 않게). */
  join(roomId: string, input: { id: string; name: string; handle: string | null; visitorKey?: string }, now = Date.now()): PublicMember | null {
    this.sweep(roomId, now);
    const room = this.room(roomId);

    // 한 사람이 창을 수십 개 열어 두는 사고만 막는다 — 방 인원 자체엔 상한이 없다.
    if (input.visitorKey) {
      const tabs = [...room.members.values()].filter((m) => m.id.startsWith(`${input.visitorKey}:`)).length;
      if (tabs >= MAX_TABS_PER_VISITOR && !room.members.has(input.id)) return null;
    }

    const existing = room.members.get(input.id);
    const member: RoomMember = existing ?? {
      id: input.id,
      name: input.name,
      color: colorFor(input.handle || input.name || input.id),
      handle: input.handle,
      x: 0.5,
      y: 0.5,
      active: false,
      lastSeen: now,
    };
    member.name = input.name;
    member.handle = input.handle;
    member.lastSeen = now;
    room.members.set(member.id, member);

    const { lastSeen: _lastSeen, ...pub } = member;
    if (!existing) this.emit(roomId, { type: 'join', member: pub });
    return pub;
  }

  /** 커서가 움직였다. 방에 없으면 아무 일도 안 한다(들어온 적 없는 창의 좌표는 뜻이 없다). */
  move(roomId: string, id: string, x: number, y: number, active: boolean, now = Date.now()): boolean {
    const room = this.rooms.get(roomId);
    const member = room?.members.get(id);
    if (!room || !member) return false;
    // 화면 밖 좌표는 자른다 — 이상한 값이 오면 남의 화면에서 커서가 사라진 것처럼 보인다.
    member.x = Math.min(1, Math.max(0, Number(x) || 0));
    member.y = Math.min(1, Math.max(0, Number(y) || 0));
    member.active = !!active;
    member.lastSeen = now;
    this.emit(roomId, { type: 'move', id, x: member.x, y: member.y, active: member.active });
    return true;
  }

  leave(roomId: string, id: string): void {
    const room = this.rooms.get(roomId);
    if (!room || !room.members.delete(id)) return;
    this.emit(roomId, { type: 'leave', id });
    if (room.members.size === 0 && room.listeners.size === 0) this.rooms.delete(roomId);
  }

  subscribe(roomId: string, listener: Listener): () => void {
    const room = this.room(roomId);
    room.listeners.add(listener);
    return () => {
      room.listeners.delete(listener);
      if (room.members.size === 0 && room.listeners.size === 0) this.rooms.delete(roomId);
    };
  }

  /** 관측용 — 어느 방에 몇 명이 있나 (광장에 낼 수 있는 값). */
  snapshot(now = Date.now()): Array<{ roomId: string; people: number }> {
    const rows: Array<{ roomId: string; people: number }> = [];
    for (const roomId of [...this.rooms.keys()]) {
      const people = this.members(roomId, now).length;
      if (people > 0) rows.push({ roomId, people });
    }
    return rows.sort((a, b) => b.people - a.people);
  }
}

let shared: KarmolabRoomStore | null = null;

export function getKarmolabRoomStore(): KarmolabRoomStore {
  if (!shared) shared = new KarmolabRoomStore();
  return shared;
}
