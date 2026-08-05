/**
 * 텍스트 비교 (TASK-KL-088) — 줄 단위 LCS diff.
 * O(n·m) DP 라 아주 큰 입력에서는 잘라낸다 (브라우저가 얼어붙는 편보다 잘린 결과가 낫다).
 */
(function (): void {
  const MAX_LINES = 2000;

  type Op = { type: 'same' | 'add' | 'del'; a?: number; b?: number; text: string };

  function diffLines(a: string[], b: string[]): Op[] {
    const n = a.length;
    const m = b.length;
    // LCS 길이 테이블
    const dp: Uint32Array[] = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const ops: Op[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        ops.push({ type: 'same', a: i, b: j, text: a[i] });
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        ops.push({ type: 'del', a: i, text: a[i] });
        i++;
      } else {
        ops.push({ type: 'add', b: j, text: b[j] });
        j++;
      }
    }
    while (i < n) ops.push({ type: 'del', a: i, text: a[i++] });
    while (j < m) ops.push({ type: 'add', b: j, text: b[j++] });
    return ops;
  }

  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  Toolbox.register({
    id: 'textdiff',
    title: '텍스트 비교',
    category: 'tool',
    desc: '두 텍스트·코드의 달라진 줄을 찾아 색으로 표시합니다 (추가 / 삭제 / 동일)',
    layout: 'wide',
    icon: '<path d="M4 4h7v16H4zM13 4h7v16h-7z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 13h3M15 11h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '비교',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '뭐가 달라졌나 눈 크게 뜨고 볼게요.' });
          container.innerHTML = `
            <div class="tool-split">
              <div class="tool-split-pane">
                <label class="field-label">원본 (A)</label>
                <textarea id="tdA" class="mono-input" placeholder="원본 텍스트" style="min-height:200px;"></textarea>
              </div>
              <div class="tool-split-pane">
                <label class="field-label">변경본 (B)</label>
                <textarea id="tdB" class="mono-input" placeholder="비교할 텍스트" style="min-height:200px;"></textarea>
              </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:var(--space-lg) 0;">
              <button class="btn btn-primary" id="tdRun">비교</button>
              <button class="btn btn-ghost" id="tdSwap">A ↔ B</button>
              <button class="btn btn-ghost" id="tdClear">지우기</button>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                <input type="checkbox" id="tdTrim" style="width:auto;" checked> 줄 끝 공백 무시
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                <input type="checkbox" id="tdCase" style="width:auto;"> 대소문자 무시
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                <input type="checkbox" id="tdOnlyChanged" style="width:auto;"> 바뀐 줄만 보기
              </label>
            </div>
            <div class="tool-status" id="tdSummary">두 쪽에 텍스트를 넣고 비교를 누르세요.</div>
            <div id="tdOut" class="td-out"></div>
          `;
          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const A = $<HTMLTextAreaElement>('#tdA');
          const B = $<HTMLTextAreaElement>('#tdB');
          const out = $<HTMLElement>('#tdOut');
          const summary = $<HTMLElement>('#tdSummary');

          function norm(lines: string[]): string[] {
            const trim = $<HTMLInputElement>('#tdTrim').checked;
            const nocase = $<HTMLInputElement>('#tdCase').checked;
            return lines.map((l) => {
              let s = l;
              if (trim) s = s.replace(/\s+$/, '');
              if (nocase) s = s.toLowerCase();
              return s;
            });
          }

          function run(): void {
            let la = A.value.split('\n');
            let lb = B.value.split('\n');
            let truncated = false;
            if (la.length > MAX_LINES || lb.length > MAX_LINES) {
              la = la.slice(0, MAX_LINES);
              lb = lb.slice(0, MAX_LINES);
              truncated = true;
            }
            const ops = diffLines(norm(la), norm(lb));
            const onlyChanged = $<HTMLInputElement>('#tdOnlyChanged').checked;
            let add = 0;
            let del = 0;
            const rows = ops
              .map((op) => {
                const src = op.type === 'add' ? lb[op.b as number] : la[op.a as number];
                if (op.type === 'add') add++;
                if (op.type === 'del') del++;
                if (onlyChanged && op.type === 'same') return '';
                const sign = op.type === 'add' ? '+' : op.type === 'del' ? '-' : ' ';
                const numA = op.a !== undefined ? String(op.a + 1) : '';
                const numB = op.b !== undefined ? String(op.b + 1) : '';
                return `<div class="td-row td-${op.type}"><span class="td-num">${numA}</span><span class="td-num">${numB}</span><span class="td-sign">${sign}</span><span class="td-text">${esc(src ?? '')}</span></div>`;
              })
              .join('');
            out.innerHTML = rows || '<div class="tool-status">표시할 줄이 없어요.</div>';
            const same = ops.length - add - del;
            summary.className = 'tool-status ' + (add + del === 0 ? 'ok' : '');
            summary.textContent =
              add + del === 0
                ? `두 텍스트가 같습니다 (${same.toLocaleString('ko-KR')}줄).`
                : `추가 ${add.toLocaleString('ko-KR')}줄 · 삭제 ${del.toLocaleString('ko-KR')}줄 · 동일 ${same.toLocaleString('ko-KR')}줄` +
                  (truncated ? ` · ${MAX_LINES}줄까지만 비교했어요` : '');
          }

          $<HTMLButtonElement>('#tdRun').onclick = run;
          $<HTMLButtonElement>('#tdSwap').onclick = () => {
            const t = A.value;
            A.value = B.value;
            B.value = t;
            run();
          };
          $<HTMLButtonElement>('#tdClear').onclick = () => {
            A.value = '';
            B.value = '';
            out.innerHTML = '';
            summary.textContent = '두 쪽에 텍스트를 넣고 비교를 누르세요.';
            summary.className = 'tool-status';
          };
          container.querySelectorAll('input[type="checkbox"]').forEach((el) =>
            el.addEventListener('change', () => {
              if (A.value || B.value) run();
            })
          );
        }
      }
    ]
  });
})();
