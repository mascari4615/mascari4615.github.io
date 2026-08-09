/**
 * 유닉스 타임스탬프 변환 — 화면 (TASK-KL-088)
 *
 * 자릿수로 단위를 가리는 판단과 값 만들기는 `src/core/epoch.ts` 가 한다 (TASK-KL-205).
 * 여기는 칸을 그리고 오간 값을 옮기는 일만 한다.
 */
import { parseTimestamp, spec, stampRowKeys, toLocalInput } from '../../core/epoch';
import { readInvocation } from '../../lib/tool-url';

import { t, loadNamespace, fmtDate, fmtRelative } from '../../lib/i18n';

(function (): void {
  Toolbox.register({
    id: 'epoch',
    title: t('widgets.epoch.title', undefined, '타임스탬프 변환'),
    category: 'tool',
    desc: t(
      'widgets-desc.epoch.desc',
      undefined,
      '유닉스 타임스탬프와 사람이 읽는 시각을 서로 바꿉니다. 초·밀리초 자동 판별'
    ),
    layout: 'form',
    icon: '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M12 7v5l4 2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M2 12h3M19 12h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('epoch.tab', undefined, '변환'),
        build: function (container: HTMLElement): void {
          void loadNamespace('epoch').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('epoch.label.stamp'))}</label>
              <input type="text" id="epNum" spellcheck="false" placeholder="1750000000">
            </div>
            <div class="field-group">
              <label class="field-label">${esc(t('epoch.label.human'))}</label>
              <input type="datetime-local" id="epDate" aria-label="사람이 읽는 시각" step="1">
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="epNow">${esc(t('epoch.btn.now'))}</button>
              <button class="btn btn-ghost" id="epCopySec">${esc(t('epoch.btn.copySec'))}</button>
              <button class="btn btn-ghost" id="epCopyMs">${esc(t('epoch.btn.copyMs'))}</button>
            </div>
            <div class="tool-list" id="epOut"></div>
            <div class="tool-status" id="epStatus">${esc(t('epoch.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const num = $<HTMLInputElement>('#epNum');
          const date = $<HTMLInputElement>('#epDate');
          const out = $<HTMLElement>('#epOut');
          const status = $<HTMLElement>('#epStatus');
          let ms = Date.now();

          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function render(note: string): void {
            /* 이름은 여기서 붙이고, 「지금 기준」과 시각·요일은 **그 언어의 규칙**으로 적는다
               (`Intl` 이 상대 시각·요일·날짜 표기를 안다) — 알맹이는 표식과 값만 준다. */
            out.innerHTML = stampRowKeys(ms)
              .map(([k, v]) => {
                if (k === 'local') return row(t('epoch.row.local'), fmtDate(ms, { dateStyle: 'medium', timeStyle: 'medium' }));
                if (k === 'weekday') return row(t('epoch.row.weekday'), fmtDate(ms, { weekday: 'long' }));
                if (k === 'delta') return row(t('epoch.row.delta'), fmtRelative(Number(v)));
                return row(t(`epoch.row.${k}`), String(v));
              })
              .join('');
            status.textContent = note;
            status.className = 'tool-status ok';
          }

          function fromNumber(): void {
            const parsed = parseTimestamp(num.value);
            if (parsed === null) return;
            ms = parsed.ms;
            date.value = toLocalInput(new Date(ms));
            render(t('epoch.say.readAs', { unit: t(`epoch.unit.${parsed.unit.key}`) }));
          }

          num.addEventListener('input', fromNumber);
          date.addEventListener('input', () => {
            if (!date.value) return;
            ms = new Date(date.value).getTime();
            num.value = String(Math.floor(ms / 1000));
            render(t('epoch.say.fromDate'));
          });
          $<HTMLButtonElement>('#epNow').onclick = () => {
            ms = Date.now();
            num.value = String(Math.floor(ms / 1000));
            date.value = toLocalInput(new Date(ms));
            render(t('epoch.say.now'));
            Toolbox.trackUse?.('now');
          };
          $<HTMLButtonElement>('#epCopySec').onclick = () => {
            void Toolbox.copyText?.(String(Math.floor(ms / 1000)), { message: t('epoch.copy.sec') });
          };
          $<HTMLButtonElement>('#epCopyMs').onclick = () => {
            void Toolbox.copyText?.(String(ms), { message: t('epoch.copy.ms') });
          };

          // 주소로 부른 경우(`?op=toDate&ts=…`)는 그 값으로, 아니면 지금 시각으로 연다 (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'toDate') {
            num.value = String(call.args.ts ?? '');
            fromNumber();
          } else if (call !== null && call.error === undefined && call.op === 'toStamp') {
            /* 이름을 `t` 로 두면 **말 갈아끼우는 `t()` 를 가린다** — 그 아래 줄이 조용히 깨진다. */
            const stamp = new Date(String(call.args.date ?? '')).getTime();
            if (Number.isNaN(stamp) === false) {
              ms = stamp;
              num.value = String(Math.floor(ms / 1000));
              date.value = toLocalInput(new Date(ms));
              render(t('epoch.say.fromUrl'));
            }
          } else {
            num.value = String(Math.floor(ms / 1000));
            date.value = toLocalInput(new Date(ms));
            render(t('epoch.say.now'));
          }
          if (call?.error !== undefined) {
            status.textContent = call.error;
            status.className = 'tool-status error';
          }
  }
})();
