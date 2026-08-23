/** 캔버스로 굽는 텍스처 — 이미지 파일 0. 색공간·필터를 매번 다시 적지 않으려고 한 곳에 둔다. */
import * as THREE from '../vendor/three.module.min.js';

/**
 * @param {number} w @param {number} h
 * @param {(g:CanvasRenderingContext2D, w:number, h:number)=>void} draw
 * @param {{repeat?:number[], aniso?:number}} [o]
 */
export function canvasTex(w, h, draw, o = {}) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = o.aniso ?? 4;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...o.repeat); }
    return t;
}

/** 위에서 아래로 두 색이 흐르는 판 — 벽·하늘에 쓴다 (단색 벽은 3D 에서 종이처럼 보인다). */
export function gradientTex(top, bottom, steps = 256) {
    return canvasTex(4, steps, (g, w, h) => {
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, top); grd.addColorStop(1, bottom);
        g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
}
