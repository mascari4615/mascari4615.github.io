/**
 * 방 조명 한 벌.
 *
 * 지침 (레퍼런스 조사 2026-08-21): **하늘/땅 두 색 채움 + 약한 주광 + 국소 따뜻한 빛**.
 * HemisphereLight 는 그림자를 안 만들고 값이 거의 0 인데, 위아래로 색이 갈려서
 * 빛이 어디서 오는지가 보인다. 소프트웨어 렌더에서 화면을 살리는 것이 이것이다.
 * 실시간 그림자는 **마지막에** 켠다(GPU 있을 때만).
 */
import * as THREE from '../vendor/three.module.min.js';

/**
 * @param {THREE.Scene|THREE.Object3D} scene
 * @param {{sky?:number, ground?:number, key?:number, keyPos?:number[],
 *          warm?:number, warmPos?:number[], warmPower?:number, soft?:boolean}} [o]
 */
export function roomLight(scene, o = {}) {
    const hemi = new THREE.HemisphereLight(o.sky ?? 0x9fb6d8, o.ground ?? 0x2a1d14, o.hemi ?? 0.75);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(o.key ?? 0xbcd3f2, o.keyPower ?? 0.5);
    key.position.set(...(o.keyPos ?? [3, 3, 2]));
    key.castShadow = !o.soft;
    if (key.castShadow) {
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.bias = -0.0012;
        key.shadow.camera.near = 0.1; key.shadow.camera.far = 12;
        const s = o.shadowSpan ?? 3.2;
        Object.assign(key.shadow.camera, { left:-s, right:s, top:s, bottom:-s });
        key.shadow.camera.updateProjectionMatrix();
    }
    scene.add(key, key.target);

    const warm = new THREE.PointLight(o.warm ?? 0xffb673, o.warmPower ?? 14, o.warmRange ?? 4, 2);
    warm.position.set(...(o.warmPos ?? [0.4, 1.1, -1.2]));
    /* 점광은 그림자를 여섯 면 굽는다. GPU 가 있어도 값이 크다. 기본은 끈다. */
    warm.castShadow = false;
    scene.add(warm);

    return { hemi, key, warm };
}
