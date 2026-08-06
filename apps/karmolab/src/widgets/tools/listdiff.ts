/**
 * 목록 비교 (TASK-KL-088)
 *
 * 두 명단을 놓고 「양쪽에 다 있는 것 / 한쪽에만 있는 것」 을 가리는 일은 자주 생기는데
 * 눈으로 대조하면 반드시 놓친다. 텍스트 비교(줄 단위 diff)와는 다른 요구다 —
 * **순서를 무시하고 집합으로** 봐야 하기 때문. 그래서 별도로 둔다.
 */
(function (): void {
  Toolbox.register({
    id: 'listdiff',
    title: '목록 비교',
    category: 'tool',
    desc: '두 명단에서 공통·한쪽에만 있는 항목을 가려냅니다. 순서와 무관',
    layout: 'wide',
    icon: '<circle cx="9" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="15" cy="12" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '목록 비교',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">A 목록</div>
                  <textarea id="ldA" rows="8" spellcheck="false" placeholder="한 줄에 하나"></textarea>
                </div>
                <div>
                  <div class="tool-sublabel">B 목록</div>
                  <textarea id="ldB" rows="8" spellcheck="false" placeholder="한 줄에 하나"></textarea>
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="ldTrim" checked> 양끝 공백 무시</label>
                <label class="tool-chip"><input type="checkbox" id="ldCase"> 대소문자 구분</label>
              </div>
            </div>

            <div class="cc-stats" id="ldStats"></div>

            <div class="field-group">
              <div class="tool-chips" id="ldPick">
                <button type="button" class="tool-chip active" data-set="both">양쪽 다 (교집합)</button>
                <button type="button" class="tool-chip" data-set="onlyA">A 에만</button>
                <button type="button" class="tool-chip" data-set="onlyB">B 에만</button>
                <button type="button" class="tool-chip" data-set="union">전부 (합집합)</button>
              </div>
            </div>

            <textarea id="ldOut" rows="8" spellcheck="false" readonly></textarea>
            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="ldCopy">결과 복사</button>
            </div>
            <div class="tool-status" id="ldStatus">순서와 상관없이 겹치는 항목을 찾습니다.</div>
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
              stat('양쪽 다', `${both.length}개`, true) +
              stat('A 에만', `${onlyA.length}개`) +
              stat('B 에만', `${onlyB.length}개`) +
              stat('전부', `${both.length + onlyA.length + onlyB.length}개`);

            const map: Record<string, string[]> = {
              both,
              onlyA,
              onlyB,
              union: [...both, ...onlyA, ...onlyB]
            };
            outEl.value = map[pick].join('\n');
            status.textContent = `A ${listA.length}줄 · B ${listB.length}줄 — 중복은 하나로 셉니다.`;
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
            if (outEl.value) void Toolbox.copyText?.(outEl.value, { message: '결과를 복사했어요' });
          };

          a.value = '사과\n바나나\n포도\n딸기';
          b.value = '바나나\n딸기\n수박';
          run();
        }
      }
    ]
  });
})();
