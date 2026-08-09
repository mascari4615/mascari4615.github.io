/**
 * 목록 비교 (TASK-KL-088)
 *
 * 두 명단을 놓고 「양쪽에 다 있는 것 / 한쪽에만 있는 것」 을 가리는 일은 자주 생기는데
 * 눈으로 대조하면 반드시 놓친다. 텍스트 비교(줄 단위 diff)와는 다른 요구다 —
 * **순서를 무시하고 집합으로** 봐야 하기 때문. 그래서 별도로 둔다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'listdiff',
    title: t('widgets.listdiff.title', undefined, "목록 비교"),
    category: 'tool',
    desc: t('widgets-desc.listdiff.desc', undefined, "두 명단에서 공통·한쪽에만 있는 항목을 가려냅니다. 순서와 무관"),
    layout: 'wide',
    icon: '<circle cx="9" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="15" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: t('listdiff.tab', undefined, "목록 비교"),
        build: function (container: HTMLElement): void {
          void loadNamespace('listdiff').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('listdiff.label.a'))}</div>
                  <textarea id="ldA" rows="8" spellcheck="false" placeholder="${esc(t('listdiff.ph.list'))}"></textarea>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('listdiff.label.b'))}</div>
                  <textarea id="ldB" rows="8" spellcheck="false" placeholder="${esc(t('listdiff.ph.list'))}"></textarea>
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="ldTrim" checked> ${esc(t('listdiff.opt.trim'))}</label>
                <label class="tool-chip"><input type="checkbox" id="ldCase"> ${esc(t('listdiff.opt.case'))}</label>
              </div>
            </div>

            <div class="cc-stats" id="ldStats"></div>

            <div class="field-group">
              <div class="tool-chips" id="ldPick">
                <button type="button" class="tool-chip active" data-set="both">${esc(t('listdiff.tab.both'))}</button>
                <button type="button" class="tool-chip" data-set="onlyA">${esc(t('listdiff.tab.onlyA'))}</button>
                <button type="button" class="tool-chip" data-set="onlyB">${esc(t('listdiff.tab.onlyB'))}</button>
                <button type="button" class="tool-chip" data-set="union">${esc(t('listdiff.tab.all'))}</button>
              </div>
            </div>

            <textarea id="ldOut" aria-label="${esc(t('listdiff.aria.out'))}" rows="8" spellcheck="false" readonly></textarea>
            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="ldCopy">${esc(t('listdiff.btn.copy'))}</button>
            </div>
            <div class="tool-status" id="ldStatus">${esc(t('listdiff.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const a = $<HTMLTextAreaElement>('#ldA');
          const b = $<HTMLTextAreaElement>('#ldB');
          const outEl = $<HTMLTextAreaElement>('#ldOut');
          const stats = $<HTMLElement>('#ldStats');
          const status = $<HTMLElement>('#ldStatus');
          let pick = 'both';

          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function read(el: HTMLTextAreaElement): string[] {
            const trim = $<HTMLInputElement>('#ldTrim').checked;
            return el.value
              .split(/\r?\n/)
              .map((l) => (trim ? l.trim() : l))
              .filter((l) => l !== '');
          }

          function run(): void {
            const caseSensitive = $<HTMLInputElement>('#ldCase').checked;
            const key = (s: string): string => (caseSensitive ? s : s.toLowerCase());
            const listA = read(a);
            const listB = read(b);
            const setB = new Set(listB.map(key));
            const setA = new Set(listA.map(key));

            // 원래 표기를 살려 돌려주려고 값이 아니라 키로 판정하고 원문을 담는다.
            const seen = new Set<string>();
            const both: string[] = [];
            const onlyA: string[] = [];
            listA.forEach((v) => {
              const k = key(v);
              if (seen.has(k)) return;
              seen.add(k);
              (setB.has(k) ? both : onlyA).push(v);
            });
            const onlyB: string[] = [];
            const seenB = new Set<string>();
            listB.forEach((v) => {
              const k = key(v);
              if (seenB.has(k) || setA.has(k)) return;
              seenB.add(k);
              onlyB.push(v);
            });

            stats.innerHTML =
              stat(t('listdiff.stat.both'), t('listdiff.value.count', { n: both.length }), true) +
              stat(t('listdiff.tab.onlyA'), t('listdiff.value.count', { n: onlyA.length })) +
              stat(t('listdiff.tab.onlyB'), t('listdiff.value.count', { n: onlyB.length })) +
              stat(t('listdiff.stat.all'), t('listdiff.value.count', { n: both.length + onlyA.length + onlyB.length }));

            const map: Record<string, string[]> = {
              both,
              onlyA,
              onlyB,
              union: [...both, ...onlyA, ...onlyB]
            };
            outEl.value = map[pick].join('\n');
            status.textContent = t('listdiff.say.counts', { a: listA.length, b: listB.length });
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('compare');
          }

          [a, b].forEach((el) => el.addEventListener('input', run));
          container.querySelectorAll('input[type="checkbox"]').forEach((el) => el.addEventListener('change', run));
          container.querySelectorAll('#ldPick .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#ldPick .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              pick = (chip as HTMLElement).dataset.set || 'both';
              run();
            };
          });
          $<HTMLButtonElement>('#ldCopy').onclick = () => {
            if (outEl.value) void Toolbox.copyText?.(outEl.value, { message: t('listdiff.copy.done') });
          };

          a.value = t('listdiff.sample.a');
          b.value = t('listdiff.sample.b');
          run();
                  });
        }
      }
    ]
  });
})();
