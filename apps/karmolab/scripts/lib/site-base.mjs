/**
 * **앱이 사는 자리. 한 벌 (생성기 쪽)** (change.karmolab-at-root ①)
 *
 * 짝 = `src/lib/site-base.ts` (앱 쪽). 두 값이 어긋나면 `test:site-base` 가 선다.
 * 뜻, 규칙은 그쪽 머리말에 적혀 있다. 여기 복제하지 않는다.
 */

/** 앱 뿌리. 항상 `/` 로 시작하고 `/` 로 끝난다. */
export const APP_BASE = '/';

/** 사이트 주소 (canonical, og 에 쓴다). */
export const SITE_ORIGIN = 'https://blog.mascari4615.com';

/** 뿌리에서 이어 붙인 주소. `appPath('t/qr/')` → `/karmolab/t/qr/` */
export function appPath(rest = '') {
    return APP_BASE + String(rest).replace(/^\//, '');
}

/** 도구 상세 장. */
export function toolPage(id) {
    return appPath(`t/${id}/`);
}

/** 앱 안의 한 화면. */
export function appHash(id) {
    return `${APP_BASE}#${id}`;
}

/** 절대 주소. `appUrl('t/qr/')` → `https://blog.mascari4615.com/karmolab/t/qr/` */
export function appUrl(rest = '') {
    return SITE_ORIGIN + appPath(rest);
}

/**
 * **앱 뿌리 밑이지만 앱이 아닌 자리** (change.karmolab-at-root ②).
 *
 * 뿌리 이관 전에는 이 목록이 필요 없었다. 앱은 `/karmolab/` 안에만 살았고, 그 밖은 전부
 * 남의 자리였다. 뿌리로 올라오면 **모든 주소가 앱 범위 안**이 되므로, 앱이 아닌 자리를
 * 이름으로 적어 두어야 한다. 이게 없으면 서비스 워커가 글 장까지 앱 껍데기로 덮는다.
 *
 * 여기 없는 뿌리 밑 주소는 전부 앱 것이다 (`t/` `u/` `c/` `bot/` `wm/` `play/` `share/`).
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
export function isAppPath(pathname) {
    if (NON_APP_PREFIXES.some((x) => pathname === x || pathname.startsWith(x))) return false;
    return pathname === APP_BASE.slice(0, -1) || pathname.startsWith(APP_BASE);
}
