/**
 * jq 놀이터 — 붙여넣고 물어본다 (TASK-KL-316 / 7)
 *
 * 「개발 도구」 작업대의 **살펴보기** 칸. 알맹이는 `core/jqplay`.
 * 치는 동안 바로 답이 선다(작업대의 `live` 결) — 물어보기는 짧게 여러 번 고쳐 쓰는 일이라
 * 버튼을 누르게 하면 리듬이 끊긴다. 되는 문법은 화면에 그대로 적어 둔다.
 */
import { format, query, SUPPORTED, spec } from '../../core/jqplay';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const SAMPLE = '{\n  "users": [\n    { "name": "윤", "age": 24 },\n    { "name": "링", "age": 17 }\n  ]\n}';

  Toolbox.register({
    id: 'jqplay',
    title: t('widgets.jqplay.title', undefined, 'jq 놀이터'),
    category: 'tool',
    desc: t(
      'widgets-desc.jqplay.desc',
      undefined,
      'JSON 을 붙여넣고 jq 식으로 물어봅니다. 치는 동안 바로 답이 나오고, 아무것도 올리지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M6 4h12M12 4v10M8 14h8l-4 6z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('jqplay.tab', undefined, 'jq'),
        build: function (container: HTMLElement): void {
          void loadNamespace('jqplay').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('jqplay.mdd') });
    container.innerHTML = `
      <div class="field-group">
        <label class="field-label" for="jqQuery">${esc(t('jqplay.label.query'))}</label>
        <input type="text" id="jqQuery" name="query" aria-label="${esc(t('jqplay.label.query'))}" class="mono-input" value=".users[] | select(.age > 20) | .name">
      </div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('jqplay.label.json'))}</div>
          <textarea id="jqJson" name="json" aria-label="${esc(t('jqplay.label.json'))}" class="mono-input" style="min-height:260px;"></textarea>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('jqplay.label.out'))} <span id="jqCount" class="range-value"></span></div>
          <textarea id="jqOut" name="out" aria-label="${esc(t('jqplay.aria.out'))}" class="mono-input" readonly style="min-height:260px;"></textarea>
        </div>
      </div>
      <div style="display:flex; gap:14px; margin:10px 0; flex-wrap:wrap;">
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="jqCompact" name="compact" style="width:auto;"> ${esc(t('jqplay.opt.compact'))}
        </label>
        <button class="btn btn-ghost" id="jqCopy">${esc(t('jqplay.btn.copy'))}</button>
      </div>
      <div class="tool-status" id="jqStatus">${esc(t('jqplay.status.idle'))}</div>
      <details style="margin-top:10px;">
        <summary style="cursor:pointer; font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('jqplay.help.title'))}</summary>
        <pre class="mono-input" style="white-space:pre-wrap; padding:10px; margin-top:6px;">${esc(SUPPORTED.join('\n'))}</pre>
        <p style="font-size:var(--font-size-xs); color:var(--text-secondary);">${esc(t('jqplay.help.limits'))}</p>
      </details>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const q = $<HTMLInputElement>('#jqQuery');
    const json = $<HTMLTextAreaElement>('#jqJson');
    const out = $<HTMLTextAreaElement>('#jqOut');
    const count = $<HTMLElement>('#jqCount');
    const status = $<HTMLElement>('#jqStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    json.value = SAMPLE;

    function render(): void {
      const got = query(json.value, q.value);
      if (got.error !== undefined) {
        out.value = '';
        count.textContent = '';
        status.textContent = got.error;
        return;
      }
      out.value = format(got.values, $<HTMLInputElement>('#jqCompact').checked);
      count.textContent = String(got.values.length);
      status.textContent = t('jqplay.status.ok', { n: got.values.length });
    }

    [q, json].forEach((el) => el.addEventListener('input', render));
    $<HTMLInputElement>('#jqCompact').addEventListener('change', render);
    $<HTMLButtonElement>('#jqCopy').onclick = async (): Promise<void> => {
      if (out.value === '') return;
      await Toolbox.copyText?.(out.value, { message: t('jqplay.copy.done') });
    };

    // 주소로 부른 경우 (`?op=query&json=...&query=.a`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.json !== undefined) json.value = String(call.args.json);
      if (call.args.query !== undefined) q.value = String(call.args.query);
    }

    render();
  }
})();
