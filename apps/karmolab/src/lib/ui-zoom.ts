/**
 * 화면 배율(`html { zoom }`)과 마우스 좌표 맞추기
 *
 * - KarmoLab 은 1440x900 짜임 유지용 `documentElement.style.zoom` (toolbox.ts applyUiScale)
 * - `MouseEvent.clientX` 는 배율 적용 뒤 좌표, `style.left` px 는 배율 적용 전 값
 * - `left = clientX` 로 놓으면 실제로는 `clientX * zoom` 자리
 * - 실측 (Edge, 1200x800, zoom 0.7): 마우스 (600,400) -> `left:600px` 상자가 (420,280)
 * - 고침은 나눗셈 하나. 화면 좌표를 배율로 나눠 적기
 */

/**
 * 이 자리에 걸린 배율. 조상 `zoom` 전부 곱하기. 못 재면 1
 *
 * - rect.width / offsetWidth 방식은 안 씀
 * - 진입 애니메이션 `scale(.97)` 이 배율로 오독돼 마우스 x 의 3.4% 만큼 밀림 (실측)
 * - 계산된 `zoom` 은 애니메이션과 무관
 */
export function uiZoom(el: HTMLElement): number {
    if (typeof getComputedStyle !== 'function') return 1;
    let z = 1;
    for (let n: HTMLElement | null = el; n; n = n.parentElement) {
        const v = parseFloat(getComputedStyle(n).zoom || '1');
        if (v > 0) z *= v;
    }
    return z > 0 ? z : 1;
}

/**
 * `position:fixed` 요소를 마우스 자리에. 화면 밖이면 반대쪽으로 뒤집기
 *
 * - 크기 측정용. 미리 문서에 붙어 있어야 함
 */
export function placeAtPointer(el: HTMLElement, x: number, y: number, pad = 8): void {
    const box = el.getBoundingClientRect();
    /* 여기까지 전부 화면 좌표. clientX, innerWidth, box 모두 같은 자 */
    const left = x + box.width + pad > window.innerWidth ? Math.max(pad, x - box.width) : x;
    const top = y + box.height + pad > window.innerHeight ? Math.max(pad, y - box.height) : y;
    const z = uiZoom(el);
    el.style.left = `${left / z}px`;
    el.style.top = `${top / z}px`;
}
