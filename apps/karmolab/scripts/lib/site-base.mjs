/**
 * **앱이 사는 자리 — 한 벌 (생성기 쪽)** (change.karmolab-at-root ①)
 *
 * 짝 = `src/lib/site-base.ts` (앱 쪽). 두 값이 어긋나면 `test:site-base` 가 선다.
 * 뜻·규칙은 그쪽 머리말에 적혀 있다 — 여기 복제하지 않는다.
 */

/** 앱 뿌리. 항상 `/` 로 시작하고 `/` 로 끝난다. */
export const APP_BASE = '/karmolab/';

/** 사이트 주소 (canonical·og 에 쓴다). */
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
