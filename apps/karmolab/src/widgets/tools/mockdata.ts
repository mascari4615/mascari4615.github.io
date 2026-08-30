/**
 * 가짜 데이터. 칸 종류만 적으면 채워 준다 (TASK-KL-316 / 6)
 *
 * 개발 도구 작업대의 **만들기** 칸. 알맹이는 `core/mockdata` (들고 온 것이 없어도 되는 할 일).
 * 씨앗을 화면에 내놓는다. 같은 씨앗이면 같은 데이터라, 아까 그 표를 다시 부를 수 있다.
 */
import { emit, generate, spec, type Locale, type Out } from '../../core/mockdata';
import { escapeHtml as esc } from './shared/text';
import { markLive } from './shared/say';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {

  const SAMPLE = 'id:id\n이름:name\n메일:email\n회사:company\n나이:int(20,40)\n등급:enum(무료|프로|팀)\n가입일:date(2024-01-01,2026-08-14)';

  Toolbox.register({
    id: 'mockdata',
    title: t('widgets.mockdata.title', undefined, '가짜 데이터 만들기'),
    category: 'dev',
    desc: t(
      'widgets-desc.mockdata.desc',
      undefined,
      '칸 종류만 적으면 그럴듯한 시험용 데이터를 만듭니다. 한국어, 영어, 일본어 이름, CSV, JSON, SQL 로'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 10h18M9 10v9M15 10v9" stroke="currentColor" stroke-width="1.3" opacity="0.8"/>',
    tabs: [
      {
        id: 'app',
        label: t('mockdata.tab', undefined, '가짜 데이터'),
        build: function (container: HTMLElement): void {
          void loadNamespace('mockdata').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  function draw(container: HTMLElement): void {
    Mdd.linePreset('tool_run', { msg: t('mockdata.mdd') });
    container.innerHTML = `
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('mockdata.label.schema'))}</div>
          <textarea id="mkSchema" name="schema" aria-label="${esc(t('mockdata.label.schema'))}" class="mono-input" style="min-height:220px;"></textarea>
          <p style="font-size:var(--font-size-xs); color:var(--text-secondary); margin-top:6px;">${esc(t('mockdata.hint.types'))}</p>
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('mockdata.label.out'))}</div>
          <textarea id="mkOut" name="out" aria-label="${esc(t('mockdata.aria.out'))}" class="mono-input" readonly style="min-height:220px;"></textarea>
        </div>
      </div>
      <div class="tool-grid-2">
        <div>
          <div class="tool-sublabel">${esc(t('mockdata.label.count'))} <span id="mkCountVal" class="range-value">20</span></div>
          <input type="range" id="mkCount" name="count" aria-label="${esc(t('mockdata.label.count'))}" min="1" max="500" value="20">
        </div>
        <div>
          <div class="tool-sublabel">${esc(t('mockdata.label.seed'))}</div>
          <input type="number" id="mkSeed" name="seed" aria-label="${esc(t('mockdata.label.seed'))}" value="1" min="0" max="999999">
        </div>
      </div>
      <div class="field-group" style="display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end;">
        <div>
          <label class="field-label" for="mkLocale">${esc(t('mockdata.label.locale'))}</label>
          <select id="mkLocale" name="locale" aria-label="${esc(t('mockdata.label.locale'))}">
            <option value="ko">한국어</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="mkTo">${esc(t('mockdata.label.to'))}</label>
          <select id="mkTo" name="to" aria-label="${esc(t('mockdata.label.to'))}">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="tsv">TSV</option>
            <option value="sql">SQL INSERT</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="mkTable">${esc(t('mockdata.label.table'))}</label>
          <input type="text" id="mkTable" name="table" aria-label="${esc(t('mockdata.label.table'))}" value="sample">
        </div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
        <button class="btn btn-primary" id="mkRun">${esc(t('mockdata.btn.run'))}</button>
        <button class="btn btn-ghost" id="mkShuffle">${esc(t('mockdata.btn.shuffle'))}</button>
        <button class="btn btn-ghost" id="mkCopy">${esc(t('mockdata.btn.copy'))}</button>
      </div>
      <div class="tool-status" id="mkStatus">${esc(t('mockdata.status.idle'))}</div>
    `;

    const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
    const schema = $<HTMLTextAreaElement>('#mkSchema');
    const out = $<HTMLTextAreaElement>('#mkOut');
    const count = $<HTMLInputElement>('#mkCount');
    const seed = $<HTMLInputElement>('#mkSeed');
    const locale = $<HTMLSelectElement>('#mkLocale');
    const to = $<HTMLSelectElement>('#mkTo');
    const table = $<HTMLInputElement>('#mkTable');
    const status = $<HTMLElement>('#mkStatus');
    /* 이 줄은 **읽히는 자리**다 (TASK-KL-291). */
    markLive(status);

    schema.value = SAMPLE;

    function render(): void {
      $<HTMLElement>('#mkCountVal').textContent = count.value;
      const rows = generate(schema.value, {
        count: parseInt(count.value, 10),
        locale: locale.value as Locale,
        seed: parseInt(seed.value, 10) || 0
      });
      if (rows.length === 0) {
        out.value = '';
        status.textContent = t('mockdata.status.empty');
        return;
      }
      out.value = emit(rows, to.value as Out, table.value === '' ? 'sample' : table.value);
      status.textContent = t('mockdata.status.ok', { n: rows.length, cols: Object.keys(rows[0]).length, seed: seed.value });
    }

    [schema, seed, table].forEach((el) => el.addEventListener('input', render));
    [count].forEach((el) => el.addEventListener('input', render));
    [locale, to].forEach((el) => el.addEventListener('change', render));
    $<HTMLButtonElement>('#mkRun').onclick = render;
    /* 씨앗을 굴린다. 다른 걸로 한 판 더 */
    $<HTMLButtonElement>('#mkShuffle').onclick = (): void => {
      seed.value = String(Math.floor(Math.random() * 999999));
      render();
    };
    $<HTMLButtonElement>('#mkCopy').onclick = async (): Promise<void> => {
      if (out.value === '') return;
      await Toolbox.copyText?.(out.value, { message: t('mockdata.copy.done') });
    };

    // 주소로 부른 경우 (`?op=generate&schema=...&count=50&to=csv`) (TASK-KL-205).
    const call = readInvocation(spec);
    if (call !== null && call.error === undefined) {
      if (call.args.schema !== undefined) schema.value = String(call.args.schema);
      if (call.args.count !== undefined) count.value = String(call.args.count);
      if (call.args.locale !== undefined) locale.value = String(call.args.locale);
      if (call.args.to !== undefined) to.value = String(call.args.to);
      if (call.args.seed !== undefined) seed.value = String(call.args.seed);
      if (call.args.table !== undefined) table.value = String(call.args.table);
    }

    render();
  }
})();
