/**
 * 가리개. 캡처에서 개인정보 지우기 (TASK-KL-088)
 *
 * 화면 캡처를 올리기 전에 계좌번호, 주소, 이름을 가려야 할 때가 있다. 그림판으로 덮으면 되지만,
 * 급할 때 실수하기 쉽고 사진에 남은 위치 정보까지는 못 뗀다.
 *
 * 신경 쓴 곳. **덮는 게 아니라 지운다.**
 *  - 가린 자리의 원래 점들은 그 자리에서 없어진다. 화면에만 덮어 두면 원본이 파일 안에 남는다.
 *  - 내보낼 때 사진에 붙어 있던 위치, 기기 정보도 같이 떨어진다 (다시 그려 내보내므로).
 *  - 모자이크는 되돌릴 수 있다는 것이 알려져 있다. 그래서 기본은 **검은칠**이고, 모자이크를
 *    고르면 그 사실을 말해 준다. 가린 줄 알았는데 아니었다가 이 도구에서 가장 나쁜 결과다.
 */
import { statusLine } from './shared/say';
import { escapeHtml as esc } from './shared/text';
import { statCell } from './shared/stats';
import { wireDrop } from './shared/drop-well';
import { download, encode, loadImage } from './shared/image';
import { fileSize as size } from './shared/media';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  Toolbox.register({
    id: 'redact',
    title: t('widgets.redact.title', undefined, '가리개'),
    category: 'image',
    desc: t(
      'widgets-desc.redact.desc',
      undefined,
      '캡처에서 계좌번호, 이름 같은 것을 지웁니다. 덮는 게 아니라 그 자리를 없앱니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="6" y="9" width="7" height="4" rx="1" fill="currentColor"/><path d="M15 15h3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('redact.tab', undefined, '가리기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('redact').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="rdDrop">
              <input type="file" id="rdFile" accept="image/*" hidden>
              <span>${esc(t('redact.drop'))}</span>
            </div>

            <div class="field-group" id="rdControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-chips">
                <button type="button" class="tool-chip active" id="rdModeFill">${esc(t('redact.mode.fill'))}</button>
                <button type="button" class="tool-chip" id="rdModePixel">${esc(t('redact.mode.pixel'))}</button>
              </div>
              <div id="rdPixelWrap" style="display:none;">
                <div class="tool-sublabel">${esc(t('redact.label.block'))} <span id="rdBlockVal" class="range-value">16px</span></div>
                <input type="range" id="rdBlock" aria-label="${esc(t('redact.label.block'))}" min="6" max="48" value="16">
              </div>
            </div>

            <div id="rdStage" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('redact.label.stage'))}</div>
              <canvas id="rdCanvas" style="max-width:100%; border-radius:10px; display:block; cursor:crosshair; border:1px solid rgba(128,128,128,0.25); touch-action:none;"></canvas>
            </div>

            <div class="cc-stats" id="rdStats"></div>

            <div class="tool-actions" id="rdActions">
              <button class="btn btn-primary" id="rdSave" disabled>${esc(t('redact.btn.save'))}</button>
              <button class="btn btn-ghost" id="rdUndo" disabled>${esc(t('redact.btn.undo'))}</button>
              <button class="btn btn-ghost" id="rdReset" disabled>${esc(t('redact.btn.reset'))}</button>
            </div>

            <div class="tool-status" id="rdStatus">${esc(t('redact.status.idle'))}</div>
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
          /* 자판으로 고르는 네모 (TASK-KL: 마우스 전용 구멍 메우기). 끌기만 있으면 손가락 하나로
           * 하는 이 일이 **통째로 막힌 사람**이 생긴다. 가리개는 못 가림이 곧 사고다. */
          let caret: Box | null = null;
          let sourceName = t('redact.file.fallback');

          /* 상태 줄은 **공용 하나**를 쓴다 (TASK-KL-291). `aria-live` 가 여기 붙어 있어서
           * 화면낭독기가 다 됐습니다, 못 엽니다를 실제로 읽어 준다. */
          const say = statusLine(status);

          /**
           * 가린 자리의 점들을 그 자리에서 없앤다.
           * 화면 위에 네모를 덮어 두는 것과 다르다. 여기서 지우면 내보낸 파일에도 없다.
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

            // 자판으로 고르는 중이면 그 네모도 테두리로 보여 준다 (끌기와 같은 모양).
            if (caret) {
              ctx.save();
              ctx.strokeStyle = '#5ab0ff';
              ctx.lineWidth = Math.max(2, canvas.width / 400);
              ctx.setLineDash([canvas.width / 60, canvas.width / 120]);
              ctx.strokeRect(caret.x, caret.y, caret.w, caret.h);
              ctx.restore();
            }

            const covered = boxes.reduce((s, b) => s + b.w * b.h, 0);
            const pct = canvas.width * canvas.height ? (covered / (canvas.width * canvas.height)) * 100 : 0;
            stats.innerHTML =
              statCell(t('redact.stat.boxes'), t('redact.value.boxes', { n: boxes.length }), true) +
              statCell(t('redact.stat.size'), `${canvas.width}×${canvas.height}`) +
              statCell(
                t('redact.stat.area'),
                `${pct < 0.1 && covered> 0 ? t('redact.value.tiny') : pct.toFixed(1)}%`
              );
            saveBtn.disabled = false;
            undoBtn.disabled = boxes.length === 0;
            resetBtn.disabled = boxes.length === 0;
          }

          /**
           * 화면에서 누른 자리를 그림의 점 좌표로 옮긴다 (보이는 크기와 실제 크기가 다르다).
           * 그림 밖은 그림 가장자리로 붙인다. 손가락이 밖으로 나가는 일은 늘 있고,
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

          /** 공용 `loadImage` 를 쓴다 (TASK-KL-280). 주소 만들고 거두는 네 줄이 도구마다 있었다. */
          async function load(file: File): Promise<void> {
            let im: HTMLImageElement;
            try {
              im = await loadImage(file);
            } catch {
              say(t('redact.err.open'), 'error');
              return;
            }
            {
              img = im;
              boxes = [];
              canvas.width = im.naturalWidth;
              canvas.height = im.naturalHeight;
              sourceName = (file.name || t('redact.file.fallback')).replace(/\.[^.]+$/, '');
              $<HTMLElement>('#rdStage').style.display = '';
              $<HTMLElement>('#rdControls').style.display = '';
              redraw();
              say(t('redact.say.loaded'), 'ok');
            }
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
            // 아주 작은 것은 잘못 누른 것이다. 가렸다고 착각하게 두면 안 된다
            if (b.w < 3 || b.h < 3) {
              redraw();
              say(t('redact.err.tooSmall'), 'error');
              return;
            }
            boxes.push(b);
            redraw();
            say(t('redact.say.added', { n: boxes.length }), 'ok');
          });

          /* 자판 길. 끌기와 **같은 일**을 자판으로 한다 (2026-08-14, `audit:mouse-only` 가 잡은 자리).
           * 화살표=옮기기, Shift+화살표=크기, Enter=가리기, Backspace=되돌리기.
           * 걸음은 그림 크기에 맞춘다(작은 그림에서 한 칸이 화면 절반이 되면 못 쓴다). */
          canvas.tabIndex = 0;
          canvas.setAttribute('role', 'application');
          canvas.setAttribute('aria-label', t('redact.kb.label'));
          canvas.addEventListener('keydown', (e) => {
            if (!img) return;
            const step = e.shiftKey ? 1 : 1;
            const unit = Math.max(4, Math.round(canvas.width / 50)) * step;
            if (!caret && /^(Arrow|Enter)/.test(e.key)) {
              caret = { x: Math.round(canvas.width / 4), y: Math.round(canvas.height / 4), w: unit * 3, h: unit * 2 };
              e.preventDefault();
              redraw();
              say(t('redact.kb.moved', { x: caret.x, y: caret.y, w: caret.w, h: caret.h }));
              return;
            }
            if (!caret) return;
            const clampBox = (): void => {
              if (!caret) return;
              caret.w = Math.max(4, Math.min(caret.w, canvas.width));
              caret.h = Math.max(4, Math.min(caret.h, canvas.height));
              caret.x = Math.max(0, Math.min(caret.x, canvas.width - caret.w));
              caret.y = Math.max(0, Math.min(caret.y, canvas.height - caret.h));
            };
            switch (e.key) {
              case 'ArrowLeft': if (e.shiftKey) caret.w -= unit; else caret.x -= unit; break;
              case 'ArrowRight': if (e.shiftKey) caret.w += unit; else caret.x += unit; break;
              case 'ArrowUp': if (e.shiftKey) caret.h -= unit; else caret.y -= unit; break;
              case 'ArrowDown': if (e.shiftKey) caret.h += unit; else caret.y += unit; break;
              case 'Enter': {
                boxes.push({ ...caret });
                caret = null;
                e.preventDefault();
                redraw();
                say(t('redact.say.added', { n: boxes.length }), 'ok');
                return;
              }
              case 'Backspace': {
                if (boxes.length> 0) boxes.pop();
                e.preventDefault();
                redraw();
                say(boxes.length ? t('redact.say.left', { n: boxes.length }) : t('redact.say.empty'), 'ok');
                return;
              }
              case 'Escape': {
                caret = null;
                e.preventDefault();
                redraw();
                return;
              }
              default: return;
            }
            clampBox();
            e.preventDefault();
            redraw();
            say(t('redact.kb.moved', { x: caret.x, y: caret.y, w: caret.w, h: caret.h }));
          });

          /* 파일 받는 자리는 **공용 하나**를 쓴다 (TASK-KL-290). */
          wireDrop({ drop, input: fileInput, scope: container, onFiles: (files) => void load(files[0]) });

          const setMode = (next: 'fill' | 'pixel'): void => {
            mode = next;
            $<HTMLElement>('#rdModeFill').classList.toggle('active', next === 'fill');
            $<HTMLElement>('#rdModePixel').classList.toggle('active', next === 'pixel');
            $<HTMLElement>('#rdPixelWrap').style.display = next === 'pixel' ? '' : 'none';
            redraw();
            // 가린 줄 알았는데 아니었다가 이 도구에서 가장 나쁜 결과다. 미리 말해 준다
            if (next === 'pixel') {
              say(t('redact.say.pixel'), 'error');
            } else say(t('redact.say.fill'), 'ok');
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
            say(boxes.length ? t('redact.say.left', { n: boxes.length }) : t('redact.say.empty'), 'ok');
          };
          resetBtn.onclick = () => {
            boxes = [];
            redraw();
            say(t('redact.say.reset'), 'ok');
          };
          saveBtn.onclick = () => {
            // 공용 한 자리(`shared/image.encode`)
            encode(canvas, 'png').then((blob) => {
              download(blob, sourceName + t('redact.file.suffix') + '.png');
              /* 만든 것을 **이어서 쓰게 내놓는다** (TASK-KL-298). 받을 도구가 없으면 줄이 안 생긴다. */
              Toolbox.offerNext?.(status, { blob: blob, name: sourceName + t('redact.file.suffix') + '.png', from: 'redact' });
              // 다시 그려 내보내므로 사진에 붙어 있던 위치, 기기 정보도 함께 떨어진다
              say(t('redact.say.saved', { size: size(blob.size) }), 'ok');
              Toolbox.trackUse?.('save');
            }).catch(() => say(t('redact.err.render'), 'error'));
          };
  }
})();
