/**
 * UUID / 랜덤 ID 생성기 (TASK-KL-088)
 * 난수는 crypto.getRandomValues 만 쓴다 (Math.random 은 예측 가능해 ID 용도로 부적격).
 */
import { nanoId, password, spec, ulid, uuidV4, uuidV7 } from '../../core/uuidgen';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'uuidgen',
    title: t('widgets.uuidgen.title', undefined, "UUID 생성기"),
    category: 'tool',
    desc: t('widgets-desc.uuidgen.desc', undefined, "UUID v4·v7, ULID, NanoID, 안전한 비밀번호를 원하는 개수만큼 만듭니다"),
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 12h2M11 12h2M15 12h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'UUID',
        build: function (container: HTMLElement): void {
          void loadNamespace('uuidgen').then(function () {

          Mdd.linePreset('tool_run', { msg: t('uuidgen.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('uuidgen.label.kind'))}</label>
              <select id="uuKind" aria-label="${esc(t('uuidgen.label.kind'))}">
                <option value="v4">${esc(t('uuidgen.opt.v4'))}</option>
                <option value="v7">${esc(t('uuidgen.opt.v7'))}</option>
                <option value="ulid">${esc(t('uuidgen.opt.ulid'))}</option>
                <option value="nano">${esc(t('uuidgen.opt.nano'))}</option>
                <option value="pw">${esc(t('uuidgen.opt.pw'))}</option>
              </select>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('uuidgen.label.count'))} <span id="uuCountVal" class="range-value">${esc(t('uuidgen.value.count'))}</span></div>
                  <input type="range" id="uuCount" aria-label="${esc(t('uuidgen.label.count'))}" min="1" max="100" value="10">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('uuidgen.label.len'))} <span id="uuLenVal" class="range-value">${esc(t('uuidgen.value.len'))}</span></div>
                  <input type="range" id="uuLen" aria-label="${esc(t('uuidgen.label.len'))}" min="6" max="64" value="21">
                </div>
              </div>
              <div style="display:flex; gap:14px; margin-top:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuUpper" style="width:auto;"> ${esc(t('uuidgen.opt.upper'))}
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuNoDash" style="width:auto;"> ${esc(t('uuidgen.opt.noDash'))}
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="uuSymbols" style="width:auto;" checked> ${esc(t('uuidgen.opt.symbols'))}
                </label>
              </div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-lg);">
              <button class="btn btn-primary" id="uuGen">${esc(t('uuidgen.btn.gen'))}</button>
              <button class="btn btn-ghost" id="uuCopy">${esc(t('uuidgen.btn.copy'))}</button>
            </div>
            <textarea id="uuOut" aria-label="${esc(t('uuidgen.aria.out'))}" class="mono-input" readonly style="min-height:240px;"></textarea>
            <div class="tool-status">${esc(t('uuidgen.status.idle'))}</div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const kind = $<HTMLSelectElement>('#uuKind');
          const count = $<HTMLInputElement>('#uuCount');
          const len = $<HTMLInputElement>('#uuLen');
          const out = $<HTMLTextAreaElement>('#uuOut');

          function render(): void {
            $<HTMLElement>('#uuCountVal').textContent = count.value + t('uuidgen.unit.count');
            $<HTMLElement>('#uuLenVal').textContent = len.value + t('uuidgen.unit.len');
            const n = parseInt(count.value, 10);
            const l = parseInt(len.value, 10);
            const upper = $<HTMLInputElement>('#uuUpper').checked;
            const noDash = $<HTMLInputElement>('#uuNoDash').checked;
            const symbols = $<HTMLInputElement>('#uuSymbols').checked;
            const rows: string[] = [];
            for (let i = 0; i < n; i++) {
              let v: string;
              switch (kind.value) {
                case 'v7':
                  v = uuidV7();
                  break;
                case 'ulid':
                  v = ulid();
                  break;
                case 'nano':
                  v = nanoId(l);
                  break;
                case 'pw':
                  v = password(l, symbols);
                  break;
                default:
                  v = uuidV4();
              }
              if (noDash) v = v.replace(/-/g, '');
              if (upper) v = v.toUpperCase();
              rows.push(v);
            }
            out.value = rows.join('\n');
          }

          [kind, count, len].forEach((el) => {
            el.addEventListener('input', render);
            el.addEventListener('change', render);
          });
          container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', render));
          $<HTMLButtonElement>('#uuGen').onclick = render;

          // 주소로 부른 경우 (`?op=generate&kind=password&count=5`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'generate') {
            if (call.args.kind !== undefined) kind.value = String(call.args.kind);
            if (call.args.count !== undefined) count.value = String(call.args.count);
            if (call.args.length !== undefined) len.value = String(call.args.length);
          }
          $<HTMLButtonElement>('#uuCopy').onclick = async () => {
            if (!out.value) return;
            await Toolbox.copyText?.(out.value, { message: t('uuidgen.copy.done', { n: out.value.split('\n').length }) });
          };

          render();
                  });
        }
      }
    ]
  });
})();
