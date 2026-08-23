/**
 * **점 많이 그리기** — 글 수천 개를 한 번의 draw call 로.
 *
 * 점마다 색과 **크기**가 달라야 하는데 `PointsMaterial` 은 크기가 하나뿐이다. 그래서 아주 짧은
 * 셰이더를 둔다(속성 `size` 를 읽는다). 셰이더를 쓰는 곳이 늘어나면 여기서만 고친다.
 *
 * 나뉘어 있는 이유: `packPoints()` 는 **순수 셈**이라 화면 없이 잰다. three 가 필요한 것은
 * `createPointCloud()` 뿐이다.
 */

/**
 * 점 목록을 GPU 가 먹는 한 줄짜리 배열로 묶는다.
 * `list` = `[{ xyz:[x,y,z], rgb:[r,g,b] (0~1), size:number }]`
 */
export function packPoints(list, { size = 1 } = {}) {
  const n = list.length;
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = list[i];
    const xyz = p.xyz || p.position || [0, 0, 0];
    positions[i * 3] = xyz[0];
    positions[i * 3 + 1] = xyz[1];
    positions[i * 3 + 2] = xyz[2];
    const rgb = p.rgb || p.color || [1, 1, 1];
    colors[i * 3] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
    sizes[i] = p.size ?? size;
  }
  return { positions, colors, sizes, count: n };
}

/** 0~255 색을 0~1 로 (화면 쪽 팔레트가 대개 0~255 다). */
export function rgb255(r, g, b) {
  return [r / 255, g / 255, b / 255];
}

/* `size` 는 **세상 크기**(월드 단위)다. 화면 화소로 바꾸는 값(`uScale`)은 화면 높이와 화각에서
   나오므로 밖에서 넣는다 — 안에 박으면 창 크기·화각이 바뀔 때 점만 안 따라온다.
   (처음엔 `300.0` 을 박았다가 점 하나가 300px 로 떠서 화면을 통째로 덮었다. 2026-08-23) */
const VERT = `
attribute float size;
uniform float uScale;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  /* 멀수록 작아진다 — 안 그러면 뒤엣것과 앞엣것이 같은 크기라 깊이가 안 읽힌다. */
  gl_PointSize = max(1.0, size * uScale / max(0.0001, -mv.z));
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
varying vec3 vColor;
void main() {
  /* 네모를 동그라미로 — 모서리를 버린다. */
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  /* 가장자리를 살짝 흐리면 점이 톱니로 안 보인다. */
  float edge = smoothstep(0.25, 0.16, r2);
  gl_FragColor = vec4(vColor, edge);
}`;

/**
 * 점 구름 하나. 돌려주는 것 = `{ points, geometry, material, update(list), dispose() }`.
 * @param {object} THREE `@karmo/3d/three` 에서 받은 원본
 */
export function createPointCloud(THREE, list, opts = {}) {
  const packed = packPoints(list, opts);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(packed.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(packed.colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(packed.sizes, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uScale: { value: opts.scale ?? 1 } },
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  const api = {
    points,
    geometry,
    material,
    count: packed.count,
    /** 자리·색이 바뀌면 통째로 다시 만들지 말고 값만 갈아 끼운다. */
    update(next) {
      const p = packPoints(next, opts);
      if (p.count !== packed.count) {
        geometry.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(p.colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(p.sizes, 1));
      } else {
        geometry.attributes.position.array.set(p.positions);
        geometry.attributes.color.array.set(p.colors);
        geometry.attributes.size.array.set(p.sizes);
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.color.needsUpdate = true;
        geometry.attributes.size.needsUpdate = true;
      }
      geometry.computeBoundingSphere();
      return p.count;
    },
    /** 창 크기·화각이 바뀌면 다시 넣는다 — `pixelScale()` 이 그 값을 셈해 준다. */
    setScale(v) { material.uniforms.uScale.value = v; return api; },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
  return api;
}

/**
 * **세상 크기 → 화면 화소** 환산값. 원근 카메라에서 거리 1 인 것이 몇 화소가 되나.
 *   화면 높이 절반 / tan(화각 절반)
 * 창 크기나 화각이 바뀔 때마다 다시 셈해 `setScale()` 로 넣는다.
 */
export function pixelScale(heightPx, fovDeg) {
  return (heightPx / 2) / Math.tan((fovDeg * Math.PI) / 360);
}
