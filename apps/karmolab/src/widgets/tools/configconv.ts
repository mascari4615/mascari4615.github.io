/**
 * 설정 옮기기 — .env ↔ YAML ↔ TOML ↔ JSON ↔ .properties (TASK-KL-316 / 3)
 *
 * 「개발 도구」 작업대의 할 일 한 칸. 알맹이는 `core/configconv`.
 * 붙여넣으면 **무엇인지 알아보고**(작업대의 짚기와 같은 결) 고른 모양으로 옮긴다.
 */
import { convert, detect, spec, type Format } from '../../core/configconv';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const FORMATS: Format[] = ['json', 'yaml', 'toml', 'env', 'properties'];
  const LABEL: Record<Format, string> = {
    json: 'JSON',
    yaml: 'YAML',
    toml: 'TOML',
    env: '.env',
    properties: '.properties'
  };

  Toolbox.register({
    id: 'configconv',
    title: t('widgets.configconv.title', undefined, '설정 옮기기'),
    category: 'tool',
    desc: t(
      'widgets-desc.configconv.desc',
      undefined,
      '.env·YAML·TOML·JSON·.properties 를 서로 옮깁니다. 무엇인지 알아서 알아봅니다'
    ),
    layout: 'wide',
    icon: '<path d="M4 6h7M4 12h7M4 18h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 8l3 4-3 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6v12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('configconv.tab', undefined, '설정'),
        build: function (container: HTMLElement): void {
          void loadNamespace('configconv').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('configconv.mdd') });
    const options = FORMATS.map((f) => `<option value="${f}">${esc(LABEL[f])}</option>`).join('');
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('configconv.label.in'))} <span id="cfKind" class="range-value"></span></div>
          <textarea id="cfIn" name="text" aria-label="${esc(t('configconv.label.in'))}" class="mono-input" style="min-height:260px;" placeholder="DB_HOST=localhost&#10;DB_PORT=5432"></textarea>
        </div>
        <div>
          <div class="tool-sublabel">
            <label for="cfTo">${esc(t('configconv.label.to'))}</label>
            <select id="cfTo" name="to" aria-label="${esc(t('configconv.label.to'))}" style="width:auto; display:inline-block; margin-left:6px;">${options}</select>
          </div>
          <textarea id="cfOut" name="out" aria-label="${esc(t('configconv.aria.out'))}" class="mono-input" readonly style="min-height:260px;"></textarea>
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin:10px 0 var(--space-lg);">
        <button class="btn btn-primary" id="cfRun">${esc(t('configconv.btn.run'))}</button>
        <button class="btn btn-ghost" id="cfSwap">${esc(t('configconv.btn.swap'))}</button>
        <button class="btn btn-ghost" id="cfCopy">${esc(t('configconv.btn.copy'))}</button>
      </div>
      <div class="tool-status" id="cfStatus">${esc(t('configconv.status.idle'))}</div>
      <p class="tool-note" style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('configconv.note.limits'))}</p>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#cfIn');
    const to = $<HTMLSelectElement>('#cfTo');
    const out = $<HTMLTextAreaElement>('#cfOut');
    const kind = $<HTMLElement>('#cfKind');
    const status = $<HTMLElement>('#cfStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    to.value = 'yaml';

    function render(): void {
      const text = input.value;
      if (text.trim() === '') {
        out.value = '';
        kind.textContent = '';
        status.textContent = t('configconv.status.idle');
        return;
      }
      const from = detect(text);
      kind.textContent = LABEL[from];
      if (from === to.value) {
        out.value = text;
        status.textContent = t('configconv.status.same', { kind: LABEL[from] });
        return;
      }
      try {
        out.value = convert(text, to.value as Format, from);
        status.textContent = t('configconv.status.ok', { from: LABEL[from], to: LABEL[to.value as Format] });
      } catch (e) {
        out.value = '';
        status.textContent = t('configconv.status.bad', { msg: String((e as Error).message) });
      }
    }

    input.addEventListener('input', render);
    to.addEventListener('change', render);
    $<HTMLButtonElement>('#cfRun').onclick = render;
    /* 나온 것을 왼쪽으로 넘긴다 — 「JSON → YAML → TOML」 처럼 이어서 옮길 때. */
    $<HTMLButtonElement>('#cfSwap').onclick = (): void => {
      if (out.value === '') return;
      input.value = out.value;
      render();
    };
    $<HTMLButtonElement>('#cfCopy').onclick = async (): Promise<void> => {
      if (out.value === '') return;
      await Toolbox.copyText?.(out.value, { message: t('configconv.copy.done') });
    };

    // 주소로 부른 경우 (`?op=convert&text=...&to=toml`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.text !== undefined) input.value = String(call.args.text);
      if (call.args.to !== undefined) to.value = String(call.args.to);
    }

    render();
  }
})();
