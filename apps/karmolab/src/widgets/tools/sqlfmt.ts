/**
 * SQL 다듬기·말 바꾸기 (TASK-KL-316 / 8)
 *
 * 「개발 도구」 작업대의 **모양 잡기** 칸. 알맹이는 `core/sqlfmt`.
 * 말을 바꿀 때 **무엇을 어떻게 바꿨는지 줄줄이 적어 준다** — 조용히 바꿔 주면
 * 「됐겠지」 하고 그대로 돌리다 사고가 난다.
 */
import { format, toDialect, spec, type Dialect } from '../../core/sqlfmt';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const DIALECTS: Dialect[] = ['mysql', 'postgres', 'mssql', 'sqlite'];
  const LABEL: Record<Dialect, string> = { mysql: 'MySQL', postgres: 'PostgreSQL', mssql: 'SQL Server', sqlite: 'SQLite' };

  Toolbox.register({
    id: 'sqlfmt',
    title: t('widgets.sqlfmt.title', undefined, 'SQL 다듬기'),
    category: 'tool',
    desc: t(
      'widgets-desc.sqlfmt.desc',
      undefined,
      '한 줄로 눌린 SQL 을 읽히게 펴고, MySQL·PostgreSQL·SQL Server·SQLite 사이를 옮겨 줍니다'
    ),
    layout: 'wide',
    icon: '<ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('sqlfmt.tab', undefined, 'SQL'),
        build: function (container: HTMLElement): void {
          void loadNamespace('sqlfmt').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('sqlfmt.mdd') });
    const options = (id: string): string => DIALECTS.map((d) => `<option value="${d}"${d === id ? ' selected' : ''}>${esc(LABEL[d])}</option>`).join('');
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('sqlfmt.label.in'))}</div>
          <textarea id="sfIn" name="sql" aria-label="${esc(t('sqlfmt.label.in'))}" class="mono-input" style="min-height:240px;" placeholder="select id, name from users where age > 20 order by name limit 10"></textarea>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('sqlfmt.label.out'))}</div>
          <textarea id="sfOut" name="out" aria-label="${esc(t('sqlfmt.aria.out'))}" class="mono-input" readonly style="min-height:240px;"></textarea>
        </div>
      </div>
      <div style="display:flex; gap:14px; margin:10px 0; flex-wrap:wrap; align-items:flex-end;">
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="sfUpper" name="upper" style="width:auto;" checked> ${esc(t('sqlfmt.opt.upper'))}
        </label>
        <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
          <input type="checkbox" id="sfConvert" name="convert" style="width:auto;"> ${esc(t('sqlfmt.opt.convert'))}
        </label>
        <div>
          <label class="field-label" for="sfFrom">${esc(t('sqlfmt.label.from'))}</label>
          <select id="sfFrom" name="from" aria-label="${esc(t('sqlfmt.label.from'))}">${options('mysql')}</select>
        </div>
        <div>
          <label class="field-label" for="sfTo">${esc(t('sqlfmt.label.to'))}</label>
          <select id="sfTo" name="to" aria-label="${esc(t('sqlfmt.label.to'))}">${options('postgres')}</select>
        </div>
        <button class="btn btn-ghost" id="sfCopy">${esc(t('sqlfmt.btn.copy'))}</button>
      </div>
      <div id="sfNotes" class="mono-input" style="display:none; white-space:pre-wrap; padding:10px; margin-bottom:10px;"></div>
      <div class="tool-status" id="sfStatus">${esc(t('sqlfmt.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const input = $<HTMLTextAreaElement>('#sfIn');
    const out = $<HTMLTextAreaElement>('#sfOut');
    const notes = $<HTMLElement>('#sfNotes');
    const status = $<HTMLElement>('#sfStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    function render(): void {
      const sql = input.value;
      if (sql.trim() === '') {
        out.value = '';
        notes.style.display = 'none';
        status.textContent = t('sqlfmt.status.idle');
        return;
      }
      const convert = $<HTMLInputElement>('#sfConvert').checked;
      const from = $<HTMLSelectElement>('#sfFrom').value as Dialect;
      const to = $<HTMLSelectElement>('#sfTo').value as Dialect;
      let body = sql;
      if (convert) {
        const got = toDialect(sql, from, to);
        body = got.sql;
        notes.textContent = got.notes.join('\n');
        notes.style.display = '';
      } else {
        notes.style.display = 'none';
      }
      out.value = format(body, { upper: $<HTMLInputElement>('#sfUpper').checked });
      const lines = out.value.split('\n').length;
      status.textContent = convert
        ? t('sqlfmt.status.converted', { from: LABEL[from], to: LABEL[to], n: lines })
        : t('sqlfmt.status.ok', { n: lines });
    }

    input.addEventListener('input', render);
    container.querySelectorAll('input[type="checkbox"], select').forEach((el) => el.addEventListener('change', render));
    $<HTMLButtonElement>('#sfCopy').onclick = async (): Promise<void> => {
      if (out.value === '') return;
      await Toolbox.copyText?.(out.value, { message: t('sqlfmt.copy.done') });
    };

    // 주소로 부른 경우 (`?op=dialect&sql=...&from=mysql&to=postgres`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.sql !== undefined) input.value = String(call.args.sql);
      if (call.op === 'dialect') $<HTMLInputElement>('#sfConvert').checked = true;
      if (call.args.from !== undefined) $<HTMLSelectElement>('#sfFrom').value = String(call.args.from);
      if (call.args.to !== undefined) $<HTMLSelectElement>('#sfTo').value = String(call.args.to);
      if (call.args.upper !== undefined) $<HTMLInputElement>('#sfUpper').checked = call.args.upper === true;
    }

    render();
  }
})();
