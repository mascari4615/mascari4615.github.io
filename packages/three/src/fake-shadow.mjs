/**
 * 가짜 접지 그림자 — 물건이 바닥에 **닿아 있다**는 것만 알려 주는 어두운 원.
 *
 * 실시간 그림자 없이 화면을 살리는 가장 싼 수. GPU 가 없는 기계에서도 값이 0 에 가깝고,
 * 있어도 그림자 맵 한 장을 아낀다. 물건마다 하나씩 깔면 「떠 있는 느낌」이 사라진다.
 */
import * as THREE from '../vendor/three.module.min.js';

let sharedTex = null;
function blobTexture() {
    if (sharedTex) return sharedTex;
    const size = 128, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grd.addColorStop(0,   'rgba(0,0,0,0.85)');
    grd.addColorStop(0.45,'rgba(0,0,0,0.45)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, size, size);
    sharedTex = new THREE.CanvasTexture(c);
    return sharedTex;
}

/**
 * @param {number} size 지름(미터)
 * @param {number} [opacity]
 * @returns {THREE.Mesh} 바닥에 눕혀 놓은 판. `position` 으로 물건 밑에 두면 된다.
 */
export function contactShadow(size, opacity = 0.5) {
    const m = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
            map: blobTexture(), transparent: true, opacity,
            depthWrite: false, toneMapped: false
        })
    );
    m.rotation.x = -Math.PI / 2;
    m.renderOrder = -1;                /* 바닥 무늬 위에, 물건 아래 */
    return m;
}

/** 벽에 붙는 세로판 그림자 (간판·액자 밑). */
export function wallShadow(w, h, opacity = 0.45) {
    const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity,
            depthWrite: false, toneMapped: false })
    );
    m.renderOrder = -1;
    return m;
}
