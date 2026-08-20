/**
 * 배경 지우기 (TASK-KL-316 / 26 · 모양 겹 = 흡혈 원장 14 / TASK-KL-238)
 *
 * 「이미지」 작업대의 할 일 한 칸. 셈은 `core/bgremove`.
 *
 * 겹이 둘이다. **색**으로 지우는 쪽(`core/bgremove`)이 기본이고 — 증명사진·상품 사진에서는
 * 이게 제일 빠르고 정확하다, 받을 것도 없다. 그 위에 **모양**으로 오려내는 쪽(`lib/ai-cutout`)이
 * 얹힌다. 오래 이 파일에는 「사람 형태를 알아보는 것은 학습 모형이 필요하고 이 사이트는 그런 걸
 * 안 받는다」고 적혀 있었는데, 그건 **모델을 어디에 둘지가 안 정해져서** 그랬던 것이고
 * (`ai-engine.ts` 2026-08-10) 그 답은 이미 나와 있었다: 켠 사람만 그때 받는다.
 *
 * ★ 철칙은 그대로다 — **모양 겹이 없어도 도구는 그대로 열린다.** WebGPU 가 없으면 더 무거운
 * 판(q8)으로 내려가고, 아무 것도 못 하면 그 자리를 **아예 안 보여 준다**(오류 X).
 */
import { apply, guessBackground, maskOf, removedRatio } from '../../core/bgremove';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';
import { AiGate } from '../../lib/ai-gate';
import { loadEngine, webgpuAvailable } from '../../lib/ai-engine';
import {
  CUTOUT_MODELS,
  alphaOf,
  applyAlpha,
  cutout,
  keptRatio,
  resampleAlpha,
  sizeMbFor,
  trimBox,
  type CutoutKind
} from '../../lib/ai-cutout';

(function (): void {

  Toolbox.register({
    id: 'bgremove',
    title: t('widgets.bgremove.title', undefined, '배경 지우기'),
    category: 'tool',
    desc: t(
      'widgets-desc.bgremove.desc',
      undefined,
      '배경을 지워 투명 PNG 로 만듭니다 — 색으로 지우거나, 모양을 알아보고 오려냅니다. 사진이 브라우저를 벗어나지 않습니다'
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
        <label class="tool-checkline">
          <input type="checkbox" id="brTrim" name="trim"> ${esc(t('bgremove.opt.trim'))}
        </label>
        <button class="btn btn-ghost" id="brSave">${esc(t('bgremove.btn.save'))}</button>
      </div>
      <div id="brAiPanel" style="display:none; border:1px solid var(--border); border-radius:10px; padding:10px 12px; margin:10px 0;">
        <div class="tool-sublabel">${esc(t('bgremove.ai.title'))}</div>
        <div style="display:flex; gap:8px; margin:8px 0; flex-wrap:wrap;">
          <button class="btn btn-ghost" id="brAiPerson">${esc(t('bgremove.ai.person'))}</button>
          <button class="btn btn-ghost" id="brAiAnything">${esc(t('bgremove.ai.anything'))}</button>
        </div>
        <div class="tool-status" id="brAiSay"></div>
        <p class="tool-hint" id="brAiLicense"></p>
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
    /**
     * 모양 겹이 찾아 준 가리개. 있으면 **색 눈금을 무시한다** — 두 겹을 섞으면 어느 쪽이
     * 지운 건지 아무도 모르게 되고, 사람은 눈금을 돌리며 「왜 안 변하지」를 하게 된다.
     * 그래서 눈금을 건드리는 순간 이걸 버리고 색 겹으로 돌아간다.
     */
    let aiAlpha: Uint8ClampedArray | undefined;

    /** 남은 것에 맞춰 잘라 그린다. 잘릴 게 없으면 원래 크기 그대로. */
    function paint(rgba: Uint8ClampedArray, width: number, height: number, alpha: Uint8ClampedArray): void {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx === null) return;
      const box = $<HTMLInputElement>('#brTrim').checked ? trimBox(alpha, width, height) : null;
      canvas.width = box === null ? width : box.width;
      canvas.height = box === null ? height : box.height;
      const shown = ctx.createImageData(canvas.width, canvas.height);
      if (box === null) {
        shown.data.set(rgba);
      } else {
        for (let y = 0; y < box.height; y++) {
          const from = ((box.y + y) * width + box.x) * 4;
          shown.data.set(rgba.subarray(from, from + box.width * 4), y * box.width * 4);
        }
      }
      ctx.putImageData(shown, 0, 0);
    }

    function render(): void {
      if (source === undefined) return;
      const tolerance = Number($<HTMLInputElement>('#brTol').value);
      const feather = Number($<HTMLInputElement>('#brFeather').value);
      $<HTMLElement>('#brTolVal').textContent = String(tolerance);
      $<HTMLElement>('#brFeatherVal').textContent = String(feather);

      if (aiAlpha !== undefined) {
        /* 모양 겹: **색은 원본에서, 모양만 모델에서.** 모델이 낸 그림을 그대로 쓰면
           줄어든 사진을 저장하게 된다. */
        const out = applyAlpha(source.data, aiAlpha);
        paint(out, source.width, source.height, aiAlpha);
        const kept = Math.round(keptRatio(aiAlpha) * 100);
        status.textContent =
          kept === 0
            ? t('bgremove.ai.empty')
            : kept >= 99
              ? t('bgremove.ai.full')
              : t('bgremove.ai.done', { n: kept });
        return;
      }

      const options = { tolerance, feather, pick, despill: $<HTMLInputElement>('#brDespill').checked };
      const background = pick === undefined ? guessBackground(source.data, source.width, source.height) : undefined;
      const alpha = maskOf(source.data, source.width, source.height, options);
      const out = apply(source.data, alpha, options, background);
      paint(out, source.width, source.height, alpha);

      const gone = Math.round(removedRatio(alpha) * 100);
      status.textContent =
        gone === 0
          ? t('bgremove.status.nothing')
          : gone> 95
            ? t('bgremove.status.tooMuch', { n: gone })
            : t('bgremove.status.ok', { n: gone });
    }

    /* ── 모양으로 오려내기 (흡혈 원장 14 / TASK-KL-335) ────────────────────── */

    const aiSay = (msg: string, tone = ''): void => {
      const el = container.querySelector('#brAiSay') as HTMLElement | null;
      if (el === null) return;
      el.textContent = msg;
      el.className = `tool-status${tone === '' ? '' : ' ' + tone}`;
    };

    /** 겹마다 게이트가 따로다 — 사람 겹을 받아 뒀다고 물건 겹이 공짜가 되는 건 아니다. */
    const gates = new Map<CutoutKind, AiGate>();

    /** 사진을 고른 뒤에만 보여 준다. 못 하는 자리에서는 **아예 안 보여 준다**(오류 X). */
    function showAiPanel(): void {
      const panel = container.querySelector('#brAiPanel') as HTMLElement | null;
      if (panel === null) return;
      panel.style.display = '';
      const webgpu = webgpuAvailable();
      const person = CUTOUT_MODELS.person;
      const anything = CUTOUT_MODELS.anything;
      $<HTMLButtonElement>('#brAiPerson').textContent = t('bgremove.ai.person', {
        mb: sizeMbFor(person, webgpu)
      });
      $<HTMLButtonElement>('#brAiAnything').textContent = t('bgremove.ai.anything', {
        mb: sizeMbFor(anything, webgpu)
      });
      aiSay(t('bgremove.ai.hint'));
      /* 라이선스를 화면에 그대로 적는다 — 숨기면 나중에 곤란해지는 건 우리다. */
      $<HTMLElement>('#brAiLicense').textContent = `${t('bgremove.ai.license', {
        person: `${person.repo} · ${person.license}`,
        anything: `${anything.repo} · ${anything.license}`
      })} ${t('bgremove.ai.noncommercial')}`;
    }

    async function runCutout(kind: CutoutKind): Promise<void> {
      if (source === undefined) return;
      const webgpu = webgpuAvailable();
      const model = CUTOUT_MODELS[kind];
      const buttons = [$<HTMLButtonElement>('#brAiPerson'), $<HTMLButtonElement>('#brAiAnything')];
      buttons.forEach((b) => (b.disabled = true));

      /* 모델에 넘길 그림은 **원본이 아니라 지금 캔버스**다. 그런데 캔버스에는 방금 지운
         결과가 들어 있을 수 있으므로, 원본 색을 한 장 따로 떠서 넘긴다. */
      const plate = document.createElement('canvas');
      plate.width = source.width;
      plate.height = source.height;
      const plateCtx = plate.getContext('2d');
      if (plateCtx === null) {
        buttons.forEach((b) => (b.disabled = false));
        return;
      }
      plateCtx.putImageData(source, 0, 0);
      const png = plate.toDataURL('image/png');

      let gate = gates.get(kind);
      if (gate === undefined) {
        gate = new AiGate({
          sizeMb: sizeMbFor(model, webgpu),
          fetch: async (onProgress) => {
            const engine = await loadEngine();
            const got = await cutout(engine, png, kind, { onProgress, webgpu });
            const raw = alphaOf(got.rgba);
            /* 판에 따라 다른 크기로 돌려주는 일이 있다. 안 맞추면 사람 옆에 유령이 생긴다. */
            aiAlpha = resampleAlpha(raw, got.width, got.height, source!.width, source!.height);
            render();
          },
          onChange: (v) => aiSay(v.say, v.state === 'failed' ? 'error' : '')
        });
        gates.set(kind, gate);
      }

      /* 이미 받아 둔 겹이면 게이트는 곧바로 통과하고, 안에서 다시 오려낸다. */
      await gate.accept();
      buttons.forEach((b) => (b.disabled = false));
    }

    $<HTMLButtonElement>('#brAiPerson').onclick = (): void => void runCutout('person');
    $<HTMLButtonElement>('#brAiAnything').onclick = (): void => void runCutout('anything');

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
        aiAlpha = undefined; // 새 사진에 지난 사진의 가리개를 씌우면 엉뚱한 데가 뚫린다
        render();
        showAiPanel();
      };
      image.onerror = (): void => {
        status.textContent = t('bgremove.status.badImage');
      };
      image.src = url;
    });

    /*
     * 눈금·색 관련 손잡이를 건드리면 **색 겹으로 돌아간다.** 안 그러면 모양 겹이 켜진 채로
     * 눈금만 돌아가서 「왜 아무 변화가 없지」가 된다 — 고장 같지만 고장이 아닌, 제일 나쁜 종류.
     * 「여백까지 자르기」는 어느 겹에서든 뜻이 같으므로 겹을 안 바꾼다.
     */
    container
      .querySelectorAll('input[type="range"], #brDespill, #brPickMode')
      .forEach((el) =>
        el.addEventListener('input', () => {
          if (aiAlpha !== undefined) {
            aiAlpha = undefined;
            aiSay(t('bgremove.ai.backToColor'));
          }
          render();
        })
      );
    $<HTMLInputElement>('#brTrim').addEventListener('input', render);

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
