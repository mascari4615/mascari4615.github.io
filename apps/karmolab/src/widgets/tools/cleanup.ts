/**
 * 지우개 — 사진에서 거슬리는 것 지우기 (흡혈 원장 15 cleanup.pictures / TASK-KL-335)
 *
 * 「이미지」 작업대 § 가리기·지우기 의 할 일 한 칸. 셈은 `lib/inpaint`.
 *
 * ★ 이 도구가 **하지 않는 것**을 먼저 적는다: 없던 그림을 상상해서 그려 넣지 않는다.
 * 칠한 자리를 구멍으로 두고 **가장자리 색을 안쪽으로 밀어 넣어 덮는다.** 전깃줄·지나가는
 * 사람·워터마크·먼지처럼 **이어진 바탕** 위에 있는 것은 이걸로 깨끗하게 사라지고,
 * 벽돌 무늬 한가운데를 지우면 티가 난다. 화면에도 그렇게 적는다 — 「되는 줄 알았는데 안 되는」
 * 게 제일 나쁘다 (같은 이유로 `bgremove` 도 색 겹과 모양 겹을 갈라 말한다).
 *
 * ★ 손가락만으로 되는 도구를 만들지 않는다. 칠하기는 끌기가 제일 편하지만, 끌기만 있으면
 * 자판만 쓰는 사람에게는 **없는 도구**다. 그래서 십자 표시를 두고 화살표로 옮기며
 * 스페이스로 칠한다 — 같은 일을 하는 두 길이 같은 판에 있다.
 */
import { inpaint } from '../../lib/inpaint';
import { download, encode, loadImage } from './shared/image';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  Toolbox.register({
    id: 'cleanup',
    title: t('widgets.cleanup.title', undefined, '지우개'),
    category: 'tool',
    desc: t(
      'widgets-desc.cleanup.desc',
      undefined,
      '사진에서 거슬리는 것을 칠해서 지웁니다 — 주변 색으로 덮습니다. 사진이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon:
      '<path d="M8 20H5a1 1 0 0 1-.7-1.7l9-9a2 2 0 0 1 2.8 0l2.6 2.6a2 2 0 0 1 0 2.8L13 20" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>' +
      '<path d="M8 20h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M10.5 12.5l4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('cleanup.tab', undefined, '지우개'),
        build: function (container: HTMLElement): void {
          void loadNamespace('cleanup').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('cleanup.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="cuFile">${esc(t('cleanup.label.file'))}</label>
        <input type="file" id="cuFile" name="image" accept="image/*" aria-label="${esc(t('cleanup.label.file'))}">
      </div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('cleanup.label.brush'))} <span id="cuBrushVal" class="range-value">24</span></div>
          <input type="range" id="cuBrush" name="brush" aria-label="${esc(t('cleanup.label.brush'))}" min="4" max="120" value="24">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('cleanup.label.rounds'))} <span id="cuRoundsVal" class="range-value">64</span></div>
          <input type="range" id="cuRounds" name="rounds" aria-label="${esc(t('cleanup.label.rounds'))}" min="8" max="256" value="64">
        </div>
      </div>
      <div style="display:flex; gap:10px; margin:10px 0; flex-wrap:wrap;">
        <button class="btn btn-primary" id="cuRun">${esc(t('cleanup.btn.run'))}</button>
        <button class="btn btn-ghost" id="cuClear">${esc(t('cleanup.btn.clear'))}</button>
        <button class="btn btn-ghost" id="cuUndo">${esc(t('cleanup.btn.undo'))}</button>
        <button class="btn btn-ghost" id="cuSave">${esc(t('cleanup.btn.save'))}</button>
      </div>
      <div style="border-radius:10px; padding:8px; overflow:auto; background:var(--bg-tertiary);">
        <canvas id="cuCanvas" tabindex="0" role="application"
                aria-label="${esc(t('cleanup.aria.canvas'))}"
                style="max-width:100%; display:block; margin:0 auto; touch-action:none; cursor:crosshair;"></canvas>
      </div>
      <div class="tool-status" id="cuStatus">${esc(t('cleanup.status.idle'))}</div>
      <p class="tool-hint">${esc(t('cleanup.note.keys'))}</p>
      <p class="tool-hint tool-note">${esc(t('cleanup.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const canvas = $<HTMLCanvasElement>('#cuCanvas');
    const status = $<HTMLElement>('#cuStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291) — 자판만 쓰는 사람은 여기로 결과를 듣는다. */
    markLive(status);

    /** 지금 그림. 「메우기」를 누를 때마다 갱신된다. */
    let image: ImageData | undefined;
    /** 「되돌리기」 한 걸음 — 메우기 직전 그림. 여러 걸음은 안 쌓는다(큰 사진은 메모리가 는다). */
    let previous: ImageData | undefined;
    /** 칠한 자리. 그림과 같은 크기의 한 겹. */
    let painted: Uint8Array | undefined;
    /** 자판으로 옮기는 십자 표시. 마우스를 안 쓰는 사람의 「지금 여기」다. */
    const caret = { x: 0, y: 0, shown: false };
    let drawing = false;

    const brush = (): number => Number($<HTMLInputElement>('#cuBrush').value);

    function repaint(): void {
      if (image === undefined || painted === undefined) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) return;
      ctx.putImageData(image, 0, 0);

      /* 칠한 자리를 붉게 덮어 보여 준다 — **무엇이 지워질지**를 누르기 전에 보여야 한다. */
      const overlay = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < painted.length; i++) {
        if (painted[i] === 0) continue;
        overlay.data[i * 4] = Math.min(255, overlay.data[i * 4] * 0.4 + 255 * 0.6);
        overlay.data[i * 4 + 1] *= 0.4;
        overlay.data[i * 4 + 2] *= 0.4;
      }
      ctx.putImageData(overlay, 0, 0);

      if (caret.shown) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(caret.x, caret.y, brush() / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(caret.x, caret.y, brush() / 2 + 1, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    /** 한 점을 붓 크기만큼 칠한다. 화면 좌표가 아니라 **그림 좌표**로 받는다. */
    function paintAt(cx: number, cy: number): void {
      if (painted === undefined || image === undefined) return;
      const r = brush() / 2;
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(image.width - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(image.height - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r * r) painted[y * image.width + x] = 1;
        }
      }
    }

    /** 화면에서 누른 자리를 그림 좌표로. 캔버스가 줄어 보일 때 이걸 빼먹으면 엉뚱한 데가 칠해진다. */
    function toImage(event: { clientX: number; clientY: number }): { x: number; y: number } {
      const box = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - box.left) / box.width) * canvas.width,
        y: ((event.clientY - box.top) / box.height) * canvas.height
      };
    }

    function paintedCount(): number {
      if (painted === undefined) return 0;
      let n = 0;
      for (let i = 0; i < painted.length; i++) n += painted[i];
      return n;
    }

    /* ── 끌어서 칠하기 ─────────────────────────────────────────────────────── */

    canvas.addEventListener('pointerdown', (event: PointerEvent) => {
      if (image === undefined) return;
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const p = toImage(event);
      caret.x = p.x;
      caret.y = p.y;
      paintAt(p.x, p.y);
      repaint();
    });
    canvas.addEventListener('pointermove', (event: PointerEvent) => {
      if (!drawing || image === undefined) return;
      const p = toImage(event);
      caret.x = p.x;
      caret.y = p.y;
      paintAt(p.x, p.y);
      repaint();
    });
    const stop = (event: PointerEvent): void => {
      if (!drawing) return;
      drawing = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      status.textContent = t('cleanup.status.painted', { n: paintedCount() });
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    /* ── 자판으로 칠하기 (같은 일을 하는 두 번째 길) ────────────────────────── */

    canvas.addEventListener('focus', () => {
      if (image === undefined) return;
      caret.shown = true;
      repaint();
      status.textContent = t('cleanup.status.keys');
    });
    canvas.addEventListener('blur', () => {
      caret.shown = false;
      repaint();
    });
    canvas.addEventListener('keydown', (event: KeyboardEvent) => {
      if (image === undefined) return;
      /* 큰 걸음 = Shift. 4000px 짜리 사진을 1px 씩 옮기게 두면 그건 길이 아니라 벌이다. */
      const step = event.shiftKey ? Math.max(8, Math.round(brush())) : Math.max(1, Math.round(brush() / 4));
      let handled = true;
      switch (event.key) {
        case 'ArrowLeft':
          caret.x = Math.max(0, caret.x - step);
          break;
        case 'ArrowRight':
          caret.x = Math.min(canvas.width, caret.x + step);
          break;
        case 'ArrowUp':
          caret.y = Math.max(0, caret.y - step);
          break;
        case 'ArrowDown':
          caret.y = Math.min(canvas.height, caret.y + step);
          break;
        case 'Home':
          caret.x = 0;
          break;
        case 'End':
          caret.x = canvas.width;
          break;
        case ' ':
        case 'Enter':
          paintAt(caret.x, caret.y);
          status.textContent = t('cleanup.status.painted', { n: paintedCount() });
          break;
        case '+':
        case '=':
          $<HTMLInputElement>('#cuBrush').value = String(Math.min(120, brush() + 4));
          $<HTMLElement>('#cuBrushVal').textContent = String(brush());
          break;
        case '-':
          $<HTMLInputElement>('#cuBrush').value = String(Math.max(4, brush() - 4));
          $<HTMLElement>('#cuBrushVal').textContent = String(brush());
          break;
        default:
          handled = false;
      }
      if (handled) {
        event.preventDefault();
        repaint();
      }
    });

    /* ── 손잡이들 ──────────────────────────────────────────────────────────── */

    $<HTMLInputElement>('#cuBrush').addEventListener('input', () => {
      $<HTMLElement>('#cuBrushVal').textContent = String(brush());
      repaint();
    });
    $<HTMLInputElement>('#cuRounds').addEventListener('input', () => {
      $<HTMLElement>('#cuRoundsVal').textContent = $<HTMLInputElement>('#cuRounds').value;
    });

    $<HTMLInputElement>('#cuFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#cuFile').files?.[0];
      if (file === undefined) return;
      status.textContent = t('cleanup.status.reading');
      /* 주소를 거두는 시점이 `shared/image` 안에 맞춰져 있다 — 여기서 손으로 하지 않는다. */
      void loadImage(file)
        .then((img) => {
          /* 너무 큰 사진은 줄여서 셈한다 — 메우기는 한 판마다 그림 전체를 훑는다. */
          const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx === null) return;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          painted = new Uint8Array(canvas.width * canvas.height);
          previous = undefined;
          caret.x = canvas.width / 2;
          caret.y = canvas.height / 2;
          repaint();
          status.textContent = t('cleanup.status.ready');
        })
        .catch(() => {
          status.textContent = t('cleanup.status.badImage');
        });
    });

    $<HTMLButtonElement>('#cuRun').onclick = (): void => {
      if (image === undefined || painted === undefined) return;
      const n = paintedCount();
      if (n === 0) {
        status.textContent = t('cleanup.status.nothingPainted');
        return;
      }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) return;
      /* `ImageData` 는 바탕 버퍼가 확실한 배열만 받는다 — 캔버스에게 한 장 받아서 채운다. */
      previous = ctx.createImageData(image.width, image.height);
      previous.data.set(image.data);
      const rounds = Number($<HTMLInputElement>('#cuRounds').value);
      const out = inpaint(image.data, painted, image.width, image.height, rounds);
      const next = ctx.createImageData(image.width, image.height);
      next.data.set(out);
      image = next;
      painted = new Uint8Array(canvas.width * canvas.height);
      repaint();
      status.textContent = t('cleanup.status.done', { n });
    };

    $<HTMLButtonElement>('#cuClear').onclick = (): void => {
      if (image === undefined) return;
      painted = new Uint8Array(canvas.width * canvas.height);
      repaint();
      status.textContent = t('cleanup.status.cleared');
    };

    $<HTMLButtonElement>('#cuUndo').onclick = (): void => {
      if (previous === undefined) {
        status.textContent = t('cleanup.status.nothingToUndo');
        return;
      }
      image = previous;
      previous = undefined;
      painted = new Uint8Array(canvas.width * canvas.height);
      repaint();
      status.textContent = t('cleanup.status.undone');
    };

    $<HTMLButtonElement>('#cuSave').onclick = (): void => {
      if (image === undefined) return;
      /* 붉은 덧칠이 저장되면 안 된다 — 지금 그림만 따로 찍어서 내보낸다. */
      const plate = document.createElement('canvas');
      plate.width = canvas.width;
      plate.height = canvas.height;
      const ctx = plate.getContext('2d');
      if (ctx === null) return;
      ctx.putImageData(image, 0, 0);
      void encode(plate, 'png').then((blob) => {
        download(blob, 'cleaned.png');
        status.textContent = t('cleanup.status.saved');
        /* 다음 도구가 이어받을 수 있게 놓아 둔다 (작업대의 「이 결과로 이어서」) */
        Toolbox.offerResult?.({ blob, name: 'cleaned.png', from: 'cleanup' });
      });
    };
  }
})();
