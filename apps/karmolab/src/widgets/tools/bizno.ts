/**
 * 사업자등록번호 검사 (TASK-KL-088)
 *
 * 열 자리 중 마지막 한 자리는 앞 아홉 자리에서 계산되는 **검증 숫자**다.
 * 그래서 오타는 대부분 계산만으로 걸러진다 — 국세청에 묻지 않아도 「형식상 불가능한 번호」 를 안다.
 * 다만 계산이 맞아도 실제로 등록된 번호인지는 알 수 없다. 그 경계를 화면에 분명히 적는다.
 */
import { checkBiz, checkCorp, formatBiz, formatCorp, kindKeyOf, onlyDigits, spec } from '../../core/bizno';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  Toolbox.register({
    id: 'bizno',
    title: t('widgets.bizno.title', undefined, '사업자번호 검사'),
    category: 'tool',
    desc: t(
      'widgets-desc.bizno.desc',
      undefined,
      '사업자등록번호·법인등록번호가 형식상 올바른지 계산으로 확인합니다'
    ),
    layout: 'form',
    icon: '<rect x="3" y="6" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 6V4h8v2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 12h5M7 16h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('bizno.tab', undefined, '검사'),
        build: function (container: HTMLElement): void {
          void loadNamespace('bizno').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에 — 파일 실릴 때 그리면 이름 자리에 열쇠가 굳는다. */
  function draw(container: HTMLElement): void {
          /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게. */
          const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('bizno.label.number'))}</label>
              <input type="text" id="bzIn" spellcheck="false" placeholder="123-45-67890" inputmode="numeric">
            </div>
            <div class="tool-display" id="bzMark">—</div>
            <div class="tool-list" id="bzOut"></div>
            <div class="tool-status" id="bzStatus">${esc(t('bizno.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLInputElement>('#bzIn');
          const mark = $<HTMLElement>('#bzMark');
          const out = $<HTMLElement>('#bzOut');
          const status = $<HTMLElement>('#bzStatus');
          const row = (k: string, v: string): string =>
            `<div class="tool-list-row"><span class="tool-list-key">${k}</span><span class="tool-list-val">${v}</span></div>`;

          function run(): void {
            const digits = onlyDigits(input.value);
            if (!digits) {
              mark.textContent = '—';
              out.innerHTML = '';
              status.textContent = t('bizno.status.idle');
              status.className = 'tool-status';
              return;
            }
            if (digits.length === 10) {
              const r = checkBiz(digits)!;
              mark.textContent = t(r.ok ? 'bizno.mark.ok' : 'bizno.mark.bad');
              mark.className = 'tool-display' + (r.ok ? '' : ' tool-display-done');
              out.innerHTML =
                row(t('bizno.row.type'), t('bizno.type.biz')) +
                row(t('bizno.row.format'), formatBiz(digits)) +
                row(t('bizno.row.kind'), t(`bizno.kind.${kindKeyOf(digits.slice(3, 5))}`)) +
                row(
                  t('bizno.row.checkDigit'),
                  r.ok
                    ? t('bizno.value.checkOk', { got: digits[9] })
                    : t('bizno.value.checkBad', { got: digits[9], expect: r.expect })
                );
              status.textContent = t(r.ok ? 'bizno.status.bizOk' : 'bizno.status.bizBad');
              status.className = 'tool-status' + (r.ok ? ' ok' : ' error');
            } else if (digits.length === 13) {
              const r = checkCorp(digits)!;
              mark.textContent = t(r.ok ? 'bizno.mark.ok' : 'bizno.mark.bad');
              mark.className = 'tool-display' + (r.ok ? '' : ' tool-display-done');
              out.innerHTML =
                row(t('bizno.row.type'), t('bizno.type.corp')) +
                row(t('bizno.row.format'), formatCorp(digits)) +
                row(
                  t('bizno.row.checkDigit'),
                  r.ok
                    ? t('bizno.value.checkOk', { got: digits[12] })
                    : t('bizno.value.checkBad', { got: digits[12], expect: r.expect })
                );
              status.textContent = t(r.ok ? 'bizno.status.corpOk' : 'bizno.status.corpBad');
              status.className = 'tool-status' + (r.ok ? ' ok' : ' error');
            } else {
              mark.textContent = '—';
              out.innerHTML = row(t('bizno.row.digits'), t('bizno.value.length', { n: digits.length }));
              status.textContent = t('bizno.status.length');
              status.className = 'tool-status';
            }
            Toolbox.trackUse?.('check');
          }

          input.addEventListener('input', run);

          // 주소로 부른 경우 (`?op=check&number=…`) — 링크만으로 결과가 보인다 (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'check') {
            input.value = String(call.args.number ?? '');
            run();
          } else if (call?.error !== undefined) {
            status.textContent = call.error;
            status.className = 'tool-status error';
          }
  }
})();
