/**
 * 작은 3D — 서 있는 것을 서 있게 보여 주는 그림판 (TASK-KL-242)
 *
 * **라이브러리 0.** three.js 는 600KB 가 넘고 이 앱은 위젯 하나에 64KB(gz)를 안 넘긴다
 * (`tools/mesh3d.ts` 도 같은 이유로 WebGL 을 손으로 쓴다). 여기 필요한 것은 **바닥 한 장과
 * 원기둥 몇 개**뿐이라 행렬 하나와 셰이더 두 장이면 끝난다.
 *
 * 왜 3D 인가: 볼링은 **핀이 서 있다.** 위에서 내려다보면 「열 개가 서 있다가 우르르 넘어간다」가
 * 안 보이고 점 열 개가 흩어질 뿐이다. 컬링은 반대라 2D 로 그렸다 — 시점은 취향이 아니라
 * 그 놀이가 무엇을 보여 줘야 하는가로 정한다.
 *
 * 규율:
 *  - **물리는 여기 없다.** 자리와 색을 받아 그리기만 한다. 판이 어떻게 굴렀는지는 커널이 안다.
 *  - **부를 때만 그린다.** 가만히 도는 60fps 는 배터리를 먹고 그 원인이 안 보인다.
 *  - WebGL 을 못 얻으면 `null` 을 돌려준다 — 부르는 쪽이 2D 로 물러설 수 있게(화면이 안 죽는다).
 */

export interface Piece {
  x: number;
  y: number;
  /** 반지름 (판 좌표) */
  r: number;
  /** 높이 (0 이면 납작한 판) */
  h: number;
  color: [number, number, number];
  /** 쓰러진 것은 눕혀 그린다 */
  fallen?: boolean;
  /** 모서리가 있는 것(레인·테이블)은 상자로 */
  boxy?: boolean;
}

export interface Scene {
  w: number;
  h: number;
  /** 바닥판 — 없으면 안 그린다 */
  floor?: { w: number; h: number; color: [number, number, number] };
  pieces: Piece[];
  /** 겨눔 선 — 시작점과 방향, 길이 */
  aim?: { x: number; y: number; dx: number; dy: number; len: number };
}

export interface Gl {
  draw(scene: Scene): void;
  dispose(): void;
}

const VS = `
attribute vec3 pos;
attribute vec3 nrm;
uniform mat4 mvp;
uniform vec3 offset;
uniform vec3 scale;
uniform float lay;
varying float light;
void main() {
  vec3 p = vec3(pos.x * scale.x, pos.y * scale.y, pos.z * scale.z);
  /* 쓰러진 것은 눕힌다 — 세운 채 색만 바꾸면 「넘어갔다」가 안 읽힌다. */
  p = mix(p, vec3(p.x, p.z * 1.2, p.y * 0.5 + scale.x), lay);
  vec3 n = normalize(nrm);
  /* 바닥광을 넉넉히 준다 — 어둡게 두면 서 있는 핀이 회색 덩어리로 뭉쳐 보인다(실측). */
  light = 0.66 + 0.40 * max(0.0, dot(n, normalize(vec3(0.30, -0.55, 0.78))));
  gl_Position = mvp * vec4(p + offset, 1.0);
}`;

const FS = `
precision mediump float;
uniform vec3 color;
varying float light;
void main() { gl_FragColor = vec4(color * light, 1.0); }`;

/** 원기둥 하나. 자리·크기만 바꿔 가며 모든 것을 이걸로 그린다. */
function cylinder(seg: number): { pos: Float32Array; nrm: Float32Array; count: number } {
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    pos.push(c0, s0, 0, c1, s1, 0, c1, s1, 1, c0, s0, 0, c1, s1, 1, c0, s0, 1);
    for (const [cx, cy] of [[c0, s0], [c1, s1], [c1, s1], [c0, s0], [c1, s1], [c0, s0]]) nrm.push(cx, cy, 0);
    pos.push(0, 0, 1, c0, s0, 1, c1, s1, 1);
    for (let k = 0; k < 3; k++) nrm.push(0, 0, 1);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), count: pos.length / 3 };
}

/** 상자 하나 — 레인처럼 **모서리가 있는 것**은 원기둥으로 그리면 덩어리로 보인다. */
function box(): { pos: Float32Array; nrm: Float32Array; count: number } {
  const pos: number[] = [];
  const nrm: number[] = [];
  const face = (a: number[], b: number[], c: number[], d: number[], n: number[]): void => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) nrm.push(...n);
  };
  const p000 = [-1, -1, 0], p100 = [1, -1, 0], p110 = [1, 1, 0], p010 = [-1, 1, 0];
  const q000 = [-1, -1, 1], q100 = [1, -1, 1], q110 = [1, 1, 1], q010 = [-1, 1, 1];
  face(q000, q100, q110, q010, [0, 0, 1]);
  face(p000, p010, p110, p100, [0, 0, -1]);
  face(p000, p100, q100, q000, [0, -1, 0]);
  face(p010, q010, q110, p110, [0, 1, 0]);
  face(p000, q000, q010, p010, [-1, 0, 0]);
  face(p100, p110, q110, q100, [1, 0, 0]);
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), count: pos.length / 3 };
}

const MESH = cylinder(20);
const BOX = box();

/** 던지는 쪽 뒤에서 낮게 내려다본다 — 핀이 서 있는 게 보이는 자리. */
function camera(out: Float32Array, w: number, h: number, aspect: number): void {
  /*
   * 던지는 사람 뒤에서, **핀 쪽으로 당겨서** 본다.
   *
   * 처음엔 레인 전체가 들어오게 잡았더니 핀 열 개가 한 덩어리로 보였다(스크린샷으로 확인).
   * 이 놀이의 그림은 「서 있던 게 넘어간다」라서, 레인을 다 보여 주는 것보다 **핀이 크게
   * 보이는 쪽**이 맞다. 그래서 눈을 낮추고 화각을 좁혀 앞쪽 레인을 일부러 잘라 낸다.
   */
  const eye = [w / 2, h * 0.72, h * 0.105];
  const at = [w / 2, h * 0.12, h * 0.022];
  const near = 1, far = h * 4, fov = 0.62;
  const f = 1 / Math.tan(fov / 2);

  let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
  const zl = Math.hypot(zx, zy, zz);
  zx /= zl; zy /= zl; zz /= zl;
  let sx = 0 * zz - 1 * zy, sy = 1 * zx - 0 * zz, sz = 0 * zy - 0 * zx;
  const sl = Math.hypot(sx, sy, sz) || 1;
  sx /= sl; sy /= sl; sz /= sl;
  const tx = zy * sz - zz * sy, ty = zz * sx - zx * sz, tz = zx * sy - zy * sx;

  const v = [
    sx, tx, zx, 0,
    sy, ty, zy, 0,
    sz, tz, zz, 0,
    -(sx * eye[0] + sy * eye[1] + sz * eye[2]),
    -(tx * eye[0] + ty * eye[1] + tz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
  ];
  const p = [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0
  ];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += p[k * 4 + j] * v[i * 4 + k];
      out[i * 4 + j] = sum;
    }
  }
}

export function createGl(canvas: HTMLCanvasElement): Gl | null {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!gl) return null;

  const compile = (type: number, src: string): WebGLShader | null => {
    const sh = gl.createShader(type);
    if (!sh) return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  };
  const vs = compile(gl.VERTEX_SHADER, VS);
  const fs = compile(gl.FRAGMENT_SHADER, FS);
  const prog = vs && fs ? gl.createProgram() : null;
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const upload = (data: Float32Array): WebGLBuffer | null => {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return buf;
  };
  const aPos = gl.getAttribLocation(prog, 'pos');
  const aNrm = gl.getAttribLocation(prog, 'nrm');
  gl.enableVertexAttribArray(aPos);
  gl.enableVertexAttribArray(aNrm);
  const cylPos = upload(MESH.pos), cylNrm = upload(MESH.nrm);
  const boxPos = upload(BOX.pos), boxNrm = upload(BOX.nrm);
  const useMesh = (boxy: boolean): number => {
    gl.bindBuffer(gl.ARRAY_BUFFER, boxy ? boxPos : cylPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, boxy ? boxNrm : cylNrm);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
    return boxy ? BOX.count : MESH.count;
  };

  const uMvp = gl.getUniformLocation(prog, 'mvp');
  const uColor = gl.getUniformLocation(prog, 'color');
  const uOffset = gl.getUniformLocation(prog, 'offset');
  const uScale = gl.getUniformLocation(prog, 'scale');
  const uLay = gl.getUniformLocation(prog, 'lay');
  const mvp = new Float32Array(16);
  gl.enable(gl.DEPTH_TEST);
  /* 뒷면은 안 그린다 — 안 그러면 상자 안쪽이 비쳐 줄무늬처럼 남는다. */
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  const piece = (x: number, y: number, z: number, rx: number, ry: number, h: number,
                 c: [number, number, number], lay = 0, boxy = false): void => {
    const count = useMesh(boxy);
    gl.uniform3f(uOffset, x, y, z);
    gl.uniform3f(uScale, rx, ry, h);
    gl.uniform1f(uLay, lay);
    gl.uniform3f(uColor, c[0], c[1], c[2]);
    gl.drawArrays(gl.TRIANGLES, 0, count);
  };

  return {
    draw(scene) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const chh = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== cw || canvas.height !== chh) {
        canvas.width = cw;
        canvas.height = chh;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      camera(mvp, scene.w, scene.h, canvas.width / Math.max(1, canvas.height));
      gl.uniformMatrix4fv(uMvp, false, mvp);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      /* 바닥 — 상자다. 원기둥으로 그리면 레인이 아니라 둥근 덩어리로 보인다(실측). */
      const fl = scene.floor ?? { w: scene.w * 0.92, h: scene.h, color: [0.85, 0.72, 0.5] as [number, number, number] };
      piece(scene.w / 2, scene.h / 2, -1.4, fl.w / 2, fl.h / 2, 1.4, fl.color, 0, true);

      if (scene.aim) {
        const a = scene.aim;
        const steps = 9;
        for (let i = 1; i <= steps; i++) {
          const t = (i / steps) * a.len;
          piece(a.x + a.dx * t, a.y + a.dy * t, 0.2, 0.5, 0.5, 0.3, [0.1, 0.65, 0.9]);
        }
      }

      for (const p of scene.pieces) {
        piece(p.x, p.y, 0, p.r, p.r, p.h, p.color, p.fallen ? 1 : 0, !!p.boxy);
      }
    },
    dispose() {
      for (const b of [cylPos, cylNrm, boxPos, boxNrm]) gl.deleteBuffer(b);
      gl.deleteProgram(prog);
    }
  };
}
