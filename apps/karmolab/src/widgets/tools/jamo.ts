/**
 * 한글 자모 분해·조합 (TASK-KL-088)
 *
 * 검색·정렬을 만들다 보면 「강」 을 ㄱ/ㅏ/ㅇ 으로 쪼개야 하는 순간이 온다(초성 검색).
 * 반대로 자모만 남은 문자열을 글자로 되돌려야 할 때도 있다 — 맥에서 만든 파일 이름이
 * 윈도우에서 「ㄱ ㅏ ㅁ」 처럼 풀려 보이는 게 대표적이다(자모가 따로 저장된 표기).
 */
import { compose, decompose, initials, spec, split } from '../../core/jamo';
import { readInvocation } from '../../lib/tool-url';
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'jamo',
    title: t('widgets.jamo.title', undefined, "한글 자모 분해"),
    category: 'tool',
    desc: t('widgets-desc.jamo.desc', undefined, "글자를 초성·중성·종성으로 쪼개고 자모를 글자로 되돌립니다. 초성 추출 포함"),
    layout: 'wide',
    icon: '<path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('jamo.label.jamo', undefined, "자모"),
        build: function (container: HTMLElement): void {
          void loadNamespace('jamo').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('jamo.tab'))}</label>
              <textarea id="jaIn" rows="4" spellcheck="false" placeholder="${esc(t('jamo.ph.in'))}"></textarea>
            </div>
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('jamo.label.cho'))}</div>
                  <input type="text" id="jaCho" aria-label="${esc(t('jamo.label.cho'))}" readonly spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('jamo.label.all'))}</div>
                  <input type="text" id="jaAll" aria-label="${esc(t('jamo.label.all'))}" readonly spellcheck="false">
                </div>
              </div>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-ghost" id="jaCopyCho">${esc(t('jamo.btn.copyCho'))}</button>
              <button class="btn btn-ghost" id="jaCopyAll">${esc(t('jamo.btn.copyAll'))}</button>
              <button class="btn btn-ghost" id="jaJoin">${esc(t('jamo.btn.join'))}</button>
            </div>
            <div class="tool-list" id="jaOut"></div>
            <div class="tool-status" id="jaStatus">${esc(t('jamo.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#jaIn');
          const cho = $<HTMLInputElement>('#jaCho');
          const all = $<HTMLInputElement>('#jaAll');
          const out = $<HTMLElement>('#jaOut');
          const status = $<HTMLElement>('#jaStatus');

          function run(): void {
            /* 쪼개는 계산은 `src/core/jamo.ts` 가 한다 — 겹받침·「종성이냐 다음 초성이냐」 판단이
               거기 있고 시험도 거기에 붙어 있다 (TASK-KL-205). */
            const text = input.value;
            const rows: string[] = [];
            for (const ch of text) {
              const parts = split(ch);
              if (parts === null || rows.length >= 40) continue;
              rows.push(
                `<div class="tool-list-row"><span class="tool-list-key">${esc(ch)}</span><span class="tool-list-val">초성 ${parts[0]} · 중성 ${parts[1]} · 종성 ${parts[2] || t('jamo.value.none')}</span></div>`
              );
            }
            cho.value = initials(text);
            all.value = decompose(text);
            out.innerHTML = rows.join('');
            status.textContent = text ? t('jamo.say.split', { n: [...text].length }) : t('jamo.status.idle');
            status.className = 'tool-status' + (text ? ' ok' : '');
            Toolbox.trackUse?.('split');
          }

          /** 자모 나열을 다시 글자로. 판단은 알맹이(`core/jamo.ts` 의 compose)가 한다. */
          function join(): void {
            input.value = compose(input.value);
            run();
            status.textContent = t('jamo.say.joined');
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('join');
          }

          input.addEventListener('input', run);
          $<HTMLButtonElement>('#jaCopyCho').onclick = () => {
            if (cho.value) void Toolbox.copyText?.(cho.value, { message: t('jamo.copy.cho') });
          };
          $<HTMLButtonElement>('#jaCopyAll').onclick = () => {
            if (all.value) void Toolbox.copyText?.(all.value, { message: t('jamo.copy.all') });
          };
          $<HTMLButtonElement>('#jaJoin').onclick = join;

          // 주소로 부른 경우 (`?op=split&text=…` / `?op=join&text=…`) — 아니면 예시 (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined) {
            input.value = String(call.args.text ?? '');
            if (call.op === 'join') join();
            else run();
          } else {
            input.value = t('jamo.ph.in');
            run();
            if (call?.error !== undefined) {
              status.textContent = call.error;
              status.className = 'tool-status error';
            }
          }
                  });
        }
      }
    ]
  });
})();
