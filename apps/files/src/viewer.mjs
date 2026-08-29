/**
 * 폴더와 파일을 오가는 것 담당. 스크롤 자리 기억, 다음과 이전, 키보드.
 *
 * 왜 따로 뺐나:
 * - 셋 다 폴더에서 파일로, 파일에서 폴더로 가는 한 흐름의 다른 얼굴
 * - 화면 그리는 쪽에 흩으면 하나 고칠 때 나머지가 조용히 어긋남
 *
 * 스크롤:
 * - `history.scrollRestoration = 'manual'` 로 브라우저 몫 끄고 직접 기록
 * - 해시로 폴더를 넘기므로 자동 복원은 엉뚱한 자리. 목록 길이가 폴더마다 다름
 * - SPA 통설도 manual 권장
 */

/** 폴더마다 마지막으로 본 높이. 화면 뜰 때까지만 사는 값 */
const seen = new Map();

/* 이 화면은 문서가 통째로 스크롤. `.app` 은 폭만 잡는 칸.
   안쪽 스크롤 칸이 생기면 아래 두 자리만 고치면 됨 */

export function armScrollMemory() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
}

/** 지금 높이를 이 폴더 이름으로 기록 */
export function rememberScroll(dir) {
    seen.set(dir ?? '', window.scrollY || document.documentElement.scrollTop || 0);
}

/**
 * 폴더 보는 동안 계속 기록. 반환값 호출하면 해제.
 *
 * 왜 이렇게까지:
 * - 파일 열 때 한 번만 적으면 0 이 적힘. 주소 바뀌는 순간 브라우저가 이미 꼭대기로 보냄
 * - 해시에 맞는 자리가 없으니 꼭대기행
 * - 실측 2026-08-29: 300 까지 내린 뒤 그림 열었다 닫으니 0
 */
export function watchScroll(dir) {
    let timer = 0;
    const on = () => {
        clearTimeout(timer);
        timer = setTimeout(() => rememberScroll(dir), 80);
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => {
        clearTimeout(timer);
        window.removeEventListener('scroll', on);
    };
}

/**
 * 기록해 둔 높이로 복원.
 *
 * - 그림이 늦게 오면 높이가 나중에 자람. 그래서 두 번 시도
 * - 한 번만 하면 돌아왔는데 조금 못 미치는 자리
 */
export function restoreScroll(dir) {
    const y = seen.get(dir ?? '');
    if (!y) return;
    const put = () => window.scrollTo(0, y);
    requestAnimationFrame(put);
    setTimeout(put, 220);
}

/** 이 폴더의 파일 차례. 화면이 그린 순서 그대로 받음 */
export function neighbors(paths, current) {
    const at = paths.indexOf(current);
    if (at < 0) return { prev: null, next: null, at: -1, total: paths.length };
    return {
        prev: at > 0 ? paths[at - 1] : null,
        next: at + 1 < paths.length ? paths[at + 1] : null,
        at,
        total: paths.length
    };
}

/**
 * 파일 화면 키보드. 반환값 호출하면 해제.
 * @param {{onPrev:()=>void,onNext:()=>void,onClose:()=>void}} on
 */
/**
 * 폴더 화면 키보드. 고르기가 켜져 있을 때만 뜻이 있다.
 *
 * 탐색기와 같은 자리: Ctrl+A 는 전부, Esc 는 그만두기.
 * 글자 치는 중에는 안 가로챈다. 이름 찾기 칸에서 Ctrl+A 는 글자 전체 고르기여야 한다.
 */
export function bindDirKeys(on, target) {
    const on1 = target ?? globalThis.window;
    const handler = (e) => {
        const tag = globalThis.document?.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            on.onAll();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            on.onEscape();
        }
    };
    on1.addEventListener('keydown', handler);
    return () => on1.removeEventListener('keydown', handler);
}

export function bindViewerKeys(on) {
    const handler = (e) => {
        /* 글자 치는 중이면 화살표는 그쪽 몫 */
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            on.onPrev();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            on.onNext();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            on.onClose();
        }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
}
