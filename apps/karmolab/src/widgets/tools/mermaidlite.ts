/**
 * 글로 그리는 그림판 (TASK-KL-316 / 10)
 *
 * 개발 도구 작업대의 **만들기** 칸. 알맹이는 `core/mermaidlite`.
 * 치는 동안 바로 그려지고, SVG, PNG 로 내려받는다. 아무것도 올리지 않는다.
 *
 * 진짜 mermaid 를 안 쓴다. 이 저장소엔 그 꾸러미가 없고(3MB), 우리가 그리는 건
 * 흐름도와 표 관계 둘이다. 못 읽는 줄은 **숨기지 않고** 아래에 적는다.
 */
import { check, parse, toSvg, spec } from '../../core/mermaidlite';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const SAMPLE = 'flowchart TD\n  A[글을 쓴다] --> B{그림이 필요한가}\n  B -->|응| C(여기에 적는다)\n  B -->|아니| D[그냥 글로]\n  C --> E((끝))';

  Toolbox.register({
    id: 'mermaidlite',
    title: t('widgets.mermaidlite.title', undefined, '글로 그리는 그림판'),
    category: 'tool',
    desc: t(
      'widgets-desc.mermaidlite.desc',
      undefined,
      'mermaid 문법으로 흐름도, 표 관계를 그리고 SVG, PNG 로 저장합니다. 치는 동안 바로 그려집니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="3" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="14" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6.5 8v4h11v4M6.5 12v4" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('mermaidlite.tab', undefined, '그림'),
        build: function (container: HTMLElement): void {
          void loadNamespace('mermaidlite').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('mermaidlite.mdd') });
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('mermaidlite.label.in'))}</div>
          <textarea id="mlIn" name="text" aria-label="${esc(t('mermaidlite.label.in'))}" class="mono-input" style="min-height:280px;"></textarea>
          <pre id="mlCheck" class="mono-input" style="white-space:pre-wrap; padding:10px; margin-top:8px; font-size:12px;"></pre>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('mermaidlite.label.out'))}</div>
          <div id="mlPic" style="overflow:auto; border:1px solid rgba(128,128,128,.24); border-radius:10px; padding:10px; min-height:280px;"></div>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 var(--space-lg);">
        <button class="btn btn-primary" id="mlSvg">${esc(t('mermaidlite.btn.svg'))}</button>
        <button class="btn btn-ghost" id="mlPng">${esc(t('mermaidlite.btn.png'))}</button>
        <button class="btn btn-ghost" id="mlCopy">${esc(t('mermaidlite.btn.copy'))}</button>
      </div>
      <div class="tool-status" id="mlStatus">${esc(t('mermaidlite.status.idle'))}</div>
      <p class="tool-hint">${esc(t('mermaidlite.note.subset'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#mlIn');
    const pic = $<HTMLElement>('#mlPic');
    const status = $<HTMLElement>('#mlStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    input.value = SAMPLE;
    let svg = '';

    function render(): void {
      const diagram = parse(input.value);
      $<HTMLElement>('#mlCheck').textContent = check(diagram);
      if (diagram.kind === 'unknown') {
        pic.textContent = '';
        svg = '';
        status.textContent = t('mermaidlite.status.unknown');
        return;
      }
      svg = toSvg(diagram, { dark: matchMedia('(prefers-color-scheme: dark)').matches });
      pic.innerHTML = svg;
      status.textContent = t('mermaidlite.status.ok', { nodes: diagram.nodes.length, edges: diagram.edges.length });
    }

    function download(blob: Blob, name: string): void {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    input.addEventListener('input', render);
    $<HTMLButtonElement>('#mlSvg').onclick = (): void => {
      if (svg === '') return;
      download(new Blob([svg], { type: 'image/svg+xml' }), 'diagram.svg');
      status.textContent = t('mermaidlite.status.savedSvg');
    };
    /* PNG 는 SVG 를 그림으로 한 번 그려서 만든다. 밖으로 아무것도 안 보낸다. */
    $<HTMLButtonElement>('#mlPng').onclick = (): void => {
      if (svg === '') return;
      const el = pic.querySelector('svg');
      if (el === null) return;
      const width = Number(el.getAttribute('width') ?? 800);
      const height = Number(el.getAttribute('height') ?? 600);
      const scale = 2;
      const image = new Image();
      image.onload = (): void => {
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        if (ctx === null) return;
        ctx.fillStyle = matchMedia('(prefers-color-scheme: dark)').matches ? '#161a21' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob === null) return;
          download(blob, 'diagram.png');
          status.textContent = t('mermaidlite.status.savedPng');
        }, 'image/png');
      };
      image.onerror = (): void => {
        status.textContent = t('mermaidlite.status.pngFail');
      };
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };
    $<HTMLButtonElement>('#mlCopy').onclick = async (): Promise<void> => {
      if (svg === '') return;
      await Toolbox.copyText?.(svg, { message: t('mermaidlite.copy.done') });
    };

    // 주소로 부른 경우 (`?op=svg&text=flowchart%20TD...`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined && call.args.text !== undefined) input.value = String(call.args.text);

    render();
  }
})();
