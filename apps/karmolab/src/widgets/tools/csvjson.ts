/**
 * CSV ↔ JSON 변환 (TASK-KL-088)
 *
 * CSV 는 쉼표로 자르면 되는 것처럼 보이지만 **따옴표 안의 쉼표와 줄바꿈**이 있다.
 * 순진하게 자르면 열이 밀려 조용히 망가진 데이터가 나온다 — 그래서 한 글자씩 읽는다.
 * 되돌릴 때도 쉼표·따옴표·줄바꿈이 든 값은 따옴표로 감싸고 안쪽 따옴표는 겹쳐 적는다.
 */
import { coerce, parseCsv, spec, toCsv } from '../../core/csvjson';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'csvjson',
    title: t('widgets.csvjson.title', undefined, "CSV ↔ JSON 변환"),
    category: 'tool',
    desc: t('widgets-desc.csvjson.desc', undefined, "표(CSV)와 JSON 을 서로 바꿉니다. 따옴표 안 쉼표·줄바꿈도 안 깨집니다"),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="8" height="16" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h8M3 14h8" stroke="currentColor" stroke-width="1.3"/><path d="M15 6h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'CSV ↔ JSON',
        build: function (container: HTMLElement): void {
          void loadNamespace('csvjson').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('csvjson.label.delim'))}</div>
                  <select id="cjDelim" aria-label="${esc(t('csvjson.label.delim'))}">
                    <option value=",">${esc(t('csvjson.delim.comma'))}</option>
                    <option value="&#9;">${esc(t('csvjson.delim.tab'))}</option>
                    <option value=";">${esc(t('csvjson.delim.semicolon'))}</option>
                    <option value="|">${esc(t('csvjson.delim.pipe'))}</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('csvjson.label.coerce'))}</div>
                  <label class="tool-chip" style="display:inline-flex; align-items:center; height:38px;">
                    <input type="checkbox" id="cjCoerce" checked> ${esc(t('csvjson.opt.on'))}
                  </label>
                </div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('csvjson.label.csv'))}</label>
              <textarea id="cjCsv" rows="7" spellcheck="false" placeholder="${esc(t('csvjson.ph.csv'))}"></textarea>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <!-- 방향 단추를 없앴다. **고친 쪽이 곧 방향**이다 — CSV 를 고치면 JSON 이,
                   JSON 을 고치면 CSV 가 따라온다 (TASK-KL-133). -->
              <button class="btn btn-ghost" id="cjCopy">${esc(t('csvjson.btn.copy'))}</button>
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('csvjson.label.json'))}</label>
              <textarea id="cjJson" aria-label="${esc(t('csvjson.aria.json'))}" rows="9" spellcheck="false" placeholder="${esc(t('csvjson.ph.json'))}"></textarea>
            </div>
            <div class="tool-status" id="cjStatus">${esc(t('csvjson.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const csv = $<HTMLTextAreaElement>('#cjCsv');
          const json = $<HTMLTextAreaElement>('#cjJson');
          const status = $<HTMLElement>('#cjStatus');
          const delim = (): string => $<HTMLSelectElement>('#cjDelim').value;

          function say(msg: string, kind = ''): void {
            status.textContent = msg;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          }

          function toJson(): void {
            const rows = parseCsv(csv.value.trim(), delim());
            if (rows.length < 2) {
              say(t('csvjson.err.tooShort'), 'error');
              return;
            }
            const head = rows[0];
            const useCoerce = $<HTMLInputElement>('#cjCoerce').checked;
            const out = rows.slice(1).map((r) => {
              const o: Record<string, unknown> = {};
              head.forEach((h, i) => (o[h || t('csvjson.value.col', { n: i + 1 })] = useCoerce ? coerce(r[i] ?? '') : (r[i] ?? '')));
              return o;
            });
            json.value = JSON.stringify(out, null, 2);
            say(t('csvjson.say.toJson', { rows: out.length, cols: head.length }), 'ok');
            Toolbox.trackUse?.('to-json');
          }

          function toCsvSide(): void {
            let data: unknown;
            try {
              data = JSON.parse(json.value);
            } catch (e) {
              say(t('csvjson.err.json') + (e as Error).message, 'error');
              return;
            }
            if (!Array.isArray(data) || !data.length || typeof data[0] !== 'object') {
              say(t('csvjson.err.notArray'), 'error');
              return;
            }
            csv.value = toCsv(data as Array<Record<string, unknown>>, delim());
            say(t('csvjson.say.toCsv', { rows: (data as unknown[]).length }), 'ok');
            Toolbox.trackUse?.('to-csv');
          }

          $<HTMLButtonElement>('#cjCopy').onclick = () => {
            if (json.value) void Toolbox.copyText?.(json.value, { message: t('csvjson.copy.done') });
          };

          /* 프로그램이 값을 넣을 때는 input 이 안 울리므로 두 쪽이 서로를 되받아 도는 일은 없다.
             표가 클수록 무거우니 손이 멎은 뒤에 한 번만 한다 (TASK-KL-133). */
          let timer: ReturnType<typeof setTimeout> | null = null;
          const soon = (fn: () => void) => () => {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(fn, 200);
          };
          csv.addEventListener('input', soon(toJson));
          json.addEventListener('input', soon(toCsvSide));
          $<HTMLSelectElement>('#cjDelim').addEventListener('change', toJson);
          $<HTMLInputElement>('#cjCoerce').addEventListener('change', toJson);

          // 주소로 부른 경우 (`?op=toJson&csv=…`) — 아니면 예시 (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'toCsv') {
            json.value = String(call.args.json ?? '');
            toCsvSide();
          } else {
            csv.value =
              call !== null && call.error === undefined && call.op === 'toJson'
                ? String(call.args.csv ?? '')
                : t('csvjson.sample.csv');
            toJson();
          }
                  });
        }
      }
    ]
  });
})();
