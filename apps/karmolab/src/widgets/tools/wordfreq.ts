/**
 * 단어 빈도 분석 (TASK-KL-088)
 *
 * 글을 고칠 때 「내가 무슨 말을 반복하고 있나」 는 읽어서는 잘 안 보인다.
 * 세어 보면 바로 드러난다 — 그게 이 도구의 쓸모다.
 * 한국어는 조사가 붙어 「도구를 / 도구가 / 도구는」 이 다 다른 낱말로 세지므로,
 * 흔한 조사를 떼는 선택지를 둔다 (형태소 분석은 아니지만 체감은 크게 달라진다).
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

import { spec, STOP, stripParticle } from '../../core/wordfreq';
import { readInvocation } from '../../lib/tool-url';

(function (): void {
  Toolbox.register({
    id: 'wordfreq',
    title: t('widgets.wordfreq.title', undefined, '단어 빈도 분석'),
    category: 'tool',
    desc: t('widgets-desc.wordfreq.desc', undefined, '글에서 자주 쓴 낱말을 세어 보여줍니다. 한국어 조사 떼기 지원'),
    layout: 'wide',
    icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('wordfreq.tab', undefined, '빈도'),
        build: function (container: HTMLElement): void {
          void loadNamespace('wordfreq').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에 — 파일 실릴 때 그리면 이름 자리에 열쇠가 굳는다. */
  function draw(container: HTMLElement): void {
          /* 번역 글에 꺾쇠가 들어와도 화면이 안 깨지게 — 화면을 그리기 **전**에 있어야 한다. */
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          container.innerHTML = `
            <div class="field-group">
              <label class="field-label">${esc(t('wordfreq.label.text'))}</label>
              <textarea id="wfIn" rows="8" spellcheck="false" placeholder="${esc(t('wordfreq.placeholder'))}"></textarea>
            </div>
            <div class="field-group">
              <div class="tool-chips">
                <label class="tool-chip"><input type="checkbox" id="wfParticle" checked> ${esc(t('wordfreq.opt.particle'))}</label>
                <label class="tool-chip"><input type="checkbox" id="wfStop" checked> ${esc(t('wordfreq.opt.stop'))}</label>
                <label class="tool-chip"><input type="checkbox" id="wfCase"> ${esc(t('wordfreq.opt.case'))}</label>
              </div>
            </div>
            <div class="cc-stats" id="wfStats"></div>
            <div class="tool-list" id="wfOut"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label">${esc(t('wordfreq.label.phrases'))}</label>
              <div class="tool-list" id="wfPhrases"></div>
            </div>
            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="wfCopy">${esc(t('wordfreq.btn.copy'))}</button>
            </div>
            <div class="tool-status" id="wfStatus">${esc(t('wordfreq.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#wfIn');
          const stats = $<HTMLElement>('#wfStats');
          const out = $<HTMLElement>('#wfOut');
          const status = $<HTMLElement>('#wfStatus');
          let rows: Array<[string, number]> = [];

          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function run(): void {
            const text = input.value;
            if (!text.trim()) {
              stats.innerHTML = '';
              out.innerHTML = '';
              rows = [];
              return;
            }
            const useParticle = $<HTMLInputElement>('#wfParticle').checked;
            const useStop = $<HTMLInputElement>('#wfStop').checked;
            const caseSensitive = $<HTMLInputElement>('#wfCase').checked;

            const raw = text.match(/[가-힣]+|[A-Za-z][A-Za-z']*|\d+/g) || [];
            const count: Record<string, number> = {};
            raw.forEach((w) => {
              let word = caseSensitive ? w : w.toLowerCase();
              if (useParticle && /^[가-힣]+$/.test(word)) word = stripParticle(word);
              if (word.length < 2) return;
              if (useStop && STOP.has(word)) return;
              count[word] = (count[word] || 0) + 1;
            });

            rows = Object.entries(count).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], locale()));
            const total = raw.length;
            const top = rows[0];

            stats.innerHTML =
              stat(
                t('wordfreq.stat.top'),
                top ? esc(t('wordfreq.value.topWord', { w: top[0], n: top[1] })) : '—',
                true
              ) +
              stat(t('wordfreq.stat.words'), t('wordfreq.value.items', { n: total.toLocaleString(locale()) })) +
              stat(t('wordfreq.stat.unique'), t('wordfreq.value.items', { n: rows.length.toLocaleString(locale()) })) +
              stat(t('wordfreq.stat.diversity'), total ? `${((rows.length / total) * 100).toFixed(1)}%` : '—');

            /* 반복은 대개 **낱말이 아니라 구(句)**로 온다 — 「그런 의미에서」, 「할 수 있다」.
               상위 도구들이 전부 n-gram 을 주는 이유다. 조사를 뗀 뒤의 낱말로 잇는다. */
            const words = raw.map((w) => {
              let x = caseSensitive ? w : w.toLowerCase();
              if (useParticle && /^[가-힣]+$/.test(x)) x = stripParticle(x);
              return x;
            });
            const phrases: Record<string, number> = {};
            for (const n of [2, 3]) {
              for (let i = 0; i + n <= words.length; i++) {
                const key = words.slice(i, i + n).join(' ');
                phrases[key] = (phrases[key] || 0) + 1;
              }
            }
            const phraseRows = Object.entries(phrases)
              .filter(([, c]) => c >= 2)
              .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
              .slice(0, 12);
            const phraseEl = $<HTMLElement>('#wfPhrases');
            phraseEl.innerHTML = phraseRows.length
              ? phraseRows
                  .map(
                    ([w, c]) =>
                      `<div class="tool-list-row"><span class="tool-list-key">${esc(w)}</span><span class="tool-list-val">${esc(t('wordfreq.value.times', { n: c }))}</span></div>`
                  )
                  .join('')
              : `<div class="tool-status">${esc(t('wordfreq.phrases.none'))}</div>`;

            const maxCount = top ? top[1] : 1;
            out.innerHTML = rows
              .slice(0, 60)
              .map(
                ([w, c]) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${esc(w)}</span><span class="tool-list-val"><span class="wf-bar" style="width:${Math.max(4, (c / maxCount) * 100)}%"></span> ${esc(t('wordfreq.value.times', { n: c }))} <span class="tool-list-dim">${total ? ((c / total) * 100).toFixed(1) : '0'}%</span></span></div>`
              )
              .join('');
            status.textContent = t('wordfreq.status.done', { n: Math.min(60, rows.length) });
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('analyze');
          }

          input.addEventListener('input', run);
          container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', run));

          // 주소로 부른 경우 (`?op=count&text=…`) (TASK-KL-205).
          const call = readInvocation(spec);
          if (call !== null && call.error === undefined && call.op === 'count') {
            input.value = String(call.args.text ?? '');
            run();
          }
          $<HTMLButtonElement>('#wfCopy').onclick = () => {
            if (!rows.length) return;
            void Toolbox.copyText?.(rows.map(([w, c]) => `${w}\t${c}`).join('\n'), { message: t('wordfreq.copy.done') });
          };
  }
})();
