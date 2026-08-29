/**
 * 구글 연동. 토큰 한 장 받아 오기 (TASK-KL-321)
 *
 * React 판은 `@react-oauth/google` 이 하던 일이다. 그 꾸러미가 실제로 하는 것은
 * 구글이 주는 `gsi/client` 스크립트를 불러 `initTokenClient` 를 부르는 것뿐이라,
 * React 를 걷어 내면서 여기로 옮겼다. 받아 오는 코드가 오히려 줄었다.
 *
 * 알아 둘 것: 브라우저만으로는 **갱신 토큰을 받을 수 없다**. 구글이 주는 것은 한 시간짜리
 * 접근 토큰 한 장이고, 그래서 한 시간 뒤에는 다시 눌러야 한다. 새로고침만으로 안 풀리는
 * 문제가 아니라 규약이 그렇다. 진짜로 계속 유지하려면 서버가 갱신 토큰을 들고 있어야 한다
 * (`kl/auth/*` 에 얹는 별도 작업). 지금은 **한 시간 안에는 새로고침해도 유지**된다.
 */

declare const __KARMOLAB_GOOGLE_CLIENT_ID__: string;

/** 빌드할 때 박아 넣는다. 구글 클라이언트 id 는 공개값이라 번들에 있어도 된다. */
export const GOOGLE_CLIENT_ID: string =
    typeof __KARMOLAB_GOOGLE_CLIENT_ID__ === 'string' ? __KARMOLAB_GOOGLE_CLIENT_ID__ : '';

const TOKEN_KEY = 'karmolab_google_token';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/tasks'
].join(' ');

interface StoredToken {
    access_token: string;
    expires_at: number;
}

interface TokenClient {
    requestAccessToken: (opts?: { prompt?: string }) => void;
}

interface GisNamespace {
    accounts: {
        oauth2: {
            initTokenClient: (cfg: {
                client_id: string;
                scope: string;
                callback: (res: { access_token?: string; expires_in?: number; error?: string }) => void;
            }) => TokenClient;
            revoke?: (token: string, done?: () => void) => void;
        };
    };
}

function gis(): GisNamespace | undefined {
    return (window as unknown as { google?: GisNamespace }).google;
}

/** 남은 시간이 5분보다 적으면 없는 것으로 친다. 쓰다가 중간에 끊기는 게 더 나쁘다. */
export function storedToken(): string | null {
    try {
        const raw = localStorage.getItem(TOKEN_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw) as StoredToken;
        if (data.expires_at > Date.now() + 300000) return data.access_token;
        localStorage.removeItem(TOKEN_KEY);
    } catch {
        localStorage.removeItem(TOKEN_KEY);
    }
    return null;
}

function storeToken(token: string, expiresInSec: number): void {
    try {
        const data: StoredToken = { access_token: token, expires_at: Date.now() + expiresInSec * 1000 };
        localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
    } catch {
        /* 저장을 못 해도 이번 세션에는 쓸 수 있다 */
    }
}

export function forgetToken(): void {
    const token = storedToken();
    try {
        localStorage.removeItem(TOKEN_KEY);
    } catch {
        /* 무시 */
    }
    /* 구글 쪽 허가도 같이 거둔다. 안 그러면 로그아웃이 이 브라우저에서만 참이다 */
    if (token) gis()?.accounts.oauth2.revoke?.(token);
}

let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
    if (gis()) return Promise.resolve();
    if (gisLoading) return gisLoading;
    gisLoading = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('gsi load failed')));
            return;
        }
        const script = document.createElement('script');
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('gsi load failed'));
        document.head.appendChild(script);
    });
    return gisLoading;
}

/**
 * 연동 창을 띄우고 토큰을 받는다. 이미 유효한 토큰이 있으면 그걸 그대로 준다.
 * 사용자가 창을 닫으면 `null`. 그건 오류가 아니라 안 하겠다다.
 */
export async function requestToken(): Promise<string | null> {
    if (!GOOGLE_CLIENT_ID) throw new Error('no-client-id');
    const existing = storedToken();
    if (existing) return existing;

    await loadGis();
    const oauth2 = gis()?.accounts.oauth2;
    if (!oauth2) throw new Error('gsi-unavailable');

    return new Promise<string | null>((resolve) => {
        const client = oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: (res) => {
                if (res.error || !res.access_token) {
                    resolve(null);
                    return;
                }
                storeToken(res.access_token, res.expires_in ?? 3600);
                resolve(res.access_token);
            }
        });
        client.requestAccessToken();
    });
}
