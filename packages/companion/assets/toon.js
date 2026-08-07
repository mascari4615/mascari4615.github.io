/**
 * 카툰 셰이더 — 그림처럼 보이게.
 *
 * 사실적인 음영은 조명 하나만 어긋나도 인형처럼 보인다. 만화식은 빛을 몇 단계로만
 * 끊어 칠하므로 값이 조금 틀려도 그림처럼 버틴다. 원래 그림(색·무늬)은 그대로 쓰고
 * 「빛을 어떻게 칠할지」만 바꾼다.
 *
 * 두 겹이다: 몸에 칠하는 단계 음영 + 뒤집어 씌우는 바깥선.
 */
import * as THREE from 'three';

/** 빛을 몇 단계로 끊을지 정하는 띠. 가늘고 길수록 부드럽다. */
function stepRamp(steps) {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i += 1) {
    // 어두운 쪽을 완전히 죽이지 않는다 — 그림자에서도 얼굴이 보여야 한다.
    const v = Math.round(255 * (0.42 + (0.58 * i) / (steps - 1)));
    data.set([v, v, v, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/**
 * 모델 전체를 만화식으로 다시 칠한다.
 *
 * @param root 모델
 * @param options.steps 음영 단계 수 (적을수록 만화 같다)
 * @param options.outline 바깥선 두께 — **화면 높이 대비 비율**. 0 이면 선 없음
 * @param options.outlineColor 바깥선 색
 */
export function applyToon(root, options = {}) {
  const steps = options.steps ?? 3;
  const outline = options.outline ?? 0.006;
  // 새까만 선은 그림에서 튄다. 몸 색을 아주 어둡게 깐 먹색이 그림처럼 앉는다.
  const outlineColor = new THREE.Color(options.outlineColor ?? 0x2b1f33);
  const gradient = stepRamp(steps);

  const outlines = [];

  root.traverse((node) => {
    if (node.isMesh !== true && node.isSkinnedMesh !== true) return;

    const originals = Array.isArray(node.material) ? node.material : [node.material];
    const toons = originals.map((material) => {
      const toon = new THREE.MeshToonMaterial({
        // 원래 그림을 그대로 물려받는다 — 다시 칠하는 건 빛뿐이다.
        map: material?.map ?? null,
        color: material?.color?.clone?.() ?? new THREE.Color(0xffffff),
        gradientMap: gradient,
        transparent: material?.transparent ?? false,
        alphaTest: material?.alphaTest ?? 0,
        // 원래 재질의 「앞뒤 다 그리기」를 그대로 물려받는다. 앞면만 그리게 바꾸면
        // 손으로 만든 낮은 폴리곤 모델에서 뒤집힌 면이 통째로 사라져 구멍이 뚫리고,
        // 그 구멍으로 뒤에 깔린 바깥선이 비쳐 치마에 시커먼 삼각형이 생긴다(실측).
        side: material?.side ?? THREE.FrontSide,
      });
      if (toon.map) toon.map.colorSpace = THREE.SRGBColorSpace;
      return toon;
    });
    node.material = Array.isArray(node.material) ? toons : toons[0];

    if (outline <= 0) return;

    // 바깥선 = 같은 모양을 조금 부풀려 뒤집어 씌운 껍데기. 안쪽 면만 그리면
    // 몸 뒤로 삐져나온 가장자리만 보여서 선처럼 남는다.
    //
    // 부풀리는 양은 **화면 기준**이다. 모델 기준으로 밀면 그 모델이 몇 단위짜리로
    // 만들어졌는지에 따라 선이 실오라기가 되거나 몸을 통째로 삼킨다 — 이 모델에서는
    // 후자였고, 자세가 바뀌자 시커먼 조각이 치마 밖으로 삐져나왔다(실측). 화면 기준으로
    // 밀면 모델 크기·카메라 거리와 무관하게 늘 같은 굵기로 보인다.
    const shell = node.clone();
    shell.material = new THREE.ShaderMaterial({
      uniforms: { thickness: { value: outline }, lineColor: { value: outlineColor } },
      vertexShader: `
        uniform float thickness;
        #include <common>
        #include <skinning_pars_vertex>
        void main() {
          #include <beginnormal_vertex>
          #include <skinbase_vertex>
          #include <skinnormal_vertex>
          #include <begin_vertex>
          #include <skinning_vertex>
          vec4 seen = modelViewMatrix * vec4(transformed, 1.0);
          vec3 seenNormal = normalize(normalMatrix * objectNormal);
          gl_Position = projectionMatrix * seen;
          // 가로가 세로보다 넓으면 x 쪽이 더 늘어난다 — 그만큼 줄여야 굵기가 고르다.
          float wide = projectionMatrix[1][1] / projectionMatrix[0][0];
          gl_Position.xy += vec2(seenNormal.x / wide, seenNormal.y) * thickness * gl_Position.w;
        }
      `,
      fragmentShader: `
        uniform vec3 lineColor;
        void main() { gl_FragColor = vec4(lineColor, 1.0); }
      `,
      side: THREE.BackSide,
    });
    // 껍데기는 원래 몸과 같은 뼈를 따라야 한다 — 안 그러면 몸만 움직이고 선은 제자리다.
    if (node.isSkinnedMesh === true && shell.isSkinnedMesh === true) {
      shell.bind(node.skeleton, node.bindMatrix);
    }
    outlines.push({ shell, parent: node.parent });
  });

  for (const { shell, parent } of outlines) parent?.add(shell);

  return { outlineCount: outlines.length };
}
