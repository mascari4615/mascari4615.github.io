/**
 * XML 다루기 — 펴기 · 뭉치기 · JSON 으로 (TASK-KL-238 / 42 codebeautify)
 *
 * 「개발 도구」 작업대의 할 일 한 칸. 알맹이는 `core/xmlfmt` — 여기서는 고르고 보여 주기만 한다.
 * 틀린 곳은 「Invalid XML」 대신 **줄·칸**으로 짚어 준다(알맹이가 그렇게 던진다).
 */
import { format, minify, parse, spec, toJson, XmlError } from '../../core/xmlfmt';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  type Job = 'format' | 'minify' | 'toJson';

  Toolbox.register({
    id: 'xmlfmt',
    title: t('widgets.xmlfmt.title', undefined, 'XML 다루기'),
    category: 'tool',
    desc: t(
      'widgets-desc.xmlfmt.desc',
      undefined,
      'XML 을 보기 좋게 펴거나 한 줄로 뭉치고, JSON 으로 옮깁니다. 틀린 자리는 줄·칸으로 짚습니다'
    ),
    layout: 'wide',
    icon: '<path d="M9 7 4 12l5 5M15 7l5 5-5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 5l-2 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'XML',
        build: function (container: HTMLElement): void {
          void loadNamespace('xmlfmt').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('xmlfmt.label.in'))}</div>
          <textarea id="xfIn" name="text" aria-label="${esc(t('xmlfmt.label.in'))}" class="mono-input" style="min-height:260px;" placeholder="<rss version=&quot;2.0&quot;><channel><title>...</title></channel></rss>"></textarea>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('xmlfmt.label.out'))}</div>
          <textarea id="xfOut" name="out" aria-label="${esc(t('xmlfmt.label.out'))}" class="mono-input" readonly style="min-height:260px;"></textarea>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin:10px 0 var(--space-lg);">
        <button class="btn btn-primary" id="xfFormat">${esc(t('xmlfmt.btn.format'))}</button>
        <button class="btn btn-ghost" id="xfMinify">${esc(t('xmlfmt.btn.minify'))}</button>
        <button class="btn btn-ghost" id="xfJson">${esc(t('xmlfmt.btn.json'))}</button>
        <label class="tool-sublabel" for="xfIndent" style="margin-left:8px;">${esc(t('xmlfmt.label.indent'))}</label>
        <input type="number" id="xfIndent" name="indent" aria-label="${esc(t('xmlfmt.label.indent'))}" min="0" max="8" value="2" style="width:64px;">
        <button class="btn btn-ghost" id="xfCopy">${esc(t('xmlfmt.btn.copy'))}</button>
      </div>
      <div class="tool-status" id="xfStatus">${esc(t('xmlfmt.status.idle'))}</div>
      <p class="tool-note" style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('xmlfmt.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#xfIn');
    const out = $<HTMLTextAreaElement>('#xfOut');
    const indent = $<HTMLInputElement>('#xfIndent');
    const status = $<HTMLElement>('#xfStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291) — 「몇 번째 줄이 틀렸다」는 눈으로만 보면 놓친다. */
    markLive(status);

    let job: Job = 'format';

    function render(): void {
      const text = input.value;
      if (text.trim() === '') {
        out.value = '';
        status.textContent = t('xmlfmt.status.idle');
        return;
      }
      try {
        const nodes = parse(text);
        out.value =
          job === 'minify'
            ? minify(nodes)
            : job === 'toJson'
              ? JSON.stringify(toJson(nodes), null, 2)
              : format(nodes, Math.max(0, Math.min(8, parseInt(indent.value, 10) || 2)));
        status.textContent = t(`xmlfmt.status.${job}`, { lines: String(out.value.split('\n').length) });
      } catch (e) {
        out.value = '';
        /* 어디가 틀렸는지 **그 줄에 커서를 둔다** — 사람이 눈으로 세게 하지 않는다. */
        if (e instanceof XmlError) {
          const lines = text.split('\n');
          let pos = 0;
          for (let i = 0; i < e.line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
          input.focus();
          input.setSelectionRange(pos + e.col - 1, pos + e.col - 1);
        }
        status.textContent = t('xmlfmt.status.bad', { msg: String((e as Error).message) });
      }
    }

    const pick = (next: Job): void => {
      job = next;
      render();
    };

    input.addEventListener('input', render);
    indent.addEventListener('input', render);
    $<HTMLButtonElement>('#xfFormat').onclick = () => pick('format');
    $<HTMLButtonElement>('#xfMinify').onclick = () => pick('minify');
    $<HTMLButtonElement>('#xfJson').onclick = () => pick('toJson');
    $<HTMLButtonElement>('#xfCopy').onclick = async (): Promise<void> => {
      if (out.value === '') return;
      await Toolbox.copyText?.(out.value, { message: t('xmlfmt.copy.done') });
    };

    // 주소로 부른 경우 (`?op=format&text=...`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.text !== undefined) input.value = String(call.args.text);
      if (call.args.indent !== undefined) indent.value = String(call.args.indent);
      if (call.op === 'minify' || call.op === 'toJson') job = call.op;
    }

    render();
  }
})();
