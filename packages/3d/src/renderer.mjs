/** 렌더러 기본값 한 곳. 페이지마다 톤매핑·색공간을 다시 적으면 페이지마다 색이 달라진다. */
import * as THREE from '../vendor/three.module.min.js';
import { gpuTier } from './gpu.mjs';

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{exposure?:number, maxPixelRatio?:number, tier?:object}} [opts]
 */
export function createRenderer(canvas, opts = {}) {
    const tier = opts.tier || gpuTier();
    const soft = tier.soft;
    const renderer = new THREE.WebGLRenderer({
        canvas, antialias: !soft, powerPreference: 'high-performance'
    });
    /* 화소 배율은 2 를 넘기지 않는다 — 2배로 그리면 값이 4배다. 소프트웨어면 아예 1. */
    renderer.setPixelRatio(soft ? 1 : Math.min(devicePixelRatio, opts.maxPixelRatio ?? 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts.exposure ?? 1.0;
    renderer.shadowMap.enabled = !soft;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    return { renderer, soft, tier, THREE };
}

/**
 * 그리기 바퀴. 소프트웨어일 때 **초당 24장으로 묶는다** — 안 묶으면 창이 조작에 응답하지 않는다.
 * @param {(t:number)=>void} draw
 */
export function loop(draw, { soft = false, fpsWhenSoft = 24 } = {}) {
    const gap = 1000 / fpsWhenSoft;
    let last = 0, alive = true;
    (function tick(t) {
        if (!alive) return;
        requestAnimationFrame(tick);
        if (soft && t - last < gap) return;
        last = t; draw(t);
    })(0);
    return () => { alive = false; };
}
