/**
 * 같이 쓰기 — 남의 커서가 내 화면에 보인다 (TASK-KL-180).
 *
 * 이 사이트는 「지금 N명」이라는 숫자까지 와 있었다. 숫자는 사람이 있다는 **소문**이고,
 * 움직이는 커서는 **증거**다. 도구든 게임이든 화면을 옮기면 그 화면의 방으로 따라 들어간다.
 *
 * 규율:
 *  ① **아무것도 저장하지 않는다.** 좌표는 비율(0~1)로 보내고 서버는 흘려보내기만 한다.
 *  ② 내 커서는 **안 그린다** — 브라우저가 이미 그리고 있다. 두 개로 보이면 이상하다.
 *  ③ 끄면 내 것을 안 보내고 남의 것도 안 그린다. 켜고 끄는 것은 이 브라우저에만 남는다.
 *  ④ 창이 뒤에 있으면 안 보낸다 — 안 보고 있는 화면의 커서는 소식이 아니라 소음이다.
 */
/**
 * 어디에 붙을까. 기본은 노트북의 그 서버다.
 *
 * `window.KARMOLAB_API_BASE` 를 두면 그쪽으로 붙는다 — **로컬에서 봇을 띄워 놓고 이 화면을
 * 그 봇에 붙이는 길**이다. 이게 없으면 같이 쓰기는 배포해야만 확인할 수 있고, 그건 확인
 * 루프가 없는 것과 같다.
 */
const API_BASE =
    (typeof window !== 'undefined' && (window as { KARMOLAB_API_BASE?: string }).KARMOLAB_API_BASE) ||
    'https://yawnbot.mascari4615.com';

/** 켜짐/꺼짐. 기본은 켜짐 — 「사람이 있다」가 이 기능의 전부라 꺼 두면 없는 것과 같다. */
const PREF_KEY = 'karmolab_copresence';

/** 좌표를 얼마나 자주 보내나. 사람 눈은 20/초면 부드럽다고 느끼고, 그보다 잦으면 낭비다. */
const SEND_MS = 50;

/** 이 창 하나를 가리키는 이름. 같은 사람이 창을 둘 열면 커서도 둘이다(그게 사실이다). */
const TAB_ID = Math.random().toString(36).slice(2, 10);

interface Member {
    id: string;
    name: string;
    color: string;
    handle: string | null;
    x: number;
    y: number;
    active: boolean;
}

let source: EventSource | null = null;
let layer: HTMLElement | null = null;
let roomId: string | null = null;
let pending: { x: number; y: number; active: boolean } | null = null;
let sendTimer: ReturnType<typeof setInterval> | null = null;
const cursors = new Map<string, HTMLElement>();

export function isCopresenceOn(): boolean {
    try {
        return localStorage.getItem(PREF_KEY) !== 'off';
    } catch {
        return true;
    }
}

export function setCopresence(on: boolean): void {
    try {
        localStorage.setItem(PREF_KEY, on ? 'on' : 'off');
    } catch {
        /* 저장이 안 돼도 이번 창에서는 동작한다 */
    }
    if (on) joinRoom(roomId ?? currentRoom());
    else leaveRoom();
}

function ensureLayer(): HTMLElement {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'kl-cursors';
    document.body.appendChild(layer);
    if (!document.getElementById('kl-cursor-style')) {
        const style = document.createElement('style');
        style.id = 'kl-cursor-style';
        style.textContent = [
            /* 남의 커서는 **위에 떠 있되 아무것도 막지 않는다** — 클릭이 이 층에 걸리면
               같이 쓰는 것이 아니라 방해하는 것이 된다. */
            '.kl-cursors { position:fixed; inset:0; pointer-events:none; z-index:70; overflow:hidden; }',
            '.kl-cursor { position:absolute; top:0; left:0; will-change:transform;',
            '  transition:transform .09s linear, opacity .2s ease; display:flex; align-items:flex-start; gap:4px; }',
            '.kl-cursor[data-active="0"] { opacity:0; }',
            '.kl-cursor svg { filter:drop-shadow(0 1px 2px rgba(0,0,0,.45)); flex:0 0 auto; }',
            '.kl-cursor-name { transform:translateY(14px); padding:2px 7px; border-radius:999px;',
            '  font-size:11px; line-height:1.5; white-space:nowrap; color:#0f0f12; font-weight:600;',
            '  box-shadow:0 1px 3px rgba(0,0,0,.35); }',
        ].join('\n');
        document.head.appendChild(style);
    }
    return layer;
}

function drawMember(member: Member): void {
    const host = ensureLayer();
    let node = cursors.get(member.id);
    if (!node) {
        node = document.createElement('div');
        node.className = 'kl-cursor';
        node.innerHTML =
            '<svg width="16" height="20" viewBox="0 0 16 20" fill="none">' +
            `<path d="M1 1L14 8.5L8 10L11 17L8.5 18L5.5 11L1 14V1Z" fill="${member.color}" stroke="rgba(0,0,0,.35)" stroke-width="1"/></svg>` +
            `<span class="kl-cursor-name" style="background:${member.color}"></span>`;
        host.appendChild(node);
        cursors.set(member.id, node);
    }
    const label = node.querySelector('.kl-cursor-name');
    if (label) label.textContent = member.name;
    node.dataset.active = member.active ? '1' : '0';
    node.style.transform = `translate(${member.x * window.innerWidth}px, ${member.y * window.innerHeight}px)`;
}

function removeMember(id: string): void {
    const node = cursors.get(id);
    if (!node) return;
    node.remove();
    cursors.delete(id);
}

function clearAll(): void {
    cursors.forEach((node) => node.remove());
    cursors.clear();
    layer?.remove();
    layer = null;
}

/** 지금 보고 있는 화면 = 방 이름. 도구·게임·첫 화면 구분 없이 같은 규칙이다. */
function currentRoom(): string {
    const detail = /^\/karmolab\/t\/([a-z0-9][a-z0-9-]*)\/?$/.exec(location.pathname);
    if (detail) return detail[1];
    const hash = location.hash.replace(/^#/, '');
    return /^[a-z0-9][a-z0-9-]*$/.test(hash) ? hash : 'home';
}

function leaveRoom(): void {
    source?.close();
    source = null;
    if (sendTimer) {
        clearInterval(sendTimer);
        sendTimer = null;
    }
    clearAll();
}

function joinRoom(next: string): void {
    if (!isCopresenceOn()) return;
    if (source && roomId === next) return;
    leaveRoom();
    roomId = next;

    source = new EventSource(`${API_BASE}/kl/room/${encodeURIComponent(next)}/stream?tab=${TAB_ID}`, {
        withCredentials: true,
    });
    source.addEventListener('hello', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { members: Member[] };
        data.members.forEach(drawMember);
    });
    source.addEventListener('join', (event) => {
        drawMember((JSON.parse((event as MessageEvent).data) as { member: Member }).member);
    });
    source.addEventListener('move', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { id: string; x: number; y: number; active: boolean };
        const node = cursors.get(data.id);
        if (!node) return; // 아직 못 본 사람의 움직임은 버린다 — join 이 오면 그때 그린다.
        node.dataset.active = data.active ? '1' : '0';
        node.style.transform = `translate(${data.x * window.innerWidth}px, ${data.y * window.innerHeight}px)`;
    });
    source.addEventListener('op', (event) => {
        const data = JSON.parse((event as MessageEvent).data) as { op?: unknown };
        applyRemote(data.op);
    });
    source.addEventListener('leave', (event) => {
        removeMember((JSON.parse((event as MessageEvent).data) as { id: string }).id);
    });
    // 서버가 죽거나 터널이 끊기면 브라우저가 알아서 다시 붙는다. 우리가 할 일은 없다.

    sendTimer = setInterval(() => {
        if (!pending || !roomId) return;
        const body = { ...pending, tab: TAB_ID };
        pending = null;
        void fetch(`${API_BASE}/kl/room/${encodeURIComponent(roomId)}/move`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).catch(() => {
            /* 한 번 못 보낸 좌표는 버린다 — 다음 좌표가 곧 온다 */
        });
    }, SEND_MS);
}

function watchPointer(): void {
    const note = (x: number, y: number, active: boolean): void => {
        if (!isCopresenceOn()) return;
        // 안 보고 있는 창의 커서는 소식이 아니라 소음이다.
        if (document.visibilityState !== 'visible') return;
        pending = { x: x / window.innerWidth, y: y / window.innerHeight, active };
    };
    window.addEventListener('pointermove', (event) => note(event.clientX, event.clientY, true), { passive: true });
    // 손가락도 커서다 — 폰에서 같이 쓰는 사람이 안 보이면 그건 반쪽이다.
    window.addEventListener('touchmove', (event) => {
        const touch = event.touches[0];
        if (touch) note(touch.clientX, touch.clientY, true);
    }, { passive: true });
    window.addEventListener('pointerleave', () => {
        if (pending) pending.active = false;
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' && pending) pending.active = false;
    });
}

function start(): void {
    watchPointer();
    joinRoom(currentRoom());
    window.addEventListener('hashchange', () => joinRoom(currentRoom()));
    // 창 크기가 바뀌면 비율은 그대로여도 픽셀이 달라진다 — 다음 움직임에서 맞춰진다.
}

if (document.readyState === 'complete') start();
else window.addEventListener('load', start);

/* ── 함께 편집 붙이기 (TASK-KL-183 C) ─────────────────────────────
 *
 * 도구는 **글칸 하나를 건네주기만** 하면 된다: `KarmoCopresence.share(el, 'memo-1')`.
 * 나머지(연산 만들기·보내기·받기·커서 지키기)는 여기서 한다 — 도구마다 CRDT 를 알게 하면
 * 아무도 안 붙인다.
 *
 * **방을 나가도 글은 남는다** (TASK-KL-191 축2). 첫 사이클은 「방에 있는 동안만」이었다 —
 * 마지막 사람이 나가면 같이 쓴 것이 사라졌고, 남는 것이 없으면 그건 문서가 아니라 대화였다.
 * 이제 서버가 **글 한 장**을 들고 있는다(연산 기록도, 커서도 아니다).
 *
 * 갈라짐을 어떻게 막나: 다시 들어온 사람들이 **같은 글에서 같은 이름표**로 시작한다
 * (`CoText.seed` — 자리마다 정해진 이름). 각자 `diffTo` 로 집어넣으면 이름이 사람마다 달라져
 * 한 글자만 쳐도 글이 두 벌로 갈라진다.
 */
const shared = new Map<
    string,
    { doc: import('./cotext').CoText; el: HTMLTextAreaElement | HTMLInputElement; version: number }
>();

/** 저장은 손을 멈춘 뒤에 — 글자마다 보내면 방이 아니라 서버가 먼저 지친다. */
const SAVE_IDLE_MS = 1500;
const remoteSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function saveDoc(key: string): void {
    const entry = shared.get(key);
    if (!entry || !roomId) return;
    void fetch(`${API_BASE}/kl/room/${encodeURIComponent(roomId)}/doc/${encodeURIComponent(key)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: entry.doc.text, basedOn: entry.version }),
    })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { version?: number } | null) => {
            if (typeof data?.version === 'number') entry.version = data.version;
        })
        .catch(() => {
            /* 못 보냈으면 다음 멈춤에서 다시 보낸다 — 글은 여전히 이 창에 있다 */
        });
}

async function shareField(el: HTMLTextAreaElement | HTMLInputElement, key: string): Promise<void> {
    if (!isCopresenceOn() || shared.has(key)) return;
    const { CoText } = await import('./cotext');
    const doc = new CoText(TAB_ID);
    const entry = { doc, el, version: 0 };
    shared.set(key, entry);

    /* 시작점 — 서버에 남아 있던 글이 있으면 그것으로, 없으면 지금 화면 글로.
     * 순서가 중요하다: 서버 글을 먼저 깔아야 **모두가 같은 이름표**로 시작한다.
     * 내가 이미 쓰던 글이 있으면 그건 내 글자로 뒤에 붙는다(남의 글을 안 지운다). */
    let saved = '';
    if (roomId) {
        try {
            const res = await fetch(`${API_BASE}/kl/room/${encodeURIComponent(roomId)}/doc/${encodeURIComponent(key)}`);
            if (res.ok) {
                const data = (await res.json()) as { text?: string; version?: number };
                saved = String(data.text ?? '');
                entry.version = Number(data.version) || 0;
            }
        } catch {
            /* 서버에 못 닿으면 저장 없이 이 창 안에서만 같이 쓴다 — 도구는 그대로 돈다 */
        }
    }
    if (saved) {
        doc.seed(saved);
        const mine = el.value;
        el.value = doc.text;
        if (mine && mine !== saved) doc.diffTo(`${doc.text}${mine}`);
        el.value = doc.text;
    } else {
        // 빈 글에서 시작하면 남이 들어오는 순간 내 글이 사라진다.
        doc.diffTo(el.value);
    }

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    el.addEventListener('input', () => {
        const ops = doc.diffTo(el.value);
        if (!ops.length) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveDoc(key), SAVE_IDLE_MS);
        if (!roomId) return;
        void fetch(`${API_BASE}/kl/room/${encodeURIComponent(roomId)}/op`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tab: TAB_ID, op: { key, ops } }),
        }).catch(() => {
            /* 한 번 못 보낸 연산은 다음 입력 때 다시 실려 간다(diff 는 지금 글 기준이다) */
        });
    });
}

function applyRemote(payload: unknown): void {
    const data = payload as { key?: string; ops?: Array<import('./cotext').TextOp> } | undefined;
    const entry = data?.key ? shared.get(data.key) : undefined;
    if (!entry || !Array.isArray(data?.ops)) return;
    data.ops.forEach((op) => entry.doc.apply(op));
    /* 남이 친 것도 저장한다 — 안 그러면 「받아 적기만 한 사람」이 나갈 때 그 글이 안 남는다.
     * 여럿이 같이 저장해도 판 번호가 낡은 저장을 걸러 준다(서버 원장). */
    if (data.key) {
        const at = remoteSaveTimers.get(data.key);
        if (at) clearTimeout(at);
        remoteSaveTimers.set(data.key, setTimeout(() => saveDoc(data.key as string), SAVE_IDLE_MS));
    }
    // 커서 자리를 지킨다 — 남이 친 글자 때문에 내 커서가 튀면 같이 쓰는 게 아니라 방해가 된다.
    const el = entry.el;
    const before = el.selectionStart ?? 0;
    const prevLength = el.value.length;
    const next = entry.doc.text;
    if (el.value === next) return;
    el.value = next;
    const shift = next.length - prevLength;
    const at = Math.max(0, before + (shift > 0 ? shift : 0));
    try {
        el.setSelectionRange(at, at);
    } catch {
        /* 몇몇 입력칸은 커서를 못 옮긴다 — 글은 이미 맞았다 */
    }
}

declare global {
    interface Window {
        KarmoCopresence: {
            isOn: typeof isCopresenceOn;
            set: typeof setCopresence;
            share: typeof shareField;
        };
    }
}

window.KarmoCopresence = { isOn: isCopresenceOn, set: setCopresence, share: shareField };

export {};
