/**
 * 표 바꾸기 (TASK-KL-088)
 *
 * 엑셀에서 복사한 표를 깃허브 글이나 노션에 붙이려면 마크다운 표로 바꿔야 하고, 반대로
 * 문서의 표를 계산기로 옮기려면 다시 엑셀 붙여넣기 꼴이 필요하다. 손으로 하면 세로줄 맞추다 끝난다.
 *
 * **엑셀에서 복사한 것이 곧바로 들어온다** — 그건 탭으로 나뉜 글자다. 그래서 붙여넣기만 하면 된다.
 * 마크다운은 세로줄을 폭에 맞춰 정렬해 준다. 안 맞춰도 보이기는 하지만, 원본을 읽을 사람이 있다.
 */
(function (): void {
  type Rows = string[][];

  /** 엑셀 붙여넣기(탭 구분) · CSV · 마크다운 표를 모두 받아 표로 만든다. */
  function parse(text: string): { rows: Rows; kind: string } {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) return { rows: [], kind: '' };

    // 마크다운 표: 두 번째 줄이 --- 로 된 구분선
    if (lines.length > 1 && /^\s*\|?[\s:|-]+\|[\s:|-]+$/.test(lines[1]) && lines[0].includes('|')) {
      const rows = lines
        .filter((l, i) => i !== 1)
        .map((l) => l.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim()));
      return { rows, kind: '마크다운 표' };
    }

    // 탭이 있으면 엑셀에서 복사한 것이다 (가장 잦은 경우)
    if (lines[0].includes('\t')) return { rows: lines.map((l) => l.split('\t')), kind: '엑셀 붙여넣기' };

    // 그 외에는 CSV — 따옴표 안의 쉼표를 지켜야 한다
    const rows = lines.map((line) => {
      const out: string[] = [];
      let cur = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoted) {
          if (c === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (c === '"') quoted = false;
          else cur += c;
        } else if (c === '"') quoted = true;
        else if (c === ',') {
          out.push(cur);
          cur = '';
        } else cur += c;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    });
    return { rows, kind: 'CSV' };
  }

  /** 한글은 글자 하나가 두 칸을 차지한다 — 그걸 세지 않으면 세로줄이 안 맞는다. */
  function width(s: string): number {
    let w = 0;
    for (const ch of s) w += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦]/.test(ch) ? 2 : 1;
    return w;
  }
  const pad = (s: string, n: number): string => s + ' '.repeat(Math.max(0, n - width(s)));

  function toMarkdown(rows: Rows, align: boolean): string {
    if (!rows.length) return '';
    const cols = Math.max(...rows.map((r) => r.length));
    const grid = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ''));
    if (!align) {
      const head = `| ${grid[0].join(' | ')} |`;
      const sep = `| ${grid[0].map(() => '---').join(' | ')} |`;
      return [head, sep, ...grid.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n');
    }
    const widths = Array.from({ length: cols }, (_, i) => Math.max(3, ...grid.map((r) => width(r[i]))));
    const line = (r: string[]): string => `| ${r.map((c, i) => pad(c, widths[i])).join(' | ')} |`;
    const sep = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
    return [line(grid[0]), sep, ...grid.slice(1).map(line)].join('\n');
  }

  const toCsv = (rows: Rows): string =>
    rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c)).join(',')).join('\n');

  const toTsv = (rows: Rows): string => rows.map((r) => r.join('\t')).join('\n');

  function toJson(rows: Rows): string {
    if (rows.length < 2) return '[]';
    const keys = rows[0];
    return JSON.stringify(
      rows.slice(1).map((r) => Object.fromEntries(keys.map((k, i) => [k || `열${i + 1}`, r[i] ?? '']))),
      null,
      2
    );
  }

  Toolbox.register({
    id: 'tableconv',
    title: '표 바꾸기',
    category: 'tool',
    desc: '엑셀에서 복사한 표를 마크다운·CSV·JSON 으로 바꿉니다. 붙여넣기만 하면 됩니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18M3 14.5h18M9 4v16M15 4v16" stroke="currentColor" stroke-width="1.3" opacity="0.8"/>',
    tabs: [
      {
        id: 'app',
        label: '표 바꾸기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <label class="field-label" for="tcIn">표 붙여넣기 — 엑셀에서 복사한 것도 그대로 됩니다</label>
              <textarea id="tcIn" rows="8" spellcheck="false" style="width:100%;" placeholder="엑셀에서 표를 복사해 여기에 붙여 넣으세요. CSV 나 마크다운 표도 받습니다."></textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">바꿀 형식</div>
                  <select id="tcTo" aria-label="바꿀 형식">
                    <option value="md">마크다운 표 — 깃허브·노션</option>
                    <option value="csv">CSV — 엑셀·구글시트</option>
                    <option value="tsv">탭 구분 — 엑셀에 바로 붙이기</option>
                    <option value="json">JSON — 첫 줄을 이름으로</option>
                  </select>
                </div>
                <div class="tool-chips" style="align-content:end;">
                  <label class="tool-chip"><input type="checkbox" id="tcAlign" checked> 세로줄 맞추기</label>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="tcStats"></div>

            <div class="field-group">
              <label class="field-label" for="tcOut">바뀐 결과</label>
              <textarea id="tcOut" rows="10" spellcheck="false" style="width:100%;" readonly></textarea>
              <button class="btn btn-ghost btn-sm" id="tcCopy" style="margin-top:8px;">복사</button>
            </div>

            <div class="tool-status" id="tcStatus">엑셀에서 표를 복사해 그대로 붙여 넣어 보세요.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const input = $<HTMLTextAreaElement>('#tcIn');
          const out = $<HTMLTextAreaElement>('#tcOut');
          const stats = $<HTMLElement>('#tcStats');
          const status = $<HTMLElement>('#tcStatus');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function refresh(): void {
            const { rows, kind } = parse(input.value);
            if (!rows.length) {
              out.value = '';
              stats.innerHTML = '';
              say('엑셀에서 표를 복사해 그대로 붙여 넣어 보세요.');
              return;
            }
            const to = $<HTMLSelectElement>('#tcTo').value;
            out.value =
              to === 'md' ? toMarkdown(rows, $<HTMLInputElement>('#tcAlign').checked) :
              to === 'csv' ? toCsv(rows) :
              to === 'tsv' ? toTsv(rows) :
              toJson(rows);

            const cols = Math.max(...rows.map((r) => r.length));
            const ragged = rows.some((r) => r.length !== cols);
            stats.innerHTML =
              stat('알아본 형식', kind, true) + stat('줄', `${rows.length}줄`) + stat('칸', `${cols}칸`);
            // 줄마다 칸 수가 다르면 대개 붙여넣기가 잘린 것이다 — 결과는 나오지만 내용이 어긋난다
            if (ragged) say('줄마다 칸 수가 다릅니다. 붙여넣기가 잘렸는지 확인해 주세요 — 빈 칸으로 채워 만들었습니다.', 'error');
            else say(`${kind} 로 알아봤어요. 복사해서 쓰세요.`, 'ok');
            Toolbox.trackUse?.('convert');
          }

          input.addEventListener('input', refresh);
          $<HTMLSelectElement>('#tcTo').addEventListener('change', refresh);
          $<HTMLInputElement>('#tcAlign').addEventListener('change', refresh);
          $<HTMLButtonElement>('#tcCopy').onclick = () => {
            void Toolbox.copyText?.(out.value, { message: '바뀐 표를 복사했어요' });
          };
          refresh();
        }
      }
    ]
  });
})();
