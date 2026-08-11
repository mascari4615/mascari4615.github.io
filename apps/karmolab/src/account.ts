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
import { stampToday } from './stamps';
import { t, loadNamespace } from './lib/i18n';

const esc = (v: unknown): string =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

/**
 * 어디에 붙을까. 기본은 노트북의 그 서버다.
 *
 * `window.KARMOLAB_API_BASE` 를 두면 그쪽으로 붙는다 — 로컬에서 봇을 띄워 놓고 이 화면을 그
 * 봇에 붙이는 길이다(TASK-KL-181). 이게 없으면 계정이 걸린 기능은 **배포해야만** 확인할 수
 * 있고, 그건 확인 루프가 없는 것과 같다. 같이 쓰기(copresence)도 같은 손잡이를 쓴다.
 */
const API_BASE =
    (typeof window !== 'undefined' && (window as { KARMOLAB_API_BASE?: string }).KARMOLAB_API_BASE) ||
    'https://yawnbot.mascari4615.com';
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

/**
 * 지금 보고 있는 값이 낡았나 (TASK-KL-183 F).
 *
 * 서버에 못 닿을 때 서비스 워커가 받아 둔 값을 대신 내주는데, 그것을 **새 값인 척** 두면
 * 그건 고장이 아니라 거짓말이 된다. 한 줄로 말해 준다.
 */
function noteStale(response: Response): void {
    if (!response.headers.has('X-KL-Stale')) return;
    if (document.getElementById('kl-stale-note')) return;
    const note = document.createElement('div');
    note.id = 'kl-stale-note';
    note.textContent = t('account.t04');
    note.style.cssText =
        'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:64;' +
        'padding:8px 14px;border-radius:999px;font-size:12px;' +
        'background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-secondary);' +
        'box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:92vw;text-align:center';
    document.body.appendChild(note);
    setTimeout(() => note.remove(), 8000);
}

/**
 * 서버에 못 닿은 채 열렸다 (TASK-KL-191 축8).
 *
 * 도구는 전부 브라우저 안에서 도니까 **끊겨도 대부분 그대로 쓴다**. 그런데 아무 말이 없으면
 * 사람은 로그인·광장이 안 뜨는 것을 고장으로 읽고 창을 닫는다. 무엇이 되고 무엇이 안 되는지를
 * 한 줄로 말해 주는 것이 「오프라인 지원」의 절반이다.
 *
 * **`navigator.onLine` 은 안 믿는다** — 실측(2026-08-08): 회선을 끊어 놓고도 `true` 였다.
 * 원래 그 값은 「그물에 꽂혀 있나」지 「닿을 수 있나」가 아니다(공유기만 살아 있어도 참이다).
 * 우리가 아는 유일한 진실은 **실제로 못 닿았다**는 사실뿐이라, 그것을 신호로 쓴다.
 */
function offlineNote(show: boolean): void {
    const ID = 'kl-offline-note';
    const paint = (): void => {
        const existing = document.getElementById(ID);
        if (!show) {
            existing?.remove();
            return;
        }
        if (existing) return;
        const note = document.createElement('div');
        note.id = ID;
        note.textContent = t('account.t05');
        note.style.cssText =
            'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:64;' +
            'padding:8px 14px;border-radius:999px;font-size:12px;' +
            'background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-secondary);' +
            'box-shadow:0 6px 18px rgba(0,0,0,.3);max-width:92vw;text-align:center';
        document.body.appendChild(note);
    };
    if (document.body) paint();
    else document.addEventListener('DOMContentLoaded', paint, { once: true });
}

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            ...init,
            // 쿠키로 로그인을 유지한다. 이게 없으면 매 요청이 남남이 된다.
            credentials: 'include',
            signal: controller.signal,
        });
        noteStale(response);
        return response;
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
            console.warn(t('account.t06'), error);
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
    /* 머리띠의 계정 자리도 첫 화면이다 — 스스로 말 묶음을 받고 그린다. */
    await loadNamespace('account');
    const response = await call('/kl/me');
    state.loading = false;
    if (!response || !response.ok) {
        state.reachable = false;
        state.account = null;
        // 못 닿았다는 **사실**이 유일하게 믿을 수 있는 신호다 (TASK-KL-191 축8)
        offlineNote(true);
        emit();
        return;
    }
    state.reachable = true;
    offlineNote(false);
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
    /**
     * 패스키로 로그인 (TASK-KL-156 D7).
     *
     * 누구인지 먼저 안 묻는다 — 기기가 자기가 가진 열쇠를 고르고, 서버가 그 열쇠로 계정을 찾는다.
     * 이 브라우저가 패스키를 모르면 애초에 이 단추가 안 그려진다.
     */
    async signInWithPasskey(): Promise<boolean> {
        try {
            const start = await call('/kl/auth/passkey/challenge', { method: 'POST' });
            if (!start || !start.ok) return false;
            const options = (await start.json()) as { key: string; challenge: string; rpId: string };
            /* 반환형을 `Uint8Array<ArrayBuffer>` 로 못 박는다.
             * 기본형(`Uint8Array<ArrayBufferLike>`)은 공유 버퍼일 수도 있다고 보여서
             * `BufferSource` 자리에 못 넣는다 — 타입 검사가 통째로 빨개진다(TS 5.7+). */
            const toBytes = (value: string): Uint8Array<ArrayBuffer> => {
                const padded = value.replace(/-/g, '+').replace(/_/g, '/');
                const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
                const bytes = new Uint8Array(new ArrayBuffer(raw.length));
                for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
                return bytes;
            };
            const toB64url = (buffer: ArrayBuffer): string => {
                let binary = '';
                new Uint8Array(buffer).forEach((b) => {
                    binary += String.fromCharCode(b);
                });
                return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            };
            const got = (await navigator.credentials.get({
                publicKey: {
                    challenge: toBytes(options.challenge),
                    rpId: options.rpId,
                    userVerification: 'preferred',
                    timeout: 120000,
                },
            })) as PublicKeyCredential | null;
            if (!got) return false;
            const response = got.response as AuthenticatorAssertionResponse;
            const done = await call('/kl/auth/passkey', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    key: options.key,
                    id: got.id,
                    clientDataJSON: toB64url(response.clientDataJSON),
                    authenticatorData: toB64url(response.authenticatorData),
                    signature: toB64url(response.signature),
                }),
            });
            if (!done || !done.ok) return false;
            await refresh();
            return true;
        } catch {
            return false;
        }
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
    if (hash === 'home' || hash === 'user' || hash === 'settings' || hash === 'linktree' || hash === 'plaza') return null;
    return hash;
}

/**
 * 다녀갔다고 한 번 알린다 (블로그의 Total / Today 와 같은 것).
 *
 * 도구 열림과 따로 세는 이유: 첫 화면만 보고 나간 사람도 다녀간 사람이다. 도구 열림만 세면
 * 첫 화면은 영원히 아무도 안 온 곳이 된다. 화면을 옮길 때마다 보내지 않고 **한 번만** 보낸다 —
 * 서버도 30분에 한 번만 세지만, 안 보내는 편이 낫다.
 */
/**
 * 숫자를 실어 보낼 **자격**이 되나 (TASK-KL-201 후속).
 *
 * 방문 알림은 화면이 뜨자마자 한 번 나간다 — 그때는 「첫 그림」도 「큰 그림」도 아직 없다.
 * 그 반쪽 판까지 서버에 세면 분포가 **실제보다 좋아 보인다**(빈 칸은 안 세이니 남는 건 빠른
 * 값뿐이다). 실측으로 그 반쪽이 먼저 나가는 것을 보고 막았다.
 * 그래서 숫자는 **큰 그림이 정해진 뒤**에만 싣는다. 그 전 알림은 지금까지처럼 빈 몸으로 간다.
 */
function perfWorthSending(snap: { paint?: { lcp: number | null } } | undefined): boolean {
    return typeof snap?.paint?.lcp === 'number';
}

function traceVisit(): void {
    /* 다녀갔다고 알리는 김에 **이 기기에서 잰 숫자**를 같이 보낸다 (TASK-KL-201 후속).
     *
     * 왜: 지금까지 성능은 전부 **만든 사람 기계**에서만 쟀다. 진짜 사람이 자기 폰으로 열 때
     * 몇 초인지는 아무도 모른다 — 추측으로 고쳐 왔다. 계기판이 이미 재 둔 값이 있으니,
     * 이미 보내는 이 한 번에 얹으면 **새 요청 0**으로 현실을 알 수 있다.
     *
     * 무엇을 안 보내나: 누구인지·무엇을 봤는지·글자 한 자도 안 보낸다. 시간과 크기, 그리고
     * 기기 성격(코어 수·화면 폭·회선 종류)뿐이다. 못 잰 값은 **0 이 아니라 빠진 채**로 간다.
     * 못 믿을 판(안 보이는 탭에서 열림 등)은 아예 안 보낸다 — 섞이면 분포가 거짓이 된다.
     *
     * 계측기가 없거나(옛 판) 아직 준비 전이면 그냥 지금까지처럼 빈 몸으로 간다. */
    let body: string | undefined;
    try {
        const perf = window.KLPerf;
        const snap = perf?.snapshot() as
            | { trust?: { ok?: boolean }; nav?: Record<string, number | null>; paint?: { fcp: number | null; lcp: number | null }; cls?: number | null; inp?: number | null; marks?: Array<{ name: string; at: number }>; device?: Record<string, unknown> }
            | undefined;
        if (snap?.trust?.ok && perfWorthSending(snap)) {
            const round = (v: unknown): number | undefined =>
                typeof v === 'number' && isFinite(v) ? Math.round(v) : undefined;
            const device = snap.device || {};
            body = JSON.stringify({
                perf: {
                    ready: round(snap.marks?.find((m) => m.name === 'shell:ready')?.at),
                    ttfb: round(snap.nav?.ttfb),
                    fcp: round(snap.paint?.fcp),
                    lcp: round(snap.paint?.lcp),
                    inp: round(snap.inp),
                    cls: typeof snap.cls === 'number' ? Math.round(snap.cls * 1000) / 1000 : undefined,
                    cores: round(device.cores),
                    width: round(window.innerWidth),
                    net: typeof device.net === 'string' ? device.net : undefined,
                },
            });
        }
    } catch {
        /* 숫자를 못 만들어도 **방문 알림은 그대로 간다** — 곁다리가 본래 일을 막으면 안 된다. */
    }
    void call('/kl/trace/visit', {
        method: 'POST',
        ...(body ? { body, headers: { 'Content-Type': 'application/json' } } : {}),
    });
}

/**
 * 숫자를 **한 박자 뒤에** 보낸다 (TASK-KL-201 후속).
 *
 * 방문 알림은 화면이 뜨자마자 나간다. 그런데 그 시점엔 「제일 큰 그림」도 「제일 굼뜬 조작」도
 * 아직 안 정해져 있다 — 그대로 보내면 그 두 칸이 영원히 빈 분포가 쌓인다.
 * 그래서 방문 세는 일은 지금 그대로 두고, **숫자만** 한가해진 뒤에 한 번 더 얹어 보낸다.
 * 사람이 그새 창을 닫으면 그 판은 안 온다 — 그건 정상이다(억지로 붙잡지 않는다).
 */
function traceVisitPerfLater(): void {
    const send = (): void => {
        try {
            const perf = window.KLPerf;
            if (!perf) return;
            traceVisit();
        } catch {
            /* 곁다리가 본래 일을 막지 않는다. */
        }
    };
    const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void })
        .requestIdleCallback;
    const run = (): void => {
        setTimeout(send, 4000);
    };
    if (idle) idle(run, { timeout: 6000 });
    else run();
}

/** 「지금 보고 있어요」를 얼마나 자주 알릴지. 서버는 5분 창으로 센다. */
const PRESENCE_PING_MS = 90_000;

/**
 * 지금 이 화면을 보고 있다고 알린다.
 *
 * 누적 방문 수는 과거를 말하고, 이것만이 **지금**을 말한다 — 「나 말고도 누가 있다」는
 * 그 수 하나로 전해진다.
 *
 * 탭이 뒤로 가 있으면 안 보낸다. 열어 두고 잊은 창까지 「보고 있는 사람」으로 세면
 * 그 수는 곧 아무 뜻이 없어진다.
 */
function startPresence(): void {
    const ping = () => {
        if (document.visibilityState !== 'visible') return;
        void call('/kl/presence', { method: 'POST' });
    };
    ping();
    setInterval(ping, PRESENCE_PING_MS);
    // 다시 앞으로 오면 바로 한 번 — 5분 창 밖으로 밀려나 있었을 수 있다.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') ping();
    });
}

/** 한 번 알린 도구는 이 화면에서 다시 안 알린다 (서버도 한 번 더 거르지만, 안 보내면 더 낫다). */
const tracedTools = new Set<string>();

function traceCurrentTool(): void {
    const toolId = currentToolId();
    if (!toolId || tracedTools.has(toolId)) return;
    tracedTools.add(toolId);
    /* 도감 도장도 여기서 찍는다 (TASK-KL-196) — 「도구를 열었다」의 판정은 이 함수 하나뿐이다.
       도감이 따로 세기 시작하면 그날부터 서버 발자국과 도감이 다른 말을 한다. */
    stampToday(toolId);
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

    /* 이 캡슐의 모양은 셸 CSS(css/toolbox.css § 계정 캡슐)에 있다 — 화면(index.html)에
     * 기본 캡슐이 박혀 있어서, 스타일이 이 파일에 있으면 account.js 가 오기 전까지 맨몸으로 보인다. */

    /* 아바타를 누르면 메뉴가 열린다 (TASK-KL-139).
     *
     * 예전에는 누르면 곧장 「내 정보」로 갔다. 그래서 **로그아웃하는 길이 화면 안쪽 한 곳뿐**이었다 —
     * 계정이 있는 사이트에서 로그아웃은 어느 화면에서든 두 번 눌러 닿아야 한다(GitHub·Discord 둘 다
     * 아바타 메뉴에 둔다). 환경 설정도 여기 둔다: 「나」에서 떼어 낸 화면이라 갈 길이 있어야 한다. */
    let menuOpen = false;

    /** 로그인 전에도 쓰는 얼굴 자리 — 화면(index.html)에 박아 둔 것과 같은 모양이어야 한다. */
    const BLANK_FACE =
        '<span class="header-account-blank">' +
        '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/>' +
        '<path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg></span>';

    /** 지금 보고 있는 화면이 「내 정보」면 캡슐을 켠다 — 다시 그릴 때마다 도로 꺼지지 않게 여기서도 건다. */
    const markActivePage = (): void => {
        const button = slot.querySelector('.header-account-btn');
        if (!button) return;
        button.classList.toggle('active', !!document.getElementById('page-user')?.classList.contains('active'));
    };

    const paint = (state: AccountState): void => {
        /* 서버에 못 닿아도 **단추는 남는다** (사용자 요청 「통합」).
         * 이 캡슐이 곧 「내 정보」 단추라, 비우면 내 정보로 가는 길이 통째로 사라진다.
         * 계정과 무관한 것(내 정보·환경 설정)만 메뉴에 남기고, 계정 것은 안 그린다 —
         * 눌러도 아무 일 없는 단추를 안 만든다는 원칙은 그대로다. */
        const me = state.loading ? null : state.account;
        const canAccount = !state.loading && state.reachable;
        const avatar = me ? KarmoAccount.avatarUrl(me.avatarPath) : null;
        const label = me ? me.displayName.replace(/[<>&"]/g, '') : t('account.t01');

        slot.innerHTML = `
            <button type="button" class="header-account-btn" id="klHeaderMe" title="${me ? t('account.t07') : t('account.t01')}"
                    aria-haspopup="menu" aria-expanded="${menuOpen}">
                ${avatar ? `<img src="${avatar}" alt="">` : BLANK_FACE}
                <span class="header-account-name">${label}</span>
            </button>` +
            (menuOpen
                ? `<div class="header-account-menu" role="menu">
                       <button type="button" role="menuitem" data-go="user">${esc(t('account.t01'))}</button>
                       ${me ? `<a role="menuitem" href="${me.profileUrl}">${esc(t('account.t02'))}</a>` : ''}
                       <button type="button" role="menuitem" data-go="settings">${esc(t('account.t03'))}</button>
                       ${me ? t('account.t08') : ''}
                       ${!me && canAccount ? t('account.t09') : ''}
                       ${!me && canAccount && typeof window.PublicKeyCredential !== 'undefined'
                           ? t('account.t10')
                           : ''}
                   </div>`
                : '');
        slot.querySelector('[data-signin]')?.addEventListener('click', () => KarmoAccount.signIn());
        slot.querySelector('[data-passkey-in]')?.addEventListener('click', () => {
            void KarmoAccount.signInWithPasskey();
        });
        markActivePage();

        slot.querySelector('#klHeaderMe')?.addEventListener('click', (event) => {
            /* 이 클릭이 문서까지 올라가면 **바로 아래 「바깥 클릭이면 닫는다」가 자기 자신을 닫는다**.
             * 다시 그리면서 눌린 단추가 문서에서 떨어져 나가, 그 검사에는 「바깥」으로 보이기 때문이다.
             * (실측: 메뉴가 열렸다가 같은 클릭에 도로 닫혀 영영 안 보였다.) */
            event.stopPropagation();
            menuOpen = !menuOpen;
            paint(state);
        });
        slot.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((button) => {
            button.addEventListener('click', () => {
                menuOpen = false;
                Toolbox?.switchPage?.(button.dataset.go ?? 'user');
                paint(state);
            });
        });
        slot.querySelector('[data-signout]')?.addEventListener('click', () => {
            menuOpen = false;
            void KarmoAccount.signOut();
        });
    };

    // 바깥을 누르면 닫힌다 — 열어 둔 채로 다른 걸 누르면 방해가 된다.
    document.addEventListener('click', (event) => {
        if (!menuOpen) return;
        if (slot.contains(event.target as Node)) return;
        menuOpen = false;
        paint(state);
    });

    KarmoAccount.subscribe(paint);
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
    if (minutes < 1) return t('account.t11');
    if (minutes < 60) return t('account.minsAgo', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('account.hoursAgo', { n: hours });
    return t('account.daysAgo', { n: Math.floor(hours / 24) });
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
        // 「어디로 받을 것인가」 (KL-157). 목록 아래에 붙여 알림을 볼 때마다 눈에 들어오게.
        '.kl-bell-dm { display:block; width:100%; padding:9px 12px; border:none; border-top:1px solid var(--border);',
        '  background:transparent; color:var(--text-tertiary); font:inherit; font-size:12px; text-align:left; cursor:pointer; }',
        '.kl-bell-dm:hover { color:var(--text-primary); }',
        '.kl-bell-dm[data-on="1"] { color:var(--accent); }',
        // 갈래 고르기 + 지난 것 더 보기 (TASK-KL-191 축7)
        '.kl-bell-tabs { display:flex; gap:4px; padding:8px 12px; border-bottom:1px solid var(--border); flex-wrap:wrap; }',
        '.kl-bell-tab { padding:3px 9px; border-radius:999px; border:1px solid var(--border); background:transparent;',
        '  color:var(--text-tertiary); font:inherit; font-size:11px; cursor:pointer; }',
        '.kl-bell-tab[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); }',
        '.kl-bell-more { display:block; width:100%; padding:9px 12px; border:0; border-top:1px solid var(--border);',
        '  background:transparent; color:var(--text-tertiary); font:inherit; font-size:11px; cursor:pointer; }',
        '.kl-bell-more:hover { color:var(--text-primary); }',
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
    /** 알림을 디스코드로도 받고 있나 (TASK-KL-157). 켤 수 없는 계정이면 칸을 안 만든다. */
    let discordOn = false;
    let discordAvailable = false;

    /* 받은함 (TASK-KL-191 축7) — 갈래로 걸러 보고, 지난 것도 볼 수 있다.
     * 서른 개만 보이던 시절엔 그 앞의 알림이 **없는 것**이 됐다. 「나중에 볼게」가 안 되면
     * 그건 받은함이 아니라 종소리다. */
    let bucket = '';
    let limit = 30;
    let buckets: Record<string, number> = {};

    const load = async (): Promise<void> => {
        const query = `?limit=${limit}${bucket ? `&bucket=${encodeURIComponent(bucket)}` : ''}`;
        const response = await call(`/kl/notifications${query}`);
        if (!response || !response.ok) return;
        try {
            const data = (await response.json()) as {
                items?: NotificationItem[];
                unread?: number;
                buckets?: Record<string, number>;
                discord?: boolean;
                discordAvailable?: boolean;
            };
            items = data.items ?? [];
            unread = data.unread ?? 0;
            buckets = data.buckets ?? {};
            discordOn = data.discord === true;
            discordAvailable = data.discordAvailable === true;
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
            : t('account.t12');

        /* 「어디로 받을 것인가」를 알림을 보는 자리에 둔다 (TASK-KL-157).
           종은 사이트 안에서만 울린다 — 사이트를 안 열고 있으면 그 알림은 없는 것과 같다.
           설정 화면 깊숙이 두면 이 스위치가 있다는 것 자체를 아무도 모른다. */
        const discordRow = discordAvailable
            ? `<button type="button" class="kl-bell-dm" id="klBellDm" data-on="${discordOn ? '1' : '0'}">` +
              `${discordOn ? '☑' : '☐'} ${esc(t('account.alsoDiscord'))}</button>`
            : '';

        /* 갈래 줄 — 사람이 켜고 끄는 갈래와 **같은 이름**이어야 한다. 여기만 다른 말을 쓰면
         * 「community 를 껐는데 왜 커뮤니티 알림이 오지」가 된다. */
        const TABS: Array<[string, string]> = [
            ['', t('account.t13')],
            ['community', t('account.t14')],
            ['follow', t('account.t15')],
            ['system', t('account.t16')],
        ];
        const tabs = items.length || bucket
            ? `<div class="kl-bell-tabs">${TABS.map(([key, label]) => {
                  const n = key ? (buckets[key] ?? 0) : unread;
                  return (
                      `<button type="button" class="kl-bell-tab" data-bucket="${key}" ` +
                      `aria-pressed="${bucket === key ? 'true' : 'false'}">${label}${n ? ` ${n}` : ''}</button>`
                  );
              }).join('')}</div>`
            : '';
        /* 「더 보기」는 **받은 만큼 찼을 때만** 뜬다 — 다 보여 준 뒤에도 뜨면 눌러도 아무 일이 없다. */
        const more = items.length >= limit && limit < 100
            ? t('account.t17')
            : '';

        const panel = open
            ? `<div class="kl-bell-panel"><div class="kl-bell-head"><span>${esc(t('account.title.klBell'))}</span>${
                  unread ? t('account.t18') : ''
              }</div>${tabs}${list}${more}${discordRow}</div>`
            : '';

        slot!.innerHTML =
            `<button type="button" class="kl-bell-btn" id="klBell" title="${esc(t('account.title.klBell'))}" aria-label="${esc(t('account.title.klBell'))}">` +
            `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" ` +
            `stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>` +
            `<path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>` +
            (unread ? `<span class="kl-bell-dot">${unread > 99 ? '99+' : unread}</span>` : '') +
            `</button>${panel}`;

        slot!.querySelector('#klBell')?.addEventListener('click', (event) => {
            // 같은 이유로 여기서도 막는다 — 안 막으면 아래 「바깥 클릭이면 닫는다」가 이 클릭을
            // 바깥으로 보고 방금 연 것을 도로 닫는다 (다시 그리면서 눌린 단추가 떨어져 나가므로).
            event.stopPropagation();
            open = !open;
            paint();
            if (open) void load();
        });
        slot!.querySelector('#klBellDm')?.addEventListener('click', (event) => {
            // 종 패널 안의 클릭이므로 바깥 클릭으로 새어 나가면 방금 연 패널이 닫힌다.
            event.stopPropagation();
            const next = !discordOn;
            discordOn = next; // 누른 자리에서 바로 바뀐다 — 서버 확인은 뒤에서.
            paint();
            void call('/kl/notifications/discord', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ on: next }),
            }).then((response) => {
                if (response && response.ok) return;
                discordOn = !next; // 못 바꿨으면 되돌린다. 껐다고 믿는데 계속 오면 그게 제일 나쁘다.
                paint();
            });
        });
        slot!.querySelectorAll<HTMLButtonElement>('.kl-bell-tab').forEach((button) => {
            button.addEventListener('click', (event) => {
                // 패널 안의 클릭이다 — 안 막으면 「바깥 클릭이면 닫는다」가 패널을 닫는다.
                event.stopPropagation();
                bucket = button.dataset.bucket ?? '';
                limit = 30; // 갈래를 바꾸면 처음부터 — 앞 갈래에서 늘려 둔 수가 따라오면 안 된다
                void load();
            });
        });
        slot!.querySelector('#klBellMore')?.addEventListener('click', (event) => {
            event.stopPropagation();
            limit = 100;
            void load();
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
async function start(): Promise<void> {
    await loadNamespace('account');
    mountHeaderAccount();
    mountBell();
    void refresh();
    traceVisit();
    traceVisitPerfLater();
    startPresence();
    traceCurrentTool();
}
if (document.readyState === 'complete') void start();
else window.addEventListener('load', () => { void start(); });

export {};
