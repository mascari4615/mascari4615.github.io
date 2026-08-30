/**
 * 이 브라우저가 누구인지. 한 곳에서 (change.identity-one, karmolab.system.identity).
 *
 * 서버는 지금까지 `IP + User-Agent` 로 사람을 셌다. 그래서 같은 사람이 크롬과 엣지를 열면
 * 두 명이 됐고, 같은 카페의 두 사람은 한 명이 됐다. 지금 N명이 창 수를 세는 것처럼
 * 보이던 문제의 뿌리다.
 *
 * 고치는 자리는 **브라우저**다: 기기 id 를 여기서 만들어 들고 다닌다.
 *  ① 정본은 `localStorage`. 쿠키는 다른 도메인(yawnbot)이라 브라우저가 막을 수 있다.
 *  ② 우리 서버로 가는 요청에 `X-KL-Device` 를 자동으로 붙인다. 부르는 쪽은 아무것도 안 한다.
 *  ③ 서버가 쿠키로 심어 준 것이 있으면 그것을 이어받는다(저장소를 지운 뒤에도 같은 사람).
 *
 * 이것은 추적이 아니다. 사람을 **세기 위한** 표이고, 사람이 지우면 새 사람이 된다.
 */
const KEY = 'karmolab_device';
const HEADER = 'X-KL-Device';
const COOKIE = 'kl_device';

/** 서버가 아는 모양만 만든다(16~32자 소문자, 숫자). 서버도 같은 자로 잰다. */
function make(): string {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function valid(raw: string | null | undefined): raw is string {
    return !!raw && /^[a-z0-9]{16,32}$/.test(raw);
}

function fromCookie(): string | null {
    for (const part of document.cookie.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        if (part.slice(0, eq).trim() !== COOKIE) continue;
        const value = part.slice(eq + 1).trim();
        return valid(value) ? value : null;
    }
    return null;
}

let cached: string | null = null;

/** 이 브라우저의 기기 id. 없으면 만든다. 저장이 막혀 있으면 이번 창에서만 산다. */
export function deviceId(): string {
    if (cached) return cached;
    let saved: string | null = null;
    try {
        saved = localStorage.getItem(KEY);
    } catch {
        /* 저장이 막혀 있어도 이번 창에서는 같은 사람이다 */
    }
    if (!valid(saved)) saved = fromCookie();
    if (!valid(saved)) saved = make();
    cached = saved;
    try {
        localStorage.setItem(KEY, cached);
    } catch {
        /* 못 적어도 이번 창에서는 동작한다 */
    }
    return cached;
}

/**
 * 우리 서버로 가는 요청에 기기 id 를 붙인다.
 *
 * 부르는 곳이 69군데다. 거기마다 머리를 다는 것은 **다시 흩어지는 길**이다.
 * 그래서 문 하나에서 단다. 남의 서버로 가는 요청은 손대지 않는다(그쪽에 우리 표를 흘리면 안 된다).
 */
function attach(): void {
    const base =
        (window as { KARMOLAB_API_BASE?: string }).KARMOLAB_API_BASE || 'https://yawnbot.mascari4615.com';
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        let url = '';
        try {
            url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        } catch {
            return original(input, init);
        }
        if (!url.startsWith(base)) return original(input, init);
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
        headers.set(HEADER, deviceId());
        return original(input, { ...init, headers });
    };
}

/* ── 나는 누구로 보이나 (change.identity-one 3단계) ─────────────────
 *
 * 이름·색을 **화면이 만들지 않는다**. 서버 한 곳(`anonLabel`)이 정하고 여기서 받아 온다 —
 * 위젯마다 자기 규칙으로 이름을 지으면 같은 사람이 화면마다 다른 사람이 된다.
 */
export interface Me {
    deviceId: string;
    signedIn: boolean;
    handle: string | null;
    name: string;
    color: string;
    who: string;
}

let me: Me | null = null;
let asking: Promise<Me | null> | null = null;
const watchers = new Set<(me: Me | null) => void>();

function apiBase(): string {
    return (window as { KARMOLAB_API_BASE?: string }).KARMOLAB_API_BASE || 'https://yawnbot.mascari4615.com';
}

/** 지금 아는 나. 아직 안 물어봤으면 null 을 주고 뒤에서 물어본다(화면을 안 막는다). */
function current(): Me | null {
    if (!me && !asking) void refresh();
    return me;
}

/** 서버에 다시 묻는다 — 로그인·로그아웃 뒤에 부른다. */
async function refresh(): Promise<Me | null> {
    if (asking) return asking;
    asking = fetch(`${apiBase()}/kl/me/who`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: Me | null) => {
            me = data;
            for (const fn of watchers) fn(me);
            return me;
        })
        .catch(() => null)
        .finally(() => {
            asking = null;
        });
    return asking;
}

/** 내가 누구인지 바뀌면 알려 준다(로그인·날짜 넘김). 돌려받은 함수를 부르면 그만 듣는다. */
function onChange(fn: (me: Me | null) => void): () => void {
    watchers.add(fn);
    if (me) fn(me);
    return () => watchers.delete(fn);
}

declare global {
    interface Window {
        KarmoId: {
            deviceId: typeof deviceId;
            me: typeof current;
            refresh: typeof refresh;
            onChange: typeof onChange;
        };
    }
}

attach();
window.KarmoId = { deviceId, me: current, refresh, onChange };
// 로그인·로그아웃하면 이름이 바뀐다 — 계정 쪽이 알려 주면 다시 묻는다.
(window as unknown as { KarmoAccount?: { subscribe?: (fn: () => void) => void } }).KarmoAccount?.subscribe?.(
    () => void refresh(),
);
void refresh();

export {};
