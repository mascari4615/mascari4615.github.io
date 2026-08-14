/**
 * 그림 속 글자 읽기 (TASK-KL-316 / 29)
 *
 * 「이미지」 작업대의 할 일 한 칸. 갈래 가르기·다듬기는 `core/ocr`, 펴기·이진화는 `core/docscan`.
 *
 * 이 화면이 지키는 것 셋:
 *   ① **글자 든 PDF 는 여기서 안 읽는다** — `pdf2text` 로 보낸다(그쪽이 더 정확하고 빠르다).
 *   ② 모형은 **켠 사람만** 받는다(`lib/ai-engine` 규약) — 크기를 먼저 말해 준다.
 *   ③ 한국어·일본어는 **아직 못 읽는다고 말한다**. 되는 척하면 사람이 자기 사진을 의심한다.
 */
import { looksEmpty, modelFor, route, tidy } from '../../core/ocr';
import { enhance } from '../../core/docscan';
import { loadEngine, webgpuAvailable } from '../../lib/ai-engine';
import { markLive } from './shared/say';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'ocr',
    title: t('widgets.ocr.title', undefined, '그림 속 글자 읽기'),
    category: 'tool',
    desc: t(
      'widgets-desc.ocr.desc',
      undefined,
      '사진 속 글자를 읽어 냅니다. 글자가 든 PDF 는 더 정확한 도구로 보내 주고, 모형은 켤 때만 받습니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 10h6M7 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M17 7l2 2-2 2" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('ocr.tab', undefined, '글자 읽기'),
        build: function (container: HTMLElement): void {
          void loadNamespace('ocr').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  interface Pipe {
    (input: unknown): Promise<Array<{ generated_text?: string }>>;
  }

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('ocr.mdd') });
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap; margin-bottom:10px;">
        <div>
          <label class="field-label" for="ocFile">${esc(t('ocr.label.file'))}</label>
          <input type="file" id="ocFile" name="file" accept="image/*,application/pdf" aria-label="${esc(t('ocr.label.file'))}">
        </div>
        <div>
          <label class="field-label" for="ocLang">${esc(t('ocr.label.language'))}</label>
          <select id="ocLang" name="language" aria-label="${esc(t('ocr.label.language'))}">
            <option value="en">English</option>
            <option value="de">Deutsch</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="ko">한국어</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="ocClean" name="clean" style="width:auto;" checked> ${esc(t('ocr.opt.clean'))}
        </label>
        <button class="btn btn-primary" id="ocRead">${esc(t('ocr.btn.read'))}</button>
      </div>
      <div id="ocRoute" style="display:none; padding:10px; border-radius:10px; background:rgba(128,128,128,.12); margin-bottom:10px;"></div>
      <div style="display:flex; gap:16px; flex-wrap:wrap;">
        <div>
          <div class="tool-sublabel">${esc(t('ocr.label.prepared'))}</div>
          <canvas id="ocCanvas" style="border-radius:8px; border:1px solid rgba(128,128,128,.3); max-width:100%;"></canvas>
        </div>
        <div style="flex:1; min-width:240px;">
          <div class="tool-sublabel">${esc(t('ocr.label.text'))}</div>
          <textarea id="ocText" name="text" aria-label="${esc(t('ocr.label.text'))}" class="mono-input" style="min-height:240px;"></textarea>
          <button class="btn btn-ghost" id="ocCopy" style="margin-top:8px;">${esc(t('ocr.btn.copy'))}</button>
        </div>
      </div>
      <div class="tool-status" id="ocStatus">${esc(t('ocr.status.idle'))}</div>
      <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('ocr.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const canvas = $<HTMLCanvasElement>('#ocCanvas');
    const status = $<HTMLElement>('#ocStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    let prepared: HTMLCanvasElement | undefined;
    let pipe: Pipe | undefined;

    function showRoute(kind: string): void {
      const plan = route(kind);
      const box = $<HTMLElement>('#ocRoute');
      if (plan.tool === 'pdf2text') {
        box.style.display = '';
        box.innerHTML =
          esc(t('ocr.route.pdfHasText')) +
          ' <a class="btn btn-ghost" style="margin-left:8px;" href="/karmolab/t/pdf2text/">' + esc(t('ocr.route.goPdf2text')) + '</a>';
        return;
      }
      if (plan.route === 'unsupported') {
        box.style.display = '';
        box.textContent = t('ocr.route.unsupported');
        return;
      }
      box.style.display = 'none';
    }

    $<HTMLInputElement>('#ocFile').addEventListener('change', (): void => {
      const file = $<HTMLInputElement>('#ocFile').files?.[0];
      if (file === undefined) return;
      showRoute(file.type === '' ? file.name : file.type);
      if (file.type.includes('pdf')) {
        status.textContent = t('ocr.status.pdf');
        return;
      }
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = (): void => {
        URL.revokeObjectURL(url);
        /* 읽기 전에 다듬는다 — 회색·지역 이진화가 인식률을 크게 바꾼다(28번의 셈을 그대로 쓴다). */
        const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.style.width = Math.min(360, canvas.width) + 'px';
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx === null) return;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const cleaned = $<HTMLInputElement>('#ocClean').checked
          ? enhance(data.data, canvas.width, canvas.height, 'scan')
          : data.data;
        const shown = ctx.createImageData(canvas.width, canvas.height);
        shown.data.set(cleaned);
        ctx.putImageData(shown, 0, 0);
        prepared = canvas;
        status.textContent = t('ocr.status.ready');
      };
      image.onerror = (): void => {
        status.textContent = t('ocr.status.badImage');
      };
      image.src = url;
    });

    $<HTMLButtonElement>('#ocRead').onclick = async (): Promise<void> => {
      const language = $<HTMLSelectElement>('#ocLang').value;
      const model = modelFor(language);
      if (model === undefined) {
        /* 못 읽는 말은 **못 읽는다고 말한다** — 빈 답을 주면 사람이 자기 사진을 의심한다. */
        status.textContent = t('ocr.status.noModel', { language: $<HTMLSelectElement>('#ocLang').selectedOptions[0].text });
        return;
      }
      if (prepared === undefined) {
        status.textContent = t('ocr.status.needImage');
        return;
      }
      if (!webgpuAvailable()) {
        status.textContent = t('ocr.status.noGpu');
        return;
      }
      try {
        if (pipe === undefined) {
          status.textContent = t('ocr.status.downloading', { mb: model.sizeMb });
          const engine = await loadEngine();
          pipe = (await engine.pipeline('image-to-text', model.id)) as Pipe;
        }
        status.textContent = t('ocr.status.reading');
        const got = await pipe(prepared.toDataURL('image/png'));
        const raw = got.map((r) => r.generated_text ?? '').join('\n');
        const text = $<HTMLInputElement>('#ocClean').checked ? tidy(raw) : raw;
        $<HTMLTextAreaElement>('#ocText').value = text;
        status.textContent = looksEmpty(text) ? t('ocr.status.empty') : t('ocr.status.done', { n: text.length });
      } catch (e) {
        status.textContent = t('ocr.status.failed', { msg: String((e as Error).message) });
      }
    };

    $<HTMLButtonElement>('#ocCopy').onclick = async (): Promise<void> => {
      const text = $<HTMLTextAreaElement>('#ocText').value;
      if (text === '') return;
      await Toolbox.copyText?.(text, { message: t('ocr.copied') });
    };
  }
})();
