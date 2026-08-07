/**
 * KarmoLab 계정 — 브라우저 쪽 (TASK-KL-098 Cycle 1).
 *
 * 무엇을 하나: 지금까지 브라우저 안에만 있던 기록(`toolbox_user_data`)을 우리 서버와 **합친다**.
 * 그래서 기기를 바꿔도 남고, 공개 프로필로 남에게 보인다.
 *
 * 제일 중요한 성질 = **fail-open**. 서버가 죽든 느리든 로그인을 안 했든, 이 파일은 아무것도
 * 막지 않는다. 실패하면 조용히 지금까지와 100% 같은 동작으로 돌아간다. 도구 사이트의 본체는
 * 도구지 계정이 아니다 — 노트북 한 대에 도구 124개의 생사를 걸지 않는다.
 *
 * toolbox.ts 를 안 건드리는 이유: 저장 자리는 localStorage 키 하나뿐이라 바깥에서 합쳐도
 * 충분하고, 그 파일은 다른 작업이 동시에 만지고 있다.
 */
type StreakEntry = { current: number; longest: number; lastActivityDate: string | null };

interface Records {
    achievements: string[];
    badges: string[];
    progress: Record<string, number>;
    streaks: Record<string, StreakEntry>;
}

interface AccountSummary {
    handle: string;
    displayName: string;
    avatarPath: string | null;
    joinedAt: string;
    profileUrl: string;
}

const API_BASE = 'https://yawnbot.mascari4615.com';
const USER_DATA_KEY = 'toolbox_user_data';

/** 서버를 기다리다 화면이 멈추면 안 된다. 이 시간을 넘기면 없는 셈 친다. */
const TIMEOUT_MS = 4000;

/** 기록이 바뀔 때마다 보내면 쓰다듬기 한 번에 한 통이 된다. 잠잠해지면 한 번 보낸다. */
const PUSH_DEBOUNCE_MS = 3000;

function emptyRecords(): Records {
    return { achievements: [], badges: [], progress: {}, streaks: {} };
}

function readLocal(): Records {
    try {
        const raw = localStorage.getItem(USER_DATA_KEY);
        if (!raw) return emptyRecords();
        const parsed = JSON.parse(raw) as Partial<Records>;
        return {
            achievements: Array.isArray(parsed.achievements) ? parsed.achievements : [],
            badges: Array.isArray(parsed.badges) ? parsed.badges : [],
            progress: parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {},
            streaks: parsed.streaks && typeof parsed.streaks === 'object' ? parsed.streaks : {},
        };
    } catch {
        return emptyRecords();
    }
}

function writeLocal(records: Records): void {
    try {
        // 다른 열쇠(테마·즐겨찾기 등)는 이 키에 없다. 이 키는 통째로 기록이다.
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(records));
    } catch {
        /* 저장 공간이 꽉 찼으면 그냥 넘긴다 — 여기서 던지면 페이지가 멈춘다. */
    }
}

/**
 * 서버 쪽 `mergeRecords` 와 **같은 규칙**. 한쪽이라도 다르면 왕복할 때마다 값이 흔들린다.
 * 도전과제·뱃지는 합집합, 누적값은 큰 쪽, 연속기록은 최장·최신.
 */
function mergeRecords(a: Records, b: Records): Records {
    const merged = emptyRecords();
    merged.achievements = [...new Set([...a.achievements, ...b.achievements])].sort();
    merged.badges = [...new Set([...a.badges, ...b.badges])].sort();

    for (const source of [a.progress, b.progress]) {
        for (const key of Object.keys(source)) {
            const n = Number(source[key]);
            if (!Number.isFinite(n)) continue;
            merged.progress[key] = Math.max(merged.progress[key] ?? 0, n);
        }
    }

    for (const source of [a.streaks, b.streaks]) {
        for (const key of Object.keys(source)) {
            const value = source[key];
            if (!value || typeof value !== 'object') continue;
            const prev = merged.streaks[key];
            const current = Math.max(prev?.current ?? 0, Number(value.current) || 0);
            const longest = Math.max(prev?.longest ?? 0, Number(value.longest) || 0, current);
            const dates = [prev?.lastActivityDate ?? null, value.lastActivityDate ?? null].filter(
                (d): d is string => typeof d === 'string' && d.length > 0,
            );
            merged.streaks[key] = {
                current,
                longest,
                lastActivityDate: dates.length ? dates.sort()[dates.length - 1] : null,
            };
        }
    }
    return merged;
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await fetch(`${API_BASE}${path}`, {
            ...init,
            // 쿠키로 로그인을 유지한다. 이게 없으면 매 요청이 남남이 된다.
            credentials: 'include',
            signal: controller.signal,
        });
    } catch {
        // 서버가 없다·느리다·터널이 끊겼다 — 전부 「계정 기능이 지금 없다」로만 취급한다.
        return null;
    } finally {
        clearTimeout(timer);
    }
}

type Listener = (state: AccountState) => void;

interface AccountState {
    /** 로그인했으면 계정, 아니면 null. 서버에 못 닿은 것도 null (구별은 `reachable`). */
    account: AccountSummary | null;
    /** 서버에 닿았나. false 면 화면에서 계정 자리를 아예 안 보여준다 — 눌러도 안 되는 단추가 제일 나쁘다. */
    reachable: boolean;
    /** 아직 처음 확인 중인가. */
    loading: boolean;
}

const state: AccountState = { account: null, reachable: false, loading: true };
const listeners = new Set<Listener>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastPushedSnapshot = '';

function emit(): void {
    for (const listener of listeners) {
        try {
            listener(state);
        } catch (error) {
            console.warn('[account] 화면 갱신 중 오류:', error);
        }
    }
}

/** 지금 브라우저에 있는 기록을 서버에 올리고, 합쳐진 결과를 도로 브라우저에 적는다. */
async function syncNow(): Promise<void> {
    if (!state.account) return;
    const local = readLocal();
    const snapshot = JSON.stringify(local);
    const response = await call('/kl/me/records', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: snapshot,
    });
    if (!response || !response.ok) return;
    try {
        const data = (await response.json()) as { records?: Records };
        if (!data.records) return;
        const merged = mergeRecords(local, {
            achievements: data.records.achievements ?? [],
            badges: data.records.badges ?? [],
            progress: data.records.progress ?? {},
            streaks: data.records.streaks ?? {},
        });
        writeLocal(merged);
        lastPushedSnapshot = JSON.stringify(merged);
        emit();
    } catch {
        /* 답이 이상하면 그냥 다음 기회에. */
    }
}

function scheduleSync(): void {
    if (!state.account) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
        pushTimer = null;
        void syncNow();
    }, PUSH_DEBOUNCE_MS);
}

/**
 * 기록이 바뀌었는지 지켜본다.
 * `storage` 이벤트는 **다른 탭**의 변경만 알려 준다 — 같은 탭에서 도전과제를 딴 것은 안 온다.
 * 그래서 같은 탭은 값을 주기적으로 비교한다 (문자열 비교 한 번, 비용 무시할 수준).
 */
function watchLocalChanges(): void {
    window.addEventListener('storage', (event) => {
        if (event.key === USER_DATA_KEY) scheduleSync();
    });
    setInterval(() => {
        if (!state.account) return;
        const snapshot = JSON.stringify(readLocal());
        if (snapshot !== lastPushedSnapshot) scheduleSync();
    }, 5000);
}

async function refresh(): Promise<void> {
    const response = await call('/kl/me');
    state.loading = false;
    if (!response || !response.ok) {
        state.reachable = false;
        state.account = null;
        emit();
        return;
    }
    state.reachable = true;
    try {
        const data = (await response.json()) as { account?: AccountSummary | null };
        state.account = data.account ?? null;
    } catch {
        state.account = null;
    }
    emit();
    if (state.account) await syncNow();
}

const KarmoAccount = {
    /** 지금 상태 (읽기 전용으로 쓸 것). */
    get state(): AccountState {
        return state;
    },
    /** 상태가 바뀔 때 불린다. 붙이는 즉시 현재 상태로 한 번 불러 준다. */
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        try {
            listener(state);
        } catch {
            /* 무시 */
        }
        return () => listeners.delete(listener);
    },
    /** 디스코드로 로그인. 돌아올 자리를 같이 넘겨 원래 보던 화면으로 복귀한다. */
    signIn(): void {
        const back = encodeURIComponent(location.href.split('#')[0]);
        location.href = `${API_BASE}/kl/auth/discord?return=${back}`;
    },
    async signOut(): Promise<void> {
        await call('/kl/auth/logout', { method: 'POST' });
        state.account = null;
        emit();
    },
    /** 지금 즉시 올린다 (기다리지 않음). */
    sync(): void {
        void syncNow();
    },
    /** 공개 프로필 그림 주소 — 서버가 대신 받아 보내는 자리. */
    avatarUrl(path: string | null): string | null {
        return path ? `${API_BASE}${path}` : null;
    },
    apiBase: API_BASE,
};

/* ===== 흔적 남기기 (TASK-KL-098 Cycle 2) =====
 *
 * 도구가 열렸다는 것을 서버에 알린다. 로그인과 무관하다 — 그냥 지나간 사람의 자국도
 * 사이트의 자국이다. 이게 있어야 「어느 도구가 실제로 쓰이는가」를 사이트가 스스로 말한다.
 *
 * 실패하면 아무 일도 안 한다. 숫자 하나 못 센 것과 도구가 안 되는 것은 전혀 다른 무게다.
 */

/** 이 페이지가 지금 어느 도구를 보여 주고 있나. 도구가 아니면 null. */
function currentToolId(): string | null {
    // 도구 상세 페이지: /karmolab/t/<id>/
    const detail = /^\/karmolab\/t\/([a-z0-9][a-z0-9-]*)\/?$/.exec(location.pathname);
    if (detail) return detail[1];

    // 앱 안: #<도구id>. 홈·계정 화면 등은 도구가 아니다.
    const hash = location.hash.replace(/^#/, '');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(hash)) return null;
    if (hash === 'home' || hash === 'user' || hash === 'linktree' || hash === 'plaza') return null;
    return hash;
}

/**
 * 다녀갔다고 한 번 알린다 (블로그의 Total / Today 와 같은 것).
 *
 * 도구 열림과 따로 세는 이유: 첫 화면만 보고 나간 사람도 다녀간 사람이다. 도구 열림만 세면
 * 첫 화면은 영원히 아무도 안 온 곳이 된다. 화면을 옮길 때마다 보내지 않고 **한 번만** 보낸다 —
 * 서버도 30분에 한 번만 세지만, 안 보내는 편이 낫다.
 */
function traceVisit(): void {
    void call('/kl/trace/visit', { method: 'POST' });
}

/** 한 번 알린 도구는 이 화면에서 다시 안 알린다 (서버도 한 번 더 거르지만, 안 보내면 더 낫다). */
const tracedTools = new Set<string>();

function traceCurrentTool(): void {
    const toolId = currentToolId();
    if (!toolId || tracedTools.has(toolId)) return;
    tracedTools.add(toolId);
    void call('/kl/trace/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolId }),
    });
}

/* ===== 헤더의 계정 자리 (TASK-KL-098 Cycle 3) =====
 *
 * 로그인 상태가 화면 어디에도 안 보이면 「내 정보」를 아는 사람만 로그인한다.
 * 헤더는 모든 화면에 있으므로 여기 붙인다.
 *
 * 서버에 못 닿으면 **아무것도 안 그린다** — 눌러도 아무 일 없는 단추가 제일 나쁘다.
 */
function mountHeaderAccount(): void {
    const slot = document.getElementById('headerAccount');
    if (!slot) return;

    if (!document.getElementById('kl-account-style')) {
        const style = document.createElement('style');
        style.id = 'kl-account-style';
        style.textContent = `
            .header-account { display:flex; align-items:center; }
            .header-account:empty { display:none; }
            .header-account-btn { display:flex; align-items:center; gap:7px; padding:4px 10px 4px 4px;
                border:1px solid var(--border); border-radius:999px; background:transparent; cursor:pointer;
                color:var(--text-secondary); font-size:var(--font-size-xs); max-width:170px; }
            .header-account-btn:hover { color:var(--text-primary); border-color:var(--accent); }
            .header-account-btn img, .header-account-blank { width:22px; height:22px; border-radius:50%; flex:0 0 auto; }
            .header-account-blank { display:grid; place-items:center; background:var(--bg-tertiary); font-size:11px; }
            .header-account-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .header-account-signin { padding:5px 12px; border-radius:999px; border:1px solid var(--accent);
                background:transparent; color:var(--accent); font-size:var(--font-size-xs); font-weight:600; cursor:pointer; }
            .header-account-signin:hover { background:var(--accent); color:var(--bg-primary); }
        `;
        document.head.appendChild(style);
    }

    KarmoAccount.subscribe((state) => {
        if (state.loading || !state.reachable) {
            slot.innerHTML = '';
            return;
        }
        if (!state.account) {
            slot.innerHTML = '<button type="button" class="header-account-signin" id="klHeaderSignIn">시작하기</button>';
            slot.querySelector('#klHeaderSignIn')?.addEventListener('click', () => KarmoAccount.signIn());
            return;
        }
        const me = state.account;
        const avatar = KarmoAccount.avatarUrl(me.avatarPath);
        slot.innerHTML = `
            <button type="button" class="header-account-btn" id="klHeaderMe" title="내 정보">
                ${avatar ? `<img src="${avatar}" alt="">` : '<span class="header-account-blank">◍</span>'}
                <span class="header-account-name">${me.displayName.replace(/[<>&"]/g, '')}</span>
            </button>`;
        slot.querySelector('#klHeaderMe')?.addEventListener('click', () => {
            Toolbox?.switchPage?.('user');
        });
    });
}

/* ===== 알림 종 (공용) =====
 *
 * 알림은 커뮤니티의 기능이 아니라 **플랫폼의 기능**이다 (사용자: "다른 기능도 함께 쓸 수 있도록
 * Common하게"). 그래서 커뮤니티 위젯이 아니라 머리띠에 산다 — 어느 화면에 있든 보이고,
 * 도구·계정·봇이 보낸 알림도 같은 자리에 뜬다.
 *
 * 서버에 못 닿거나 로그인 안 했으면 **아무것도 안 그린다**. 눌러도 아무 일 없는 종이 제일 나쁘다.
 */
interface NotificationItem {
    id: string;
    source: string;
    title: string;
    body: string | null;
    url: string | null;
    count: number;
    updatedAt: string;
    readAt: string | null;
}

/** 얼마나 자주 새 알림을 보나. 너무 잦으면 노트북 서버가 괜히 바쁘다. */
const BELL_POLL_MS = 60000;

function bellSafe(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function relativeTimeShort(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.floor((Date.now() - then) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}시간 전`;
    return `${Math.floor(hours / 24)}일 전`;
}

function bellStyle(): void {
    if (document.getElementById('kl-bell-style')) return;
    const style = document.createElement('style');
    style.id = 'kl-bell-style';
    style.textContent = [
        '.header-bell { position:relative; display:flex; }',
        '.header-bell:empty { display:none; }',
        '.kl-bell-btn { position:relative; display:grid; place-items:center; width:30px; height:30px;',
        '  border:1px solid var(--border); border-radius:50%; background:transparent;',
        '  color:var(--text-secondary); cursor:pointer; }',
        '.kl-bell-btn:hover { color:var(--text-primary); border-color:var(--accent); }',
        '.kl-bell-dot { position:absolute; top:-3px; right:-3px; min-width:16px; height:16px; padding:0 4px;',
        '  border-radius:999px; background:var(--accent); color:var(--bg-primary);',
        '  font-size:10px; line-height:16px; font-weight:700; }',
        '.kl-bell-panel { position:absolute; top:38px; right:0; width:300px; max-height:60vh; overflow-y:auto;',
        '  background:var(--bg-secondary); border:1px solid var(--border); border-radius:10px;',
        '  box-shadow:0 8px 24px rgba(0,0,0,.35); z-index:60; }',
        '.kl-bell-head { display:flex; align-items:center; justify-content:space-between;',
        '  padding:10px 12px; border-bottom:1px solid var(--border); font-size:12px; color:var(--text-secondary); }',
        '.kl-bell-head button { background:none; border:0; color:var(--accent); font:inherit; font-size:11px; cursor:pointer; }',
        '.kl-bell-item { display:block; width:100%; text-align:left; padding:10px 12px; background:none;',
        '  border:0; border-top:1px solid var(--border); cursor:pointer; font:inherit; }',
        '.kl-bell-item:hover { background:var(--bg-tertiary); }',
        '.kl-bell-item[data-unread="1"] { background:var(--accent-dim); }',
        '.kl-bell-title { display:block; font-size:12px; color:var(--text-primary); }',
        '.kl-bell-body { display:block; margin-top:2px; font-size:11px; color:var(--text-tertiary);',
        '  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
        '.kl-bell-empty { padding:22px 12px; text-align:center; font-size:12px; color:var(--text-tertiary); }',
    ].join('\n');
    document.head.appendChild(style);
}

function mountBell(): void {
    const slot = document.getElementById('headerBell');
    if (!slot) return;
    bellStyle();

    let open = false;
    let items: NotificationItem[] = [];
    let unread = 0;

    const load = async (): Promise<void> => {
        const response = await call('/kl/notifications');
        if (!response || !response.ok) return;
        try {
            const data = (await response.json()) as { items?: NotificationItem[]; unread?: number };
            items = data.items ?? [];
            unread = data.unread ?? 0;
        } catch {
            return;
        }
        paint();
    };

    function paint(): void {
        // 로그인 안 했거나 서버에 못 닿으면 종 자체를 안 그린다.
        if (!state.account || !state.reachable) {
            slot!.innerHTML = '';
            return;
        }
        const list = items.length
            ? items
                  .map(
                      (n) =>
                          `<button type="button" class="kl-bell-item" data-note="${bellSafe(n.id)}" data-unread="${n.readAt ? '0' : '1'}">` +
                          `<span class="kl-bell-title">${bellSafe(n.title)}${n.count > 1 ? ` (${n.count})` : ''}</span>` +
                          `<span class="kl-bell-body">${bellSafe(n.body ?? '')} · ${relativeTimeShort(n.updatedAt)}</span>` +
                          `</button>`,
                  )
                  .join('')
            : '<div class="kl-bell-empty">새 알림이 없습니다</div>';

        const panel = open
            ? `<div class="kl-bell-panel"><div class="kl-bell-head"><span>알림</span>${
                  unread ? '<button type="button" id="klBellAll">모두 읽음</button>' : ''
              }</div>${list}</div>`
            : '';

        slot!.innerHTML =
            `<button type="button" class="kl-bell-btn" id="klBell" title="알림" aria-label="알림">` +
            `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ` +
            `stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>` +
            `<path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>` +
            (unread ? `<span class="kl-bell-dot">${unread > 99 ? '99+' : unread}</span>` : '') +
            `</button>${panel}`;

        slot!.querySelector('#klBell')?.addEventListener('click', () => {
            open = !open;
            paint();
            if (open) void load();
        });
        slot!.querySelector('#klBellAll')?.addEventListener('click', () => {
            void call('/kl/notifications/read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: '{}',
            }).then(() => load());
        });
        slot!.querySelectorAll<HTMLButtonElement>('[data-note]').forEach((button) => {
            button.addEventListener('click', () => {
                const id = button.dataset.note ?? '';
                const found = items.find((n) => n.id === id);
                void call('/kl/notifications/read', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id }),
                }).then(async () => {
                    open = false;
                    await load();
                    if (found?.url) location.href = found.url;
                });
            });
        });
    }

    // 바깥을 누르면 닫힌다 — 열어 둔 채로 다른 걸 누르면 방해가 된다.
    document.addEventListener('click', (event) => {
        if (!open) return;
        if (slot.contains(event.target as Node)) return;
        open = false;
        paint();
    });

    KarmoAccount.subscribe(() => {
        paint();
        if (state.account && state.reachable) void load();
    });
    setInterval(() => {
        if (state.account && state.reachable && !open) void load();
    }, BELL_POLL_MS);
}

declare global {
    interface Window {
        KarmoAccount: typeof KarmoAccount;
    }
}

window.KarmoAccount = KarmoAccount;

watchLocalChanges();
window.addEventListener('hashchange', traceCurrentTool);
// 첫 화면 그리기와 겨루지 않게 뒤로 미룬다 — 계정은 급하지 않고 도구가 먼저다.
function start(): void {
    mountHeaderAccount();
    mountBell();
    void refresh();
    traceVisit();
    traceCurrentTool();
}
if (document.readyState === 'complete') start();
else window.addEventListener('load', start);

export {};
