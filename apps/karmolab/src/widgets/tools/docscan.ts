/**
 * 서류 스캔 (TASK-KL-316 / 28)
 *
 * 「이미지」 작업대의 할 일 한 칸. 셈은 `core/docscan`.
 * 네 모서리를 끌어서 종이 귀퉁이에 맞추면 반듯하게 펴진다. PDF 로도 낸다(A4 에 얹어서).
 * 모서리를 자동으로 안 찾는 이유는 알맹이 머리말에 적어 뒀다 — 요약하면 **틀렸을 때 이유가 안 보인다**.
 */
import { enhance, fitA4, guessSize, warp, type Corners, type Look } from '../../core/docscan';
import { loadPdfLib, pdfBlob } from './shared/pdf';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'docscan',
    title: t('widgets.docscan.title', undefined, '서류 스캔'),
    category: 'tool',
    desc: t(
      'widgets-desc.docscan.desc',
      undefined,
      '비스듬히 찍은 서류를 반듯하게 펴고 스캔처럼 다듬어 PNG·PDF 로 냅니다. 사진이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M5 4l14 2v12l-14 2z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M8 9h8M8 13h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('docscan.tab', undefined, '스캔'),
        build: function (container: HTMLElement): void {
          void loadNamespace('docscan').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('docscan.mdd') });
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="dsFile">${esc(t('docscan.label.file'))}</label>
          <input type="file" id="dsFile" name="photo" accept="image/*" aria-label="${esc(t('docscan.label.file'))}">
        </div>
        <div>
          <label class="field-label" for="dsLook">${esc(t('docscan.label.look'))}</label>
          <select id="dsLook" name="look" aria-label="${esc(t('docscan.label.look'))}">
            <option value="scan">${esc(t('docscan.look.scan'))}</option>
            <option value="gray">${esc(t('docscan.look.gray'))}</option>
            <option value="color">${esc(t('docscan.look.color'))}</option>
          </select>
        </div>
        <button class="btn btn-ghost" id="dsReset">${esc(t('docscan.btn.reset'))}</button>
      </div>
      <div style="display:flex; gap:16px; flex-wrap:wrap;">
        <div>
          <div class="tool-sublabel">${esc(t('docscan.label.pick'))}</div>
          <canvas id="dsPick" style="border-radius:8px; border:1px solid rgba(128,128,128,.3); touch-action:none; cursor:crosshair; max-width:100%;"></canvas>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('docscan.label.result'))}</div>
          <canvas id="dsOut" style="border-radius:8px; border:1px solid rgba(128,128,128,.3); max-width:100%;"></canvas>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0;">
        <button class="btn btn-primary" id="dsPng">${esc(t('docscan.btn.png'))}</button>
        <button class="btn btn-ghost" id="dsPdf">${esc(t('docscan.btn.pdf'))}</button>
      </div>
      <div class="tool-status" id="dsStatus">${esc(t('docscan.status.idle'))}</div>
      <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('docscan.note.manual'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const pick = $<HTMLCanvasElement>('#dsPick');
    const out = $<HTMLCanvasElement>('#dsOut');
    const status = $<HTMLElement>('#dsStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let photo: HTMLImageElement | undefined;
    let source: ImageData | undefined;
    let corners: Corners | undefined;
    let dragging = -1;

    function defaultCorners(w: number, h: number): Corners {
      const inset = 0.08;
      return [
        { x: w * inset, y: h * inset },
        { x: w * (1 - inset), y: h * inset },
        { x: w * (1 - inset), y: h * (1 - inset) },
        { x: w * inset, y: h * (1 - inset) }
      ];
    }

    function paintPick(): void {
      if (photo === undefined || corners === undefined) return;
      const ctx = pick.getContext('2d');
      if (ctx === null) return;
      ctx.drawImage(photo, 0, 0, pick.width, pick.height);
      ctx.strokeStyle = 'rgba(70,140,255,.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = 'rgba(70,140,255,.95)';
      for (const c of corners) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function render(): void {
      if (source === undefined || corners === undefined) return;
      const size = guessSize(corners);
      const scale = source.width / pick.width;
      const real: Corners = corners.map((c) => ({ x: c.x * scale, y: c.y * scale })) as Corners;
      const width = Math.round(size.width * scale);
      const height = Math.round(size.height * scale);
      const flat = warp(source.data, source.width, source.height, real, width, height);
      const looked = enhance(flat, width, height, $<HTMLSelectElement>('#dsLook').value as Look);
      out.width = width;
      out.height = height;
      out.style.width = Math.min(360, width) + 'px';
      const ctx = out.getContext('2d');
      if (ctx === null) return;
      const image = ctx.createImageData(width, height);
      image.data.set(looked);
      ctx.putImageData(image, 0, 0);
      paintPick();
      status.textContent = t('docscan.status.ready', { w: width, h: height });
    }

    $<HTMLInputElement>('#dsFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#dsFile').files?.[0];
      if (file === undefined) return;
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = (): void => {
        URL.revokeObjectURL(url);
        photo = image;
        /* 고르는 화면은 작게, 셈은 원본으로 — 큰 사진에서 손이 안 무겁게. */
        const view = Math.min(1, 420 / Math.max(image.width, image.height));
        pick.width = Math.round(image.width * view);
        pick.height = Math.round(image.height * view);
        const tmp = document.createElement('canvas');
        tmp.width = Math.min(image.width, 2000);
        tmp.height = Math.round((tmp.width / image.width) * image.height);
        const tctx = tmp.getContext('2d', { willReadFrequently: true });
        if (tctx === null) return;
        tctx.drawImage(image, 0, 0, tmp.width, tmp.height);
        source = tctx.getImageData(0, 0, tmp.width, tmp.height);
        corners = defaultCorners(pick.width, pick.height);
        render();
      };
      image.onerror = (): void => {
        status.textContent = t('docscan.status.badImage');
      };
      image.src = url;
    });

    pick.addEventListener('pointerdown', (event) => {
      if (corners === undefined) return;
      const box = pick.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width) * pick.width;
      const y = ((event.clientY - box.top) / box.height) * pick.height;
      let best = 0;
      let bestDist = Infinity;
      corners.forEach((c, i) => {
        const d = Math.hypot(c.x - x, c.y - y);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      dragging = best;
      pick.setPointerCapture(event.pointerId);
    });
    pick.addEventListener('pointermove', (event) => {
      if (dragging < 0 || corners === undefined) return;
      const box = pick.getBoundingClientRect();
      corners[dragging] = {
        x: Math.max(0, Math.min(pick.width, ((event.clientX - box.left) / box.width) * pick.width)),
        y: Math.max(0, Math.min(pick.height, ((event.clientY - box.top) / box.height) * pick.height))
      };
      paintPick();
    });
    pick.addEventListener('pointerup', (event) => {
      if (dragging < 0) return;
      dragging = -1;
      pick.releasePointerCapture(event.pointerId);
      render();
    });

    $<HTMLSelectElement>('#dsLook').addEventListener('change', render);
    $<HTMLButtonElement>('#dsReset').onclick = (): void => {
      if (photo === undefined) return;
      corners = defaultCorners(pick.width, pick.height);
      render();
    };

    function download(blob: Blob, name: string): void {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    $<HTMLButtonElement>('#dsPng').onclick = (): void => {
      if (source === undefined) return;
      out.toBlob((blob) => {
        if (blob === null) return;
        download(blob, 'scan.png');
        status.textContent = t('docscan.status.savedPng');
        Toolbox.offerResult?.({ blob, name: 'scan.png', from: 'docscan' });
      }, 'image/png');
    };

    $<HTMLButtonElement>('#dsPdf').onclick = async (): Promise<void> => {
      if (source === undefined) return;
      status.textContent = t('docscan.status.pdf');
      try {
        const library = await loadPdfLib();
        if (library === null) throw new Error(t('docscan.err.pdfLib'));
        const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
        if (blob === null) throw new Error(t('docscan.err.png'));
        const doc = await library.PDFDocument.create();
        const png = await doc.embedPng(await blob.arrayBuffer());
        const fit = fitA4(out.width, out.height);
        /* 쪽 크기는 우리가 정했으니 그대로 쓴다 — `getWidth()` 를 쓰면 우리 타입에 없다. */
        const pageW = fit.landscape ? 842 : 595;
        const pageH = fit.landscape ? 595 : 842;
        const page = doc.addPage([pageW, pageH]);
        const mmToPt = (mm: number): number => (mm / 25.4) * 72;
        const w = mmToPt(fit.widthMm);
        const h = mmToPt(fit.heightMm);
        page.drawImage(png, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
        const pdf = pdfBlob(await doc.save());
        download(pdf, 'scan.pdf');
        status.textContent = t('docscan.status.savedPdf');
        Toolbox.offerResult?.({ blob: pdf, name: 'scan.pdf', from: 'docscan' });
      } catch (e) {
        status.textContent = String((e as Error).message);
      }
    };
  }
})();
