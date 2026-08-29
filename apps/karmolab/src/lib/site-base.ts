/**
 * **앱이 사는 자리. 한 벌** (change.karmolab-at-root ①)
 *
 * 왜: 앱 주소 `/karmolab/` 가 773곳에 글자로 박혀 있었다. 뿌리로 옮기려면 그 전부를 손대야
 * 하는데, 손댈 때마다 몇 곳은 흘린다. 흘린 자리는 404 로만 드러난다.
 * 그래서 **주소를 만드는 자리는 전부 여기를 거친다**. 옮길 때 바뀌는 것은 아래 한 줄뿐이다.
 *
 * 짝: `scripts/lib/site-base.mjs` (정적 장 생성기 쪽). 두 값이 어긋나면 `test:site-base` 가 선다.
 *
 * 안 거치는 것:
 *  - 자산 경로 `/apps/karmolab/*`. 따로 나가는 트리다. 이 이관과 무관
 *  - 주석, 문서에 적힌 설명용 주소. 글자가 곧 뜻이다
 */

/** 앱 뿌리. 항상 `/` 로 시작하고 `/` 로 끝난다. */
export const APP_BASE = '/';

/** 뿌리에서 이어 붙인 주소. `appPath('t/qr/')` → `/karmolab/t/qr/` */
export function appPath(rest = ''): string {
    return APP_BASE + rest.replace(/^\//, '');
}

/** 도구 상세 장. `toolPage('qr')` → `/karmolab/t/qr/` */
export function toolPage(id: string): string {
    return appPath(`t/${encodeURIComponent(id)}/`);
}

/** 도구 전체 목록 장. */
export function toolIndexPath(): string {
    return appPath('t/');
}

/** 앱 안의 한 화면. `appHash('higher')` → `/karmolab/#higher` */
export function appHash(id: string): string {
    return `${APP_BASE}#${id}`;
}

/** 앱 안의 한 화면 + 물음표. `appQuery('p=3', 'community')` → `/karmolab/?p=3#community` */
export function appQuery(query: string, hash = ''): string {
    return `${APP_BASE}?${query}${hash ? `#${hash}` : ''}`;
}

/** 공개 프로필 장. `profilePath('karmo')` → `/karmolab/u/?h=karmo` */
export function profilePath(handle: string): string {
    return `${appPath('u/')}?h=${encodeURIComponent(handle)}`;
}

/**
 * **앱 뿌리 밑이지만 앱이 아닌 자리** (change.karmolab-at-root ②).
 * 짝 = `scripts/lib/site-base.mjs`. 뜻은 그쪽 머리말에 있다. `test:site-base` 가 목록 일치를 본다.
 */
export const NON_APP_PREFIXES = [
    '/posts/',
    '/works/',
    '/about/',
    '/daily/',
    '/files/',
    '/higher/',
    '/quest/',
    '/assets/',
    '/apps/',
    '/feed.xml',
    '/sitemap.xml',
    '/robots.txt',
    '/404.html',
];

/** 이 pathname 이 앱 것인가 (뿌리 자신 포함, 앱 아닌 자리 제외). */
export function isAppPath(pathname: string): boolean {
    if (NON_APP_PREFIXES.some((x) => pathname === x || pathname.startsWith(x))) return false;
    return pathname === APP_BASE.slice(0, -1) || pathname.startsWith(APP_BASE);
}

/**
 * 도구 상세 장 주소에서 도구 id 를 뽑는다. 그 장이 아니면 null.
 * `/karmolab/t/qr/` → `qr`, `/karmolab/` → null
 */
export function toolIdFromPath(pathname: string): string | null {
    if (!isAppPath(pathname)) return null;
    const rest = pathname.slice(APP_BASE.length);
    return /^t\/([a-z0-9][a-z0-9-]*)\/?$/.exec(rest)?.[1] ?? null;
}

/** 사이트 주소. 사람에게 보여 주거나 밖으로 나가는 링크에 쓴다. */
export const SITE_ORIGIN = 'https://blog.mascari4615.com';

/** 절대 주소. `appUrl('t/qr/')` → `https://blog.mascari4615.com/karmolab/t/qr/` */
export function appUrl(rest = ''): string {
    return SITE_ORIGIN + appPath(rest);
}

/** 도메인만 붙인 보여 주기용 주소 (`https://` 없이). `appHost()` → `blog.mascari4615.com/karmolab/` */
export function appHost(rest = ''): string {
    return SITE_ORIGIN.replace(/^https?:\/\//, '') + appPath(rest);
}
