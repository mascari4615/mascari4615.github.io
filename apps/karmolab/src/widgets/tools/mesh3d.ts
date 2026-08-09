/**
 * 3D 뷰어 — 화면 (흡수 ⓑ)
 *
 * 「받아 놓고 못 여는 3D 파일」을 그냥 여는 것. 읽는 일은 전부 `core/mesh3d.ts` 가 하고,
 * 여기는 **그리는 일만** 한다.
 *
 * ★ 라이브러리 0 — three.js(600KB+)를 이 도구 하나 때문에 들이지 않는다. WebGL 을 손으로 쓴다.
 *   행렬 네 개와 셰이더 두 장이면 「돌려 보기」에는 충분하다.
 *
 * ★ 가만히 두면 **안 그린다.** 돌리거나 확대할 때만 한 판 그린다 — 60fps 로 계속 도는 화면은
 *   가만히 있어도 배터리를 먹고, 그 원인은 아무 데도 안 보인다.
 *
 * ★ 파일은 기기 밖으로 안 나간다. 남의 3D 뷰어 사이트는 대개 업로드부터 시킨다.
 */
import { describe, parseMesh } from '../../core/mesh3d';

/** 삼각형마다 제 법선을 준다(플랫 셰이딩). 파일에 적힌 법선은 틀린 것이 많아 다시 계산한다. */
function faceNormals(positions: Float32Array): Float32Array {
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i];
    const ay = positions[i + 4] - positions[i + 1];
    const az = positions[i + 5] - positions[i + 2];
    const bx = positions[i + 6] - positions[i];
    const by = positions[i + 7] - positions[i + 1];
    const bz = positions[i + 8] - positions[i + 2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    for (let v = 0; v < 3; v++) {
      out[i + v * 3] = nx;
      out[i + v * 3 + 1] = ny;
      out[i + v * 3 + 2] = nz;
    }
  }
  return out;
}

/** 열 우선(WebGL 순서) 4×4. 라이브러리 없이 쓰는 값이라 여기 네 개면 끝난다. */
function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

function rotationXY(pitch: number, yaw: number): Float32Array {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  /* Y 축(좌우) 먼저, X 축(위아래) 나중 — 사람이 「지구본 돌리듯」 기대하는 순서다. */
  return new Float32Array([cy, sp * sy, -cp * sy, 0, 0, cp, sp, 0, sy, -sp * cy, cp * cy, 0, 0, 0, 0, 1]);
}

const VERT = [
  'attribute vec3 aPos;',
  'attribute vec3 aNormal;',
  'uniform mat4 uProj;',
  'uniform mat4 uView;',
  'uniform mat4 uRot;',
  'varying vec3 vNormal;',
  'void main() {',
  '  vNormal = normalize((uRot * vec4(aNormal, 0.0)).xyz);',
  '  gl_Position = uProj * uView * uRot * vec4(aPos, 1.0);',
  '}'
].join('\n');

const FRAG = [
  'precision mediump float;',
  'varying vec3 vNormal;',
  'uniform vec3 uColor;',
  'void main() {',
  /* 카메라에 붙은 조명 하나 + 바닥빛. 어느 각도로 돌려도 깜깜한 면이 안 생긴다. */
  '  float lit = max(dot(normalize(vNormal), normalize(vec3(0.35, 0.5, 1.0))), 0.0);',
  '  vec3 c = uColor * (0.32 + 0.68 * lit);',
  '  gl_FragColor = vec4(c, 1.0);',
  '}'
].join('\n');

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (sh === null) throw new Error('WebGL 셰이더를 못 만들었습니다');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (gl.getShaderParameter(sh, gl.COMPILE_STATUS) !== true) {
    throw new Error(`셰이더 오류: ${String(gl.getShaderInfoLog(sh))}`);
  }
  return sh;
}

(function (): void {
  Toolbox.register({
    id: 'mesh3d',
    title: '3D 뷰어',
    category: 'tool',
    desc: 'STL·OBJ 를 열어 돌려 봅니다. 삼각형 수·크기도 함께. 파일은 기기 밖으로 나가지 않습니다',
    layout: 'wide',
    tabs: [
      {
        id: 'view',
        label: '열어 보기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row">
                <label class="tool-btn" for="m3File">3D 파일 고르기
                  <input id="m3File" type="file" accept=".stl,.obj,model/stl,model/obj" hidden /></label>
                <button id="m3Reset" class="tool-btn" type="button" disabled>각도 되돌리기</button>
                <button id="m3Png" class="tool-btn" type="button" disabled>PNG 로 저장</button>
              </div>
              <div id="m3Stage" style="position:relative; border-radius:8px; overflow:hidden;
                background:var(--surface-2, #14161a); touch-action:none;">
                <canvas id="m3Canvas" style="display:block; width:100%; height:min(60vh, 520px);"></canvas>
              </div>
              <div id="m3Info" class="tool-note" role="status"></div>
              <p class="tool-hint">끌어서 돌리고, 휠·두 손가락으로 확대합니다. STL(글자·이진)·OBJ 를 읽습니다.</p>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const canvas = $<HTMLCanvasElement>('#m3Canvas');
          const say = (msg: string, tone = ''): void => {
            const el = $('#m3Info');
            el.textContent = msg;
            el.className = `tool-note${tone === '' ? '' : ' ' + tone}`;
          };

          /* preserveDrawingBuffer — 없으면 PNG 저장이 빈 그림으로 나온다(그린 직후가 아니면 지워진다). */
          const gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
          if (gl === null) {
            say('이 브라우저에서 WebGL 을 못 씁니다 — 3D 를 그릴 수 없습니다', 'error');
            return;
          }

          let program: WebGLProgram | null = null;
          try {
            const p = gl.createProgram();
            if (p === null) throw new Error('WebGL 프로그램을 못 만들었습니다');
            gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
            gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, FRAG));
            gl.linkProgram(p);
            if (gl.getProgramParameter(p, gl.LINK_STATUS) !== true) {
              throw new Error(`WebGL 연결 오류: ${String(gl.getProgramInfoLog(p))}`);
            }
            program = p;
          } catch (err) {
            say(err instanceof Error ? err.message : String(err), 'error');
            return;
          }
          gl.useProgram(program);
          gl.enable(gl.DEPTH_TEST);

          const posBuf = gl.createBuffer();
          const normBuf = gl.createBuffer();
          const aPos = gl.getAttribLocation(program, 'aPos');
          const aNormal = gl.getAttribLocation(program, 'aNormal');
          const uProj = gl.getUniformLocation(program, 'uProj');
          const uView = gl.getUniformLocation(program, 'uView');
          const uRot = gl.getUniformLocation(program, 'uRot');
          const uColor = gl.getUniformLocation(program, 'uColor');

          let count = 0;
          let pitch = -0.35;
          let yaw = 0.6;
          let zoom = 1;
          let pending = false;

          /* 한 판만 그린다. 여러 번 불려도 다음 프레임에 한 번 — 끄는 자리를 잊지 않기 위해 rAF 로 묶는다. */
          const invalidate = (): void => {
            if (pending) return;
            pending = true;
            frame = window.requestAnimationFrame(() => {
              pending = false;
              render();
            });
          };
          let frame = 0;

          const render = (): void => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
            const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
            if (canvas.width !== w || canvas.height !== h) {
              canvas.width = w;
              canvas.height = h;
            }
            gl.viewport(0, 0, w, h);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            if (count === 0) return;

            const proj = perspective(Math.PI / 4, w / h, 0.01, 100);
            const dist = 2.6 / zoom;
            const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -dist, 1]);
            gl.uniformMatrix4fv(uProj, false, proj);
            gl.uniformMatrix4fv(uView, false, view);
            gl.uniformMatrix4fv(uRot, false, rotationXY(pitch, yaw));
            gl.uniform3f(uColor, 0.62, 0.72, 0.9);
            gl.drawArrays(gl.TRIANGLES, 0, count);
          };

          const show = async (file: File): Promise<void> => {
            say('읽는 중…');
            try {
              const bytes = new Uint8Array(await file.arrayBuffer());
              const mesh = parseMesh(bytes, file.name);
              if (mesh.triangles === 0) throw new Error('삼각형이 하나도 없습니다 — 빈 파일일 수 있습니다');
              const info = describe(mesh);

              /*
               * 화면 좌표로 옮긴다: 가운데를 원점으로, 가장 긴 변을 1 로.
               * 파일마다 크기가 mm·m·인치로 제각각이라, 안 맞추면 어떤 모델은 점이고 어떤 모델은
               * 화면을 뚫고 나온다. 원래 크기는 아래 글로 따로 알려 준다.
               */
              const scale = info.longest === 0 ? 1 : 1 / info.longest;
              const fitted = new Float32Array(mesh.positions.length);
              for (let i = 0; i < mesh.positions.length; i += 3) {
                fitted[i] = (mesh.positions[i] - info.center[0]) * scale;
                fitted[i + 1] = (mesh.positions[i + 1] - info.center[1]) * scale;
                fitted[i + 2] = (mesh.positions[i + 2] - info.center[2]) * scale;
              }

              gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
              gl.bufferData(gl.ARRAY_BUFFER, fitted, gl.STATIC_DRAW);
              gl.enableVertexAttribArray(aPos);
              gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

              gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
              gl.bufferData(gl.ARRAY_BUFFER, faceNormals(mesh.positions), gl.STATIC_DRAW);
              gl.enableVertexAttribArray(aNormal);
              gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0);

              count = mesh.triangles * 3;
              pitch = -0.35;
              yaw = 0.6;
              zoom = 1;
              $<HTMLButtonElement>('#m3Reset').disabled = false;
              $<HTMLButtonElement>('#m3Png').disabled = false;
              const r2 = (n: number): string => String(Math.round(n * 100) / 100);
              say(
                `삼각형 ${info.triangles.toLocaleString('ko-KR')}개 · ` +
                  `크기 ${r2(info.size[0])} × ${r2(info.size[1])} × ${r2(info.size[2])} ` +
                  '(단위는 파일에 안 적혀 있습니다 — 3D 프린터 쪽은 대개 mm)'
              );
              invalidate();
            } catch (err) {
              count = 0;
              say(err instanceof Error ? err.message : String(err), 'error');
              invalidate();
            }
          };

          $<HTMLInputElement>('#m3File').onchange = (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) void show(f);
          };

          $<HTMLButtonElement>('#m3Reset').onclick = () => {
            pitch = -0.35;
            yaw = 0.6;
            zoom = 1;
            invalidate();
          };

          $<HTMLButtonElement>('#m3Png').onclick = () => {
            render(); // 저장 직전에 한 판 — 그린 지 오래된 화면은 비어 있을 수 있다
            canvas.toBlob((blob) => {
              if (blob === null) {
                say('저장할 그림을 못 만들었습니다', 'error');
                return;
              }
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'mesh.png';
              a.click();
              URL.revokeObjectURL(a.href);
            }, 'image/png');
          };

          /* 손가락·마우스 한 벌 — 마우스만 받으면 폰에서는 못 돌린다. */
          let dragging = false;
          let lastX = 0;
          let lastY = 0;
          canvas.addEventListener('pointerdown', (e) => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            canvas.setPointerCapture(e.pointerId);
          });
          canvas.addEventListener('pointermove', (e) => {
            if (dragging === false) return;
            yaw += (e.clientX - lastX) * 0.01;
            pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch + (e.clientY - lastY) * 0.01));
            lastX = e.clientX;
            lastY = e.clientY;
            invalidate();
          });
          const stop = (): void => {
            dragging = false;
          };
          canvas.addEventListener('pointerup', stop);
          canvas.addEventListener('pointercancel', stop);
          canvas.addEventListener(
            'wheel',
            (e) => {
              e.preventDefault();
              zoom = Math.max(0.2, Math.min(8, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
              invalidate();
            },
            { passive: false }
          );

          const onResize = (): void => invalidate();
          window.addEventListener('resize', onResize);

          /* 갈아 끼울 때 뒷정리 — 예약된 프레임과 창 리스너를 두고 가면 도구마다 쌓인다. */
          Toolbox.onDispose?.(() => {
            window.cancelAnimationFrame(frame);
            window.removeEventListener('resize', onResize);
          });

          say('STL·OBJ 파일을 고르세요. 파일은 기기 밖으로 나가지 않습니다');
          invalidate();
        }
      }
    ]
  });
})();
