/**
 * 배경 지우기 (TASK-KL-316 / 26)
 *
 * 「이미지」 작업대의 할 일 한 칸. 셈은 `core/bgremove`.
 * **단색·비슷한 배경만** 지운다고 화면에 그대로 적는다 — 사람 형태를 알아보는 것은
 * 학습 모형이 필요하고 이 사이트는 그런 걸 안 받는다. 「되는 줄 알았는데 안 되는」 게 제일 나쁘다.
 */
import { apply, guessBackground, maskOf, removedRatio } from '../../core/bgremove';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  Toolbox.register({
    id: 'bgremove',
    title: t('widgets.bgremove.title', undefined, '배경 지우기'),
    category: 'tool',
    desc: t(
      'widgets-desc.bgremove.desc',
      undefined,
      '단색이나 비슷한 배경을 지워 투명 PNG 로 만듭니다. 사진이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="3 3"/><path d="M8 15l3-4 2.5 3 2-2.5L18 15" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="8.5" r="1.4" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: t('bgremove.tab', undefined, '배경'),
        build: function (container: HTMLElement): void {
          void loadNamespace('bgremove').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('bgremove.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="brFile">${esc(t('bgremove.label.file'))}</label>
        <input type="file" id="brFile" name="image" accept="image/*" aria-label="${esc(t('bgremove.label.file'))}">
      </div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('bgremove.label.tolerance'))} <span id="brTolVal" class="range-value">32</span></div>
          <input type="range" id="brTol" name="tolerance" aria-label="${esc(t('bgremove.label.tolerance'))}" min="4" max="120" value="32">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('bgremove.label.feather'))} <span id="brFeatherVal" class="range-value">2</span></div>
          <input type="range" id="brFeather" name="feather" aria-label="${esc(t('bgremove.label.feather'))}" min="0" max="8" value="2">
        </div>
      </div>
      <div style="display:flex; gap:14px; margin:10px 0; flex-wrap:wrap;">
        <label class="tool-checkline">
          <input type="checkbox" id="brDespill" name="despill" checked> ${esc(t('bgremove.opt.despill'))}
        </label>
        <label class="tool-checkline">
          <input type="checkbox" id="brPickMode" name="pick"> ${esc(t('bgremove.opt.pick'))}
        </label>
        <button class="btn btn-ghost" id="brSave">${esc(t('bgremove.btn.save'))}</button>
      </div>
      <div style="background-image:linear-gradient(45deg,rgba(128,128,128,.25) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.25) 75%),linear-gradient(45deg,rgba(128,128,128,.25) 25%,transparent 25%,transparent 75%,rgba(128,128,128,.25) 75%); background-size:16px 16px; background-position:0 0,8px 8px; border-radius:10px; padding:8px; overflow:auto;">
        <canvas id="brCanvas" style="max-width:100%; display:block; margin:0 auto;"></canvas>
      </div>
      <div class="tool-status" id="brStatus">${esc(t('bgremove.status.idle'))}</div>
      <p class="tool-hint">${esc(t('bgremove.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const canvas = $<HTMLCanvasElement>('#brCanvas');
    const status = $<HTMLElement>('#brStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let source: ImageData | undefined;
    let pick: { x: number; y: number } | undefined;

    function render(): void {
      if (source === undefined) return;
      const tolerance = Number($<HTMLInputElement>('#brTol').value);
      const feather = Number($<HTMLInputElement>('#brFeather').value);
      $<HTMLElement>('#brTolVal').textContent = String(tolerance);
      $<HTMLElement>('#brFeatherVal').textContent = String(feather);

      const options = { tolerance, feather, pick, despill: $<HTMLInputElement>('#brDespill').checked };
      const background = pick === undefined ? guessBackground(source.data, source.width, source.height) : undefined;
      const alpha = maskOf(source.data, source.width, source.height, options);
      const out = apply(source.data, alpha, options, background);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return;
      /* `ImageData` 는 바탕 버퍼가 확실한 배열만 받는다 — 한 벌 떠서 넘긴다. */
      const shown = ctx.createImageData(source.width, source.height);
      shown.data.set(out);
      ctx.putImageData(shown, 0, 0);

      const gone = Math.round(removedRatio(alpha) * 100);
      status.textContent =
        gone === 0
          ? t('bgremove.status.nothing')
          : gone > 95
            ? t('bgremove.status.tooMuch', { n: gone })
            : t('bgremove.status.ok', { n: gone });
    }

    $<HTMLInputElement>('#brFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#brFile').files?.[0];
      if (file === undefined) return;
      status.textContent = t('bgremove.status.reading');
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = (): void => {
        URL.revokeObjectURL(url);
        /* 너무 큰 사진은 줄여서 셈한다 — 4000×3000 을 그대로 훑으면 화면이 멎는다. */
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null) return;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        source = ctx.getImageData(0, 0, canvas.width, canvas.height);
        pick = undefined;
        render();
      };
      image.onerror = (): void => {
        status.textContent = t('bgremove.status.badImage');
      };
      image.src = url;
    });

    container.querySelectorAll('input[type="range"], input[type="checkbox"]').forEach((el) => el.addEventListener('input', render));

    /* 배경을 콕 집기 — 모서리가 배경이 아닌 사진(가장자리에 물체가 닿는 사진)에서 필요하다. */
    canvas.addEventListener('click', (event) => {
      if (!$<HTMLInputElement>('#brPickMode').checked || source === undefined) return;
      const box = canvas.getBoundingClientRect();
      pick = {
        x: Math.round(((event.clientX - box.left) / box.width) * canvas.width),
        y: Math.round(((event.clientY - box.top) / box.height) * canvas.height)
      };
      render();
    });

    $<HTMLButtonElement>('#brSave').onclick = (): void => {
      if (source === undefined) return;
      canvas.toBlob((blob) => {
        if (blob === null) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'no-background.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = t('bgremove.status.saved');
        /* 다음 도구가 이어받을 수 있게 놓아 둔다 (작업대의 「이 결과로 이어서」) */
        Toolbox.offerResult?.({ blob, name: 'no-background.png', from: 'bgremove' });
      }, 'image/png');
    };
  }
})();
