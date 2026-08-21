/**
 * 이 기계가 그림을 **GPU 로** 그리는지 묻는다.
 *
 * 왜 필요한가 (2026-08-21 실측): 데스크톱 크롬이 `ANGLE (Microsoft Basic Render Driver)`,
 * 즉 **CPU 로** 그리고 있었다. 그 위에서 그림자 + 번짐을 켠 페이지는 한 프레임이 초 단위로
 * 늘어 **창이 통째로 멎었다** — 「느림」이 아니라 「안 열림」이다.
 *
 * 판단은 여기 한 곳에만 적는다. 페이지마다 다시 적으면 언젠가 한 곳이 빠지고,
 * 빠진 그 페이지가 누군가에겐 죽은 페이지가 된다.
 */

/** 소프트웨어 래스터라이저 이름들 — 실제로 만나 본 것만 적는다 (추측 X). */
export const SOFTWARE_RENDERER = /basic render|swiftshader|software|llvmpipe/i;

/**
 * @returns {{tier:'none'|'software'|'gpu', renderer:string, soft:boolean}}
 *   `soft` = 무거운 것(실시간 그림자·후처리)을 켜면 안 되는 상태.
 */
export function gpuTier() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        if (!gl) return { tier: 'none', renderer: '', soft: true };
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        /* 확장이 없으면 **모른다**. 모를 때는 안전한 쪽으로 — 덜 예쁜 게 안 열리는 것보다 낫다. */
        const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
        const soft = !name || SOFTWARE_RENDERER.test(name);
        return { tier: soft ? 'software' : 'gpu', renderer: name, soft };
    } catch (_) {
        return { tier: 'none', renderer: '', soft: true };
    }
}

/** 사람에게 보여 줄 한 줄 (안 켜지는 이유를 숨기지 않는다). */
export function gpuNote(tier) {
    const t = tier || gpuTier();
    if (t.tier === 'gpu') return '';
    if (t.tier === 'none') return '이 브라우저에서 WebGL 이 아예 안 열린다.';
    return `이 브라우저가 GPU 없이 그리고 있다 (${t.renderer || '알 수 없음'}) — 무거운 것을 껐다. chrome://gpu 확인.`;
}
