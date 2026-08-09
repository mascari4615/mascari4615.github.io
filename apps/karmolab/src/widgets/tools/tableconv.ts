/**
 * 표 바꾸기 (TASK-KL-088)
 *
 * 엑셀에서 복사한 표를 깃허브 글이나 노션에 붙이려면 마크다운 표로 바꿔야 하고, 반대로
 * 문서의 표를 계산기로 옮기려면 다시 엑셀 붙여넣기 꼴이 필요하다. 손으로 하면 세로줄 맞추다 끝난다.
 *
 * **엑셀에서 복사한 것이 곧바로 들어온다** — 그건 탭으로 나뉜 글자다. 그래서 붙여넣기만 하면 된다.
 * 마크다운은 세로줄을 폭에 맞춰 정렬해 준다. 안 맞춰도 보이기는 하지만, 원본을 읽을 사람이 있다.
 */
import { parse, spec, toCsv, toJson, toMarkdown, toTsv, type Rows } from '../../core/tableconv';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'tableconv',
    title: t('widgets.tableconv.title', undefined, "표 바꾸기"),
    category: 'tool',
    desc: t('widgets-desc.tableconv.desc', undefined, "엑셀에서 복사한 표를 마크다운·CSV·JSON 으로 바꿉니다. 붙여넣기만 하면 됩니다"),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16" stroke="currentColor" stroke-width="1.3" opacity="0.8"/>',
    tabs: [
      {
        id: 'app',
        label: t('tableconv.t01', undefined, undefined),
        build: function (container: HTMLElement): void {
          void loadNamespace('tableconv').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="tcIn">${esc(t('tableconv.label.in'))}</label>
              <textarea id="tcIn" rows="8" spellcheck="false" style="width:100%;" placeholder="${esc(t('tableconv.ph.in'))}"></textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('tableconv.label.to'))}</div>
                  <select id="tcTo" aria-label="${esc(t('tableconv.label.to'))}">
                    <option value="md">${esc(t('tableconv.opt.md'))}</option>
                    <option value="csv">${esc(t('tableconv.opt.csv'))}</option>
                    <option value="tsv">${esc(t('tableconv.opt.tsv'))}</option>
                    <option value="json">${esc(t('tableconv.opt.json'))}</option>
                  </select>
                </div>
                <div class="tool-chips" style="align-content:end;">
                  <label class="tool-chip"><input type="checkbox" id="tcAlign" checked> ${esc(t('tableconv.opt.align'))}</label>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="tcStats"></div>

            <div class="field-group">
              <label class="field-label" for="tcOut">${esc(t('tableconv.label.out'))}</label>
              <textarea id="tcOut" rows="10" spellcheck="false" style="width:100%;" readonly></textarea>
              <button class="btn btn-ghost btn-sm" id="tcCopy" style="margin-top:8px;">${esc(t('tableconv.btn.copy'))}</button>
            </div>

            <div class="tool-status" id="tcStatus">${esc(t('tableconv.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#tcIn');
          const out = $<HTMLTextAreaElement>('#tcOut');
          const stats = $<HTMLElement>('#tcStats');
          const status = $<HTMLElement>('#tcStatus');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function refresh(): void {
            const { rows, kind } = parse(input.value);
            if (!rows.length) {
              out.value = '';
              stats.innerHTML = '';
              say(t('tableconv.status.idle'));
              return;
            }
            const to = $<HTMLSelectElement>('#tcTo').value;
            out.value =
              to === 'md' ? toMarkdown(rows, $<HTMLInputElement>('#tcAlign').checked) :
              to === 'csv' ? toCsv(rows) :
              to === 'tsv' ? toTsv(rows) :
              toJson(rows);

            const cols = Math.max(...rows.map((r) => r.length));
            const ragged = rows.some((r) => r.length !== cols);
            stats.innerHTML =
              stat(t('tableconv.stat.kind'), kind, true) + stat(t('tableconv.stat.rows'), t('tableconv.value.rows', { n: rows.length })) + stat(t('tableconv.stat.cols'), t('tableconv.value.cols', { n: cols }));
            // 줄마다 칸 수가 다르면 대개 붙여넣기가 잘린 것이다 — 결과는 나오지만 내용이 어긋난다
            if (ragged) say(t('tableconv.warn.ragged'), 'error');
            else say(t('tableconv.say.detected', { kind }), 'ok');
            Toolbox.trackUse?.('convert');
          }

          input.addEventListener('input', refresh);
          $<HTMLSelectElement>('#tcTo').addEventListener('change', refresh);
          $<HTMLInputElement>('#tcAlign').addEventListener('change', refresh);
          $<HTMLButtonElement>('#tcCopy').onclick = () => {
            void Toolbox.copyText?.(out.value, { message: t('tableconv.copy.done') });
          };

          // 주소로 부른 경우 (`?op=convert&table=…&to=markdown`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'convert') {
            input.value = String(call.args.table ?? input.value);
            if (call.args.to !== undefined) $<HTMLSelectElement>('#tcTo').value = String(call.args.to);
            if (call.args.align === false) $<HTMLInputElement>('#tcAlign').checked = false;
          }
          refresh();
                  });
        }
      }
    ]
  });
})();
