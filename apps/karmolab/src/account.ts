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

declare global {
    interface Window {
        KarmoAccount: typeof KarmoAccount;
    }
}

window.KarmoAccount = KarmoAccount;

watchLocalChanges();
// 첫 화면 그리기와 겨루지 않게 뒤로 미룬다 — 계정은 급하지 않고 도구가 먼저다.
if (document.readyState === 'complete') void refresh();
else window.addEventListener('load', () => void refresh());

export {};
