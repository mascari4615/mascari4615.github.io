/**
 * 가리개 — 캡처에서 개인정보 지우기 (TASK-KL-088)
 *
 * 화면 캡처를 올리기 전에 계좌번호·주소·이름을 가려야 할 때가 있다. 그림판으로 덮으면 되지만,
 * 급할 때 실수하기 쉽고 사진에 남은 위치 정보까지는 못 뗀다.
 *
 * 신경 쓴 곳 — **덮는 게 아니라 지운다.**
 *  - 가린 자리의 원래 점들은 그 자리에서 없어진다. 화면에만 덮어 두면 원본이 파일 안에 남는다.
 *  - 내보낼 때 사진에 붙어 있던 위치·기기 정보도 같이 떨어진다 (다시 그려 내보내므로).
 *  - 모자이크는 되돌릴 수 있다는 것이 알려져 있다. 그래서 기본은 **검은칠**이고, 모자이크를
 *    고르면 그 사실을 말해 준다. 「가린 줄 알았는데 아니었다」가 이 도구에서 가장 나쁜 결과다.
 */
import { acceptPastedFiles } from './shared/paste';
import { fileSize as size } from './shared/media';

(function (): void {
  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  Toolbox.register({
    id: 'redact',
    title: '가리개',
    category: 'tool',
    desc: '캡처에서 계좌번호·이름 같은 것을 지웁니다. 덮는 게 아니라 그 자리를 없앱니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="6" y="9" width="7" height="4" rx="1" fill="currentColor"/><path d="M15 15h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '가리기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="rdDrop">
              <input type="file" id="rdFile" accept="image/*" hidden>
              <span>가릴 그림을 끌어다 놓거나 눌러서 고르세요 — 붙여넣기(Ctrl+V)도 됩니다</span>
            </div>

            <div class="field-group" id="rdControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-chips">
                <button type="button" class="tool-chip active" id="rdModeFill">검은칠 — 되돌릴 수 없음</button>
                <button type="button" class="tool-chip" id="rdModePixel">모자이크</button>
              </div>
              <div id="rdPixelWrap" style="display:none; margin-top:10px;">
                <div class="tool-sublabel">모자이크 크기 <span id="rdBlockVal" class="range-value">16px</span></div>
                <input type="range" id="rdBlock" aria-label="모자이크 크기" min="6" max="48" value="16">
              </div>
            </div>

            <div id="rdStage" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">가릴 곳을 드래그하세요 — 여러 번 해도 됩니다</div>
              <canvas id="rdCanvas" style="max-width:100%; border-radius:10px; display:block; cursor:crosshair; border:1px solid rgba(128,128,128,0.25); touch-action:none;"></canvas>
            </div>

            <div class="cc-stats" id="rdStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;" id="rdActions">
              <button class="btn btn-primary" id="rdSave" disabled>PNG 으로 받기</button>
              <button class="btn btn-ghost" id="rdUndo" disabled>방금 것 취소</button>
              <button class="btn btn-ghost" id="rdReset" disabled>처음으로</button>
            </div>

            <div class="tool-status" id="rdStatus">그림은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const canvas = $<HTMLCanvasElement>('#rdCanvas');
          const status = $<HTMLElement>('#rdStatus');
          const stats = $<HTMLElement>('#rdStats');
          const drop = $<HTMLElement>('#rdDrop');
          const fileInput = $<HTMLInputElement>('#rdFile');
          const saveBtn = $<HTMLButtonElement>('#rdSave');
          const undoBtn = $<HTMLButtonElement>('#rdUndo');
          const resetBtn = $<HTMLButtonElement>('#rdReset');

          let img: HTMLImageElement | null = null;
          let boxes: Box[] = [];
          let mode: 'fill' | 'pixel' = 'fill';
          let dragStart: { x: number; y: number } | null = null;
          let dragNow: { x: number; y: number } | null = null;
          let sourceName = '가린그림';

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /**
           * 가린 자리의 점들을 그 자리에서 없앤다.
           * 화면 위에 네모를 덮어 두는 것과 다르다 — 여기서 지우면 내보낸 파일에도 없다.
           */
          function applyBox(ctx: CanvasRenderingContext2D, b: Box): void {
            if (b.w < 1 || b.h < 1) return;
            if (mode === 'fill') {
              ctx.fillStyle = '#000000';
              ctx.fillRect(b.x, b.y, b.w, b.h);
              return;
            }
            const block = parseInt($<HTMLInputElement>('#rdBlock').value, 10);
            const data = ctx.getImageData(b.x, b.y, b.w, b.h);
            const d = data.data;
            for (let by = 0; by < b.h; by += block) {
              for (let bx = 0; bx < b.w; bx += block) {
                let r = 0, g = 0, bl = 0, n = 0;
                const maxY = Math.min(by + block, b.h);
                const maxX = Math.min(bx + block, b.w);
                for (let y = by; y < maxY; y++) {
                  for (let x = bx; x < maxX; x++) {
                    const i = (y * b.w + x) * 4;
                    r += d[i]; g += d[i + 1]; bl += d[i + 2]; n++;
                  }
                }
                r = Math.round(r / n); g = Math.round(g / n); bl = Math.round(bl / n);
                for (let y = by; y < maxY; y++) {
                  for (let x = bx; x < maxX; x++) {
                    const i = (y * b.w + x) * 4;
                    d[i] = r; d[i + 1] = g; d[i + 2] = bl;
                  }
                }
              }
            }
            ctx.putImageData(data, b.x, b.y);
          }

          /** 원본에서 다시 그린 뒤 지금까지의 가림을 순서대로 다시 먹인다 (취소를 위해). */
          function redraw(): void {
            if (!img) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0);
            for (const b of boxes) applyBox(ctx, b);

            // 끌고 있는 중이면 어디가 가려질지 테두리로만 보여 준다 (아직 지우지 않았다)
            if (dragStart && dragNow) {
              ctx.save();
              ctx.strokeStyle = '#ff5a5a';
              ctx.lineWidth = Math.max(2, canvas.width / 400);
              ctx.setLineDash([canvas.width / 80, canvas.width / 80]);
              ctx.strokeRect(
                Math.min(dragStart.x, dragNow.x),
                Math.min(dragStart.y, dragNow.y),
                Math.abs(dragNow.x - dragStart.x),
                Math.abs(dragNow.y - dragStart.y)
              );
              ctx.restore();
            }

            const covered = boxes.reduce((s, b) => s + b.w * b.h, 0);
            const pct = canvas.width * canvas.height ? (covered / (canvas.width * canvas.height)) * 100 : 0;
            stats.innerHTML =
              stat('가린 곳', `${boxes.length}군데`, true) +
              stat('그림 크기', `${canvas.width}×${canvas.height}`) +
              stat('가린 넓이', `${pct < 0.1 && covered > 0 ? '0.1 미만' : pct.toFixed(1)}%`);
            saveBtn.disabled = false;
            undoBtn.disabled = boxes.length === 0;
            resetBtn.disabled = boxes.length === 0;
          }

          /**
           * 화면에서 누른 자리를 그림의 점 좌표로 옮긴다 (보이는 크기와 실제 크기가 다르다).
           * 그림 밖은 그림 가장자리로 붙인다 — 손가락이 밖으로 나가는 일은 늘 있고,
           * 밖까지 잡힌 상자는 지우려던 자리를 비껴간다.
           */
          function toImage(e: PointerEvent): { x: number; y: number } {
            const r = canvas.getBoundingClientRect();
            const clamp = (v: number, max: number): number => Math.max(0, Math.min(max, Math.round(v)));
            return {
              x: clamp(((e.clientX - r.left) / r.width) * canvas.width, canvas.width),
              y: clamp(((e.clientY - r.top) / r.height) * canvas.height, canvas.height)
            };
          }

          function load(file: File): void {
            const url = URL.createObjectURL(file);
            const im = new Image();
            im.onload = () => {
              img = im;
              boxes = [];
              canvas.width = im.naturalWidth;
              canvas.height = im.naturalHeight;
              sourceName = (file.name || '그림').replace(/\.[^.]+$/, '');
              $<HTMLElement>('#rdStage').style.display = '';
              $<HTMLElement>('#rdControls').style.display = '';
              redraw();
              say('가릴 곳을 드래그하세요. 덮는 게 아니라 그 자리를 지웁니다.', 'ok');
              URL.revokeObjectURL(url);
            };
            im.onerror = () => {
              say('그림을 열지 못했어요. 다른 파일로 해 보세요.', 'error');
              URL.revokeObjectURL(url);
            };
            im.src = url;
          }

          canvas.addEventListener('pointerdown', (e) => {
            if (!img) return;
            canvas.setPointerCapture(e.pointerId);
            dragStart = toImage(e);
            dragNow = dragStart;
          });
          canvas.addEventListener('pointermove', (e) => {
            if (!dragStart) return;
            dragNow = toImage(e);
            redraw();
          });
          canvas.addEventListener('pointerup', () => {
            if (!dragStart || !dragNow) return;
            const b: Box = {
              x: Math.min(dragStart.x, dragNow.x),
              y: Math.min(dragStart.y, dragNow.y),
              w: Math.abs(dragNow.x - dragStart.x),
              h: Math.abs(dragNow.y - dragStart.y)
            };
            dragStart = null;
            dragNow = null;
            // 아주 작은 것은 잘못 누른 것이다 — 가렸다고 착각하게 두면 안 된다
            if (b.w < 3 || b.h < 3) {
              redraw();
              say('너무 작아서 넘어갔어요. 가릴 곳을 끌어서 네모로 잡아 주세요.', 'error');
              return;
            }
            boxes.push(b);
            redraw();
            say(`${boxes.length}군데 지웠어요. 더 가려도 되고, 바로 받아도 됩니다.`, 'ok');
          });

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) load(f);
          });
          // 캡처는 대개 클립보드에 있다 — 붙여넣기가 가장 빠른 길이다
          acceptPastedFiles(container, (files) => {
            if (files[0]) load(files[0]);
          }, (f) => f.type.startsWith('image/'));

          const setMode = (next: 'fill' | 'pixel'): void => {
            mode = next;
            $<HTMLElement>('#rdModeFill').classList.toggle('active', next === 'fill');
            $<HTMLElement>('#rdModePixel').classList.toggle('active', next === 'pixel');
            $<HTMLElement>('#rdPixelWrap').style.display = next === 'pixel' ? '' : 'none';
            redraw();
            // 「가린 줄 알았는데 아니었다」가 이 도구에서 가장 나쁜 결과다 — 미리 말해 준다
            if (next === 'pixel') {
              say('모자이크는 글자를 되살릴 수 있다고 알려져 있어요. 꼭 가려야 할 것은 검은칠로 하세요.', 'error');
            } else say('검은칠은 되돌릴 수 없어요. 그 자리의 점들이 없어집니다.', 'ok');
          };
          $<HTMLElement>('#rdModeFill').onclick = () => setMode('fill');
          $<HTMLElement>('#rdModePixel').onclick = () => setMode('pixel');
          $<HTMLInputElement>('#rdBlock').addEventListener('input', () => {
            $<HTMLElement>('#rdBlockVal').textContent = $<HTMLInputElement>('#rdBlock').value + 'px';
            redraw();
          });

          undoBtn.onclick = () => {
            boxes.pop();
            redraw();
            say(boxes.length ? `${boxes.length}군데 남았어요.` : '가린 것이 없어졌어요.', 'ok');
          };
          resetBtn.onclick = () => {
            boxes = [];
            redraw();
            say('원래 그림으로 되돌렸어요.', 'ok');
          };
          saveBtn.onclick = () => {
            canvas.toBlob((blob) => {
              if (!blob) {
                say('그림으로 바꾸지 못했어요.', 'error');
                return;
              }
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = sourceName + '-가림.png';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              // 다시 그려 내보내므로 사진에 붙어 있던 위치·기기 정보도 함께 떨어진다
              say(`${size(blob.size)} 로 받았어요. 가린 자리는 파일 안에도 없고, 사진에 남아 있던 위치 정보도 떨어졌어요.`, 'ok');
              Toolbox.trackUse?.('save');
            }, 'image/png');
          };
        }
      }
    ]
  });
})();
