/**
 * 방으로 가는 관 하나 (change.copresence-hardening 1·2단계).
 *
 * 여기는 **커서를 모른다.** 아는 것은 셋뿐이다: 지금 어느 방인가 · 그 방으로 무엇을 보내는가 ·
 * 그 방에서 무엇이 오는가. 커서든 지구본이든 함께 편집이든 이 관의 손님이다.
 *
 * 왜 갈랐나: 「같이 쓰기 끔」이 관까지 끄고 있었다. 그건 프라이버시 스위치가 아니라
 * 남의 기능을 끄는 스위치다 — 커서를 껐다고 같이 보던 지구본이 멈출 이유가 없다.
 *
 * ── 한 사람 = 한 연결 ─────────────────────────────────────────────
 *
 * 탭을 셋 열면 서버에는 세 사람이 있었다. 그 셋은 같은 이름·같은 색이고, 앞에 있는 하나
 * 말고는 전부 얼어붙어 있다 — 남이 보기엔 **유령 둘**이고, 「지금 N명」은 그만큼 부풀었다.
 *
 * 그래서 같은 브라우저의 같은 방 탭들끼리 **대표 하나**를 뽑는다. 대표만 연결을 열고,
 * 받은 것을 다른 탭에 그대로 넘긴다. 보내는 것도 대표를 거친다.
 * 대표는 **보고 있는 탭** 우선 — 안 보는 화면의 좌표는 소식이 아니라 소음이라서다.
 */

import { toolIdFromPath } from './lib/site-base';

/**
 * 어디에 붙을까. 기본은 노트북의 그 서버다.
 * `window.KARMOLAB_API_BASE` 를 두면 그쪽으로 — 로컬 봇에 붙여 확인하는 길이다.
 */
export const API_BASE =
    (typeof window !== 'undefined' && (window as { KARMOLAB_API_BASE?: string }).KARMOLAB_API_BASE) ||
    'https://yawnbot.mascari4615.com';

/** 이 창 하나를 가리키는 이름. */
export const TAB_ID = Math.random().toString(36).slice(2, 10);

/** 좌표를 얼마나 자주 보내나. 사람 눈은 20/초면 부드럽다고 느낀다. */
const SEND_MS = 50;

/**
 * 안 움직여도 이만큼마다 마지막 자리를 다시 보낸다.
 * 서버는 **침묵을 나감으로 판정한다**(30초). 화면만 보는 사람은 나간 사람이 아니다.
 */
const KEEPALIVE_MS = 10 * 1000;

/** 다시 들어가기를 이보다 자주는 안 한다 — 서버가 계속 「없다」고 하면 붙었다 떨어졌다 하게 된다. */
const REJOIN_MIN_MS = 3 * 1000;

/** 탭끼리 서로 「나 여기 있다」를 말하는 주기. */
const PEER_PING_MS = 1000;

/** 이만큼 조용한 탭은 닫힌 것으로 본다 — 대표가 사라져도 3초 안에 다음 대표가 선다. */
const PEER_IDLE_MS = 3 * PEER_PING_MS;

export interface RoomMember {
    id: string;
    name: string;
    color: string;
    handle: string | null;
    x: number;
    y: number;
    active: boolean;
}

/** 방에서 오는 소식. `reset` = 관이 끊겼거나 방이 바뀌었다(그린 것을 지워라). */
export type RoomEventKind = 'hello' | 'join' | 'move' | 'leave' | 'reset';

type EventListener = (kind: RoomEventKind, data: unknown) => void;
type OpListener = (op: unknown, from: string) => void;
type RoomListener = (roomId: string) => void;

const eventListeners = new Set<EventListener>();
const opListeners = new Set<OpListener>();
const roomListeners = new Set<RoomListener>();

let source: EventSource | null = null;
let roomId: string | null = null;
let pending: { x: number; y: number; active: boolean } | null = null;
let last = { x: 0.5, y: 0.5, active: false };
let lastSentAt = 0;
let rejoinAt = 0;
let sendTimer: ReturnType<typeof setInterval> | null = null;
let leader = true;

/* ── 탭끼리 하는 말 ────────────────────────────────────────────── */

type PeerMessage =
    | { kind: 'alive'; tab: string; room: string; visible: boolean }
    | { kind: 'bye'; tab: string; room: string }
    | { kind: 'event'; tab: string; room: string; event: RoomEventKind; data: unknown }
    | { kind: 'op-in'; tab: string; room: string; op: unknown; from: string }
    | { kind: 'op-out'; tab: string; room: string; op: unknown };

const peers = new Map<string, { room: string; visible: boolean; at: number }>();
let channel: BroadcastChannel | null = null;

function openChannel(): void {
    if (channel || typeof BroadcastChannel === 'undefined') return; // 없는 브라우저 = 각자 연결(고장 아님)
    channel = new BroadcastChannel('kl-room');
    channel.addEventListener('message', (event) => onPeerMessage(event.data as PeerMessage));
    setInterval(() => {
        post({ kind: 'alive', tab: TAB_ID, room: roomId ?? '', visible: document.visibilityState === 'visible' });
        electLeader();
    }, PEER_PING_MS);
    window.addEventListener('pagehide', () => post({ kind: 'bye', tab: TAB_ID, room: roomId ?? '' }));
}

function post(message: PeerMessage): void {
    try {
        channel?.postMessage(message);
    } catch {
        /* 채널이 닫혔으면 이 탭은 혼자 하는 것이다 */
    }
}

function onPeerMessage(message: PeerMessage): void {
    if (!message || message.tab === TAB_ID) return;
    if (message.kind === 'bye') {
        peers.delete(message.tab);
        electLeader();
        return;
    }
    if (message.kind === 'alive') {
        peers.set(message.tab, { room: message.room, visible: message.visible, at: Date.now() });
        electLeader();
        return;
    }
    // 아래 둘은 **같은 방**일 때만 뜻이 있다 — 다른 도구를 연 탭의 소식은 남의 방 소식이다.
    if (message.room !== roomId) return;
    if (message.kind === 'event') {
        for (const fn of eventListeners) fn(message.event, message.data);
        return;
    }
    if (message.kind === 'op-in') {
        for (const fn of opListeners) fn(message.op, message.from);
        return;
    }
    // 대표가 아닌 탭이 보내 달라고 넘긴 것 — 대표만 실어 나른다.
    if (message.kind === 'op-out' && leader) postOp(message.op);
}

/**
 * 대표 뽑기 — **보고 있는 탭 우선**, 같으면 이름이 작은 탭.
 * 규칙이 모든 탭에서 같으므로 서로 합의할 필요가 없다(투표도, 잠금도 없다).
 */
function electLeader(): void {
    const now = Date.now();
    let best = { visible: document.visibilityState === 'visible', tab: TAB_ID };
    for (const [tab, peer] of peers) {
        if (now - peer.at > PEER_IDLE_MS) {
            peers.delete(tab);
            continue;
        }
        if (peer.room !== roomId) continue;
        if (peer.visible !== best.visible ? peer.visible : tab < best.tab) best = { visible: peer.visible, tab };
    }
    const next = best.tab === TAB_ID;
    if (next === leader) return;
    leader = next;
    if (leader) connect();
    else disconnect('reset');
}

/* ── 서버로 가는 관 ────────────────────────────────────────────── */

/** 지금 보고 있는 화면 = 방 이름. */
export function currentRoom(): string {
    const detail = toolIdFromPath(location.pathname);
    if (detail) return detail;
    const hash = location.hash.replace(/^#/, '');
    return /^[a-z0-9][a-z0-9-]*$/.test(hash) ? hash : 'home';
}

export function currentRoomId(): string | null {
    return roomId;
}

export function isRoomLeader(): boolean {
    return leader;
}

function emit(kind: RoomEventKind, data: unknown): void {
    for (const fn of eventListeners) fn(kind, data);
    // 대표가 본 것은 같은 방 다른 탭도 봐야 한다 — 그 탭들에는 연결이 없다.
    if (leader) post({ kind: 'event', tab: TAB_ID, room: roomId ?? '', event: kind, data });
}

function connect(): void {
    if (!roomId || source || !leader) return;
    const room = roomId;
    source = new EventSource(`${API_BASE}/kl/room/${encodeURIComponent(room)}/stream?tab=${TAB_ID}`, {
        withCredentials: true,
    });
    const relay = (kind: RoomEventKind) => (event: Event) => {
        emit(kind, JSON.parse((event as MessageEvent).data));
    };
    source.addEventListener('hello', relay('hello'));
    source.addEventListener('join', relay('join'));
    source.addEventListener('move', relay('move'));
    source.addEventListener('leave', relay('leave'));
    source.addEventListener('op', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { op?: unknown; member?: { id?: string } };
        const from = data.member?.id ?? '';
        for (const fn of opListeners) fn(data.op, from);
        post({ kind: 'op-in', tab: TAB_ID, room: room, op: data.op, from });
    });
    // 서버가 죽거나 터널이 끊기면 브라우저가 알아서 다시 붙는다.

    lastSentAt = Date.now();
    if (!sendTimer) sendTimer = setInterval(flush, SEND_MS);
}

function disconnect(kind: RoomEventKind | null): void {
    source?.close();
    source = null;
    if (sendTimer) {
        clearInterval(sendTimer);
        sendTimer = null;
    }
    if (kind) for (const fn of eventListeners) fn(kind, null);
}

function flush(): void {
    if (!roomId || !leader) return;
    // 안 움직여도 가끔은 말한다 — 침묵이 곧 나감으로 읽히기 때문이다.
    if (!pending && document.visibilityState === 'visible' && Date.now() - lastSentAt >= KEEPALIVE_MS) {
        pending = { ...last };
    }
    if (!pending) return;
    const body = { ...pending, tab: TAB_ID };
    pending = null;
    lastSentAt = Date.now();
    void fetch(`${API_BASE}/kl/room/${encodeURIComponent(roomId)}/move`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { moved?: boolean } | null) => {
            // 「그런 사람 없다」 = 이미 내보내진 것이다. 다시 들어간다.
            if (data && data.moved === false) rejoin();
        })
        .catch(() => {
            /* 한 번 못 보낸 좌표는 버린다 — 다음 좌표가 곧 온다 */
        });
}

function rejoin(): void {
    if (!roomId || !leader) return;
    const now = Date.now();
    if (now - rejoinAt < REJOIN_MIN_MS) return;
    rejoinAt = now;
    disconnect('reset');
    connect();
}

/** 방을 옮긴다(또는 처음 들어간다). 같은 방이면 아무 일도 안 한다. */
export function joinRoom(next: string): void {
    if (roomId === next && (source || !leader)) return;
    disconnect('reset');
    roomId = next;
    for (const fn of roomListeners) fn(next);
    electLeader();
    connect();
}

/** 내 자리를 알린다. 대표가 아니면 안 보낸다 — 한 사람이 커서 셋일 이유가 없다. */
export function sendMove(x: number, y: number, active: boolean): void {
    last = { x, y, active };
    if (leader) pending = { ...last };
}

/** 「이제 안 보인다」 — 보낼 것이 비어 있어도 새로 만든다(안 그러면 유령 커서가 남는다). */
export function sendInactive(): void {
    last = { ...last, active: false };
    if (leader) pending = { ...last };
}

function postOp(op: unknown): void {
    if (!roomId) return;
    void fetch(`${API_BASE}/kl/room/${encodeURIComponent(roomId)}/op`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab: TAB_ID, op }),
    }).catch(() => {
        /* 한 번 못 보낸 것은 다음 것이 대신한다 */
    });
}

/** 이 관으로 보낸다. 대표가 아니면 대표에게 넘긴다(내 연결은 없다). */
export function sendRoomOp(op: unknown): void {
    if (!roomId) return;
    if (leader) postOp(op);
    else post({ kind: 'op-out', tab: TAB_ID, room: roomId, op });
}

/** 이 관으로 오는 것을 듣는다. 돌려받은 함수를 부르면 그만 듣는다. */
export function onRoomOp(fn: OpListener): () => void {
    opListeners.add(fn);
    return () => opListeners.delete(fn);
}

/** 방 사람들의 소식(들어옴·움직임·나감)을 듣는다. */
export function onRoomEvent(fn: EventListener): () => void {
    eventListeners.add(fn);
    return () => eventListeners.delete(fn);
}

/** 방이 바뀌는 순간을 듣는다 — 방마다 따로 사는 것(함께 쓰는 글 같은 것)이 있다. */
export function onRoomChange(fn: RoomListener): () => void {
    roomListeners.add(fn);
    return () => roomListeners.delete(fn);
}

function start(): void {
    openChannel();
    joinRoom(currentRoom());
    window.addEventListener('hashchange', () => joinRoom(currentRoom()));
    document.addEventListener('visibilitychange', () => {
        // 보이는 탭이 대표가 되는 것이 옳다 — 사람은 그 탭을 보고 있다.
        post({ kind: 'alive', tab: TAB_ID, room: roomId ?? '', visible: document.visibilityState === 'visible' });
        electLeader();
        if (document.visibilityState === 'visible') lastSentAt = 0;
    });
}

if (typeof window !== 'undefined') {
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);
}
