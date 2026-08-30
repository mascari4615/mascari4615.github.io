/**
 * 함께 편집 붙이기 (TASK-KL-183 C, change.copresence-hardening 1단계).
 *
 * 도구는 **글칸 하나를 건네주기만** 하면 된다: `KarmoCopresence.share(el, 'memo-1')`.
 * 나머지(연산 만들기, 보내기, 받기, 커서 지키기)는 여기서 한다. 도구마다 CRDT 를 알게 하면
 * 아무도 안 붙인다.
 *
 * **방을 나가도 글은 남는다** (TASK-KL-191 축2). 첫 사이클은 방에 있는 동안만이었다 . 
 * 마지막 사람이 나가면 같이 쓴 것이 사라졌고, 남는 것이 없으면 그건 문서가 아니라 대화였다.
 * 이제 서버가 **글 한 장**을 들고 있는다(연산 기록도, 커서도 아니다).
 *
 * 갈라짐을 어떻게 막나: 다시 들어온 사람들이 **같은 글에서 같은 이름표**로 시작한다
 * (`CoText.seed`. 자리마다 정해진 이름). 각자 `diffTo` 로 집어넣으면 이름이 사람마다 달라져
 * 한 글자만 쳐도 글이 두 벌로 갈라진다.
 *
 * 커서 토글과는 무관하다. 남의 마우스를 안 보겠다는 것과 같이 쓰던 글을 그만두겠다는 것은
 * 다른 말이다.
 */
import { API_BASE, TAB_ID, currentRoomId, onRoomChange, onRoomOp, sendRoomOp } from './room-channel';
import type { CoText, TextOp } from './cotext';

const shared = new Map<string, { doc: CoText; el: HTMLTextAreaElement | HTMLInputElement; version: number }>();
/** 어떤 글칸을 맡았는지 — 방이 바뀌면 **새 방의 글로** 다시 붙어야 한다. */
const fields = new Map<string, HTMLTextAreaElement | HTMLInputElement>();
/** 이 글칸에 손을 이미 달았나 — 방이 바뀔 때마다 또 달면 한 글자에 연산이 여럿 나간다. */
const wired = new WeakSet<HTMLElement>();

/** 저장은 손을 멈춘 뒤에. 글자마다 보내면 방이 아니라 서버가 먼저 지친다. */
const SAVE_IDLE_MS = 1500;
const remoteSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

function saveDoc(key: string): void {
    const entry = shared.get(key);
    const roomId = currentRoomId();
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
            /* 못 보냈으면 다음 멈춤에서 다시 보낸다. 글은 여전히 이 창에 있다 */
        });
}

export async function shareField(el: HTMLTextAreaElement | HTMLInputElement, key: string): Promise<void> {
    fields.set(key, el);
    if (shared.has(key)) return;
    const roomId = currentRoomId();
    const { CoText } = await import('./cotext');
    const doc = new CoText(TAB_ID);
    const entry = { doc, el, version: 0 };
    shared.set(key, entry);

    /* 시작점. 서버에 남아 있던 글이 있으면 그것으로, 없으면 지금 화면 글로.
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
            /* 서버에 못 닿으면 저장 없이 이 창 안에서만 같이 쓴다. 도구는 그대로 돈다 */
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

    if (wired.has(el)) return;
    wired.add(el);
    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    el.addEventListener('input', () => {
        const entryNow = shared.get(key);
        if (!entryNow) return;      // 방을 옮기는 중이면 이번 글자는 다음 씨앗에 담긴다
        const doc = entryNow.doc;
        const ops = doc.diffTo(el.value);
        if (!ops.length) return;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => saveDoc(key), SAVE_IDLE_MS);
        sendRoomOp({ key, ops });
    });
}

function applyRemote(payload: unknown): void {
    const data = payload as { key?: string; ops?: TextOp[] } | undefined;
    const entry = data?.key ? shared.get(data.key) : undefined;
    if (!entry || !Array.isArray(data?.ops)) return;
    data.ops.forEach((op) => entry.doc.apply(op));
    /* 남이 친 것도 저장한다. 안 그러면 받아 적기만 한 사람이 나갈 때 그 글이 안 남는다.
     * 여럿이 같이 저장해도 판 번호가 낡은 저장을 걸러 준다(서버 원장). */
    if (data.key) {
        const at = remoteSaveTimers.get(data.key);
        if (at) clearTimeout(at);
        remoteSaveTimers.set(data.key, setTimeout(() => saveDoc(data.key as string), SAVE_IDLE_MS));
    }
    // 커서 자리를 지킨다. 남이 친 글자 때문에 내 커서가 튀면 같이 쓰는 게 아니라 방해가 된다.
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
        /* 몇몇 입력칸은 커서를 못 옮긴다. 글은 이미 맞았다 */
    }
}

onRoomOp((op) => applyRemote(op));

/* 방이 바뀌면 **글도 갈아탄다** (change.copresence-hardening 5단계).
 *
 * 예전엔 `shared` 를 안 비워서, 방을 옮긴 뒤에도 옛 key 의 글을 **새 방 문서에 저장**했다 —
 * 다른 화면의 메모가 이 화면 메모를 덮는 길이었다. 이제 옛 것을 놓고 새 방 글로 다시 씨앗을 깐다.
 */
onRoomChange(() => {
    for (const timer of remoteSaveTimers.values()) clearTimeout(timer);
    remoteSaveTimers.clear();
    shared.clear();
    for (const [key, el] of fields) void shareField(el, key);
});
