/**
 * 증명사진 (TASK-KL-316 / 27)
 *
 * 이미지 작업대의 할 일 한 칸. 셈은 `core/idphoto`(규격, 배치) + `core/bgremove`(배경).
 *
 * 얼굴을 자동으로 찾지 않는다. **규격이 요구하는 자리를 선으로 그려 주고** 사람이 맞춘다.
 * 끌어서 옮기고, 굴려서 키운다. 선 안에 들어오면 초록으로 바뀐다.
 * 자동으로 어긋나게 잘리는 것보다, 선 보고 맞춘 사진이 접수에서 안 튕긴다.
 */
import { SPECS, check as checkSpec, findSpec, plan, sheet, type Paper, type Spec } from '../../core/idphoto';
import { escapeHtml as esc } from './shared/text';
import { apply, guessBackground, maskOf } from '../../core/bgremove';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const BACKGROUNDS: Array<[string, string]> = [
    ['keep', ''],
    ['white', '#ffffff'],
    ['lightGray', '#e9ecef'],
    ['blue', '#dbe7f5']
  ];

  Toolbox.register({
    id: 'idphoto',
    title: t('widgets.idphoto.title', undefined, '증명사진'),
    category: 'image',
    desc: t(
      'widgets-desc.idphoto.desc',
      undefined,
      '여권, 주민증, 이력서 규격에 맞춰 자르고, 배경을 바꾸고, 인화지 한 장에 여러 장을 놓아 줍니다'
    ),
    layout: 'wide',
    icon: '<rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 19c1.5-3 8.5-3 10 0" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('idphoto.tab', undefined, '증명사진'),
        build: function (container: HTMLElement): void {
          void loadNamespace('idphoto').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('idphoto.mdd') });
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="ipSpec">${esc(t('idphoto.label.spec'))}</label>
          <select id="ipSpec" name="spec" aria-label="${esc(t('idphoto.label.spec'))}">
            ${SPECS.map((s) => `<option value="${s.id}">${esc(t('idphoto.country.' + s.country) + ', ' + t('idphoto.use.' + s.use) + '  ' + s.widthMm + '×' + s.heightMm + 'mm')}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label" for="ipBg">${esc(t('idphoto.label.background'))}</label>
          <select id="ipBg" name="background" aria-label="${esc(t('idphoto.label.background'))}">
            ${BACKGROUNDS.map(([key]) => `<option value="${key}">${esc(t('idphoto.bg.' + key))}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="field-label" for="ipFile">${esc(t('idphoto.label.file'))}</label>
          <input type="file" id="ipFile" name="photo" accept="image/*" aria-label="${esc(t('idphoto.label.file'))}">
        </div>
      </div>
      <div style="display:flex; gap:16px; flex-wrap:wrap;">
        <div>
          <canvas id="ipCanvas" style="border-radius:8px; border:1px solid rgba(128,128,128,.3); touch-action:none; cursor:grab;"></canvas>
          <div style="margin-top:var(--space-sm);">
            <div class="tool-sublabel">${esc(t('idphoto.label.zoom'))} <span id="ipZoomVal" class="range-value">100%</span></div>
            <input type="range" id="ipZoom" name="zoom" aria-label="${esc(t('idphoto.label.zoom'))}" min="20" max="400" value="100" style="width:260px;">
          </div>
        </div>
        <div style="flex:1; min-width:220px;">
          <div id="ipGuide" class="tool-list"></div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="ipSave">${esc(t('idphoto.btn.save'))}</button>
            <button class="btn btn-ghost" id="ipSheet">${esc(t('idphoto.btn.sheet'))}</button>
          </div>
          <div style="margin-top:var(--space-sm);">
            <label class="field-label" for="ipPaper">${esc(t('idphoto.label.paper'))}</label>
            <select id="ipPaper" name="paper" aria-label="${esc(t('idphoto.label.paper'))}">
              <option value="4x6">4×6 in</option>
              <option value="5x7">5×7 in</option>
              <option value="a4">A4</option>
            </select>
          </div>
        </div>
      </div>
      <div class="tool-status" id="ipStatus">${esc(t('idphoto.status.idle'))}</div>
      <p class="tool-hint">${esc(t('idphoto.note.rules'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const canvas = $<HTMLCanvasElement>('#ipCanvas');
    const status = $<HTMLElement>('#ipStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let photo: HTMLImageElement | undefined;
    /** 화면에서 보여 줄 배율. 300dpi 원본은 화면보다 크다 */
    let view = 1;
    let zoom = 1;
    let offset = { x: 0, y: 0 };
    let dragging: { x: number; y: number } | undefined;

    const spec = (): Spec => findSpec($<HTMLSelectElement>('#ipSpec').value) ?? SPECS[0];

    /** 규격대로 그린다. `forExport` 면 선을 안 그린다(선이 사진에 남으면 안 된다). */
    function paint(target: HTMLCanvasElement, dpi: number, forExport: boolean): void {
      const s = spec();
      const p = plan(s, dpi);
      target.width = p.widthPx;
      target.height = p.heightPx;
      const ctx = target.getContext('2d', { willReadFrequently: true });
      if (ctx === null) return;

      const bgKey = $<HTMLSelectElement>('#ipBg').value;
      const bgColor = BACKGROUNDS.find(([key]) => key === bgKey)?.[1] ?? '';
      ctx.fillStyle = bgColor === '' ? '#ffffff' : bgColor;
      ctx.fillRect(0, 0, target.width, target.height);

      if (photo !== undefined) {
        const scale = zoom * (p.heightPx / photo.height);
        const w = photo.width * scale;
        const h = photo.height * scale;
        ctx.drawImage(photo, offset.x * (dpi / 300), offset.y * (dpi / 300), w, h);

        if (bgColor !== '') {
          /* 배경 바꾸기 = 26번의 셈을 그대로 쓴다. 같은 일을 두 번 만들지 않는다. */
          const data = ctx.getImageData(0, 0, target.width, target.height);
          const background = guessBackground(data.data, target.width, target.height);
          const alpha = maskOf(data.data, target.width, target.height, { tolerance: 40, feather: 2, despill: true });
          const cut = apply(data.data, alpha, { despill: true }, background);
          const layer = ctx.createImageData(target.width, target.height);
          layer.data.set(cut);
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, target.width, target.height);
          const tmp = document.createElement('canvas');
          tmp.width = target.width;
          tmp.height = target.height;
          tmp.getContext('2d')?.putImageData(layer, 0, 0);
          ctx.drawImage(tmp, 0, 0);
        }
      }

      if (!forExport) {
        /* 규격이 요구하는 자리. 눈 띠와 머리 높이 */
        ctx.strokeStyle = 'rgba(70,140,255,.9)';
        ctx.lineWidth = Math.max(1, p.heightPx / 300);
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.moveTo(0, p.eyeTopPx);
        ctx.lineTo(target.width, p.eyeTopPx);
        ctx.moveTo(0, p.eyeBottomPx);
        ctx.lineTo(target.width, p.eyeBottomPx);
        ctx.stroke();
        ctx.fillStyle = 'rgba(70,140,255,.10)';
        ctx.fillRect(0, p.eyeTopPx, target.width, p.eyeBottomPx - p.eyeTopPx);
        ctx.setLineDash([]);
      }
    }

    function render(): void {
      const s = spec();
      const p = plan(s, 300);
      /* 화면에는 작게. 원본은 300dpi 그대로 둔다(내보낼 때 다시 그린다) */
      view = Math.min(1, 420 / p.heightPx);
      canvas.style.width = Math.round(p.widthPx * view) + 'px';
      canvas.style.height = Math.round(p.heightPx * view) + 'px';
      paint(canvas, 300, false);

      const sheetPlan = sheet(s, $<HTMLSelectElement>('#ipPaper').value as Paper, 300);
      $<HTMLElement>('#ipGuide').innerHTML = [
        ['size', s.widthMm + ' × ' + s.heightMm + ' mm  (' + p.widthPx + '×' + p.heightPx + ' px @300dpi)'],
        ['head', Math.round(s.headMin * 100) + '-' + Math.round(s.headMax * 100) + '%'],
        ['eyes', t('idphoto.guide.eyeBand')],
        ['background', t('idphoto.bgRule.' + s.background)],
        ['sheet', sheetPlan.cols + '×' + sheetPlan.rows + ' = ' + sheetPlan.slots.length + t('idphoto.guide.sheets')]
      ]
        .map(([k, v]) => '<div class="tool-list-row"><span class="tool-list-key">' + esc(t('idphoto.guide.' + k)) + '</span><span class="tool-list-val">' + esc(v) + '</span></div>')
        .join('');

      status.textContent = photo === undefined ? t('idphoto.status.idle') : t('idphoto.status.ready');
    }

    function download(blob: Blob, name: string): void {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    $<HTMLInputElement>('#ipFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#ipFile').files?.[0];
      if (file === undefined) return;
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = (): void => {
        URL.revokeObjectURL(url);
        photo = image;
        zoom = 1;
        offset = { x: 0, y: 0 };
        $<HTMLInputElement>('#ipZoom').value = '100';
        render();
      };
      image.onerror = (): void => {
        status.textContent = t('idphoto.status.badImage');
      };
      image.src = url;
    });

    container.querySelectorAll('select').forEach((el) => el.addEventListener('change', render));
    $<HTMLInputElement>('#ipZoom').addEventListener('input', (): void => {
      zoom = Number($<HTMLInputElement>('#ipZoom').value) / 100;
      $<HTMLElement>('#ipZoomVal').textContent = $<HTMLInputElement>('#ipZoom').value + '%';
      render();
    });

    /* 끌어서 옮기기. 규격 선에 맞추는 유일한 길이라 손에 붙어야 한다 */
    canvas.addEventListener('pointerdown', (event) => {
      dragging = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', (event) => {
      if (dragging === undefined) return;
      offset.x += (event.clientX - dragging.x) / view;
      offset.y += (event.clientY - dragging.y) / view;
      dragging = { x: event.clientX, y: event.clientY };
      render();
    });
    canvas.addEventListener('pointerup', (event) => {
      dragging = undefined;
      canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = 'grab';
    });

    /* ★ **자판만으로도 얼굴을 규격 선에 맞춘다** (2026-08-17). 끌기가 규격 선에 맞추는 유일한 길
       이라고 바로 위에 적혀 있었는데, 그러면 마우스가 없는 사람은 이 도구를 못 쓴다.
       화살표로 옮기고(Shift = 크게), 끌기와 **같은 offset** 을 만져 두 길이 안 갈린다. */
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', t('idphoto.a11y.canvas'));
    canvas.addEventListener('keydown', (event: KeyboardEvent) => {
      const step = (event.shiftKey ? 12 : 3) / view;
      let dx = 0;
      let dy = 0;
      if (event.key === 'ArrowLeft') dx = -step;
      else if (event.key === 'ArrowRight') dx = step;
      else if (event.key === 'ArrowUp') dy = -step;
      else if (event.key === 'ArrowDown') dy = step;
      else return;
      event.preventDefault();
      offset.x += dx;
      offset.y += dy;
      render();
    });

    $<HTMLButtonElement>('#ipSave').onclick = (): void => {
      if (photo === undefined) return;
      const out = document.createElement('canvas');
      paint(out, 300, true);
      out.toBlob((blob) => {
        if (blob === null) return;
        download(blob, spec().id + '.png');
        status.textContent = t('idphoto.status.saved');
        Toolbox.offerResult?.({ blob, name: spec().id + '.png', from: 'idphoto' });
      }, 'image/png');
    };

    $<HTMLButtonElement>('#ipSheet').onclick = (): void => {
      if (photo === undefined) return;
      const one = document.createElement('canvas');
      paint(one, 300, true);
      const s = spec();
      const layout = sheet(s, $<HTMLSelectElement>('#ipPaper').value as Paper, 300);
      const out = document.createElement('canvas');
      out.width = layout.widthPx;
      out.height = layout.heightPx;
      const ctx = out.getContext('2d');
      if (ctx === null) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      for (const slot of layout.slots) {
        ctx.drawImage(one, slot.x, slot.y, slot.w, slot.h);
        /* 자르는 선. 없으면 어디를 잘라야 할지 모른다 */
        ctx.strokeStyle = 'rgba(0,0,0,.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(slot.x + 0.5, slot.y + 0.5, slot.w, slot.h);
      }
      out.toBlob((blob) => {
        if (blob === null) return;
        download(blob, spec().id + '-sheet.png');
        status.textContent = t('idphoto.status.sheet', { n: layout.slots.length });
      }, 'image/png');
    };

    render();
  }
})();
