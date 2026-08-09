/**
 * 텍스트 비교 (TASK-KL-088) — 줄 단위 LCS diff.
 * O(n·m) DP 라 아주 큰 입력에서는 잘라낸다 (브라우저가 얼어붙는 편보다 잘린 결과가 낫다).
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

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

  /**
   * 바뀐 줄 **안에서** 어디가 달라졌는지 (2026-08-08 — 남들 기준 맞추기).
   *
   * diffchecker 계열은 전부 글자 단위까지 짚어 준다. 줄 통째를 빨갛게 칠하면 「이 줄이 바뀌었다」
   * 까지만 알고, 사람은 두 줄을 눈으로 다시 대조해야 한다 — 그게 이 도구를 쓰는 이유인데도.
   *
   * 한국어는 띄어쓰기가 적어 단어 단위로 자르면 줄 하나가 통째로 바뀐 것처럼 보인다. 그래서
   * **글자 단위**로 짚는다. 아주 긴 줄은 표를 못 만드니(제곱) 그때만 통째로 칠한다.
   */
  const INLINE_MAX = 400;

  function inlineMark(a: string, b: string): { a: string; b: string } {
    if (!a || !b || a.length > INLINE_MAX || b.length > INLINE_MAX) {
      return { a: `<del class="td-x">${esc(a)}</del>`, b: `<ins class="td-x">${esc(b)}</ins>` };
    }
    const n = a.length;
    const m = b.length;
    const dp: Uint16Array[] = [];
    for (let i = 0; i <= n; i++) dp.push(new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    let 왼 = '';
    let 오 = '';
    const 덩어리 = (kind: 'same' | 'del' | 'ins', text: string): string =>
      kind === 'same' ? esc(text) : kind === 'del' ? `<del class="td-x">${esc(text)}</del>` : `<ins class="td-x">${esc(text)}</ins>`;
    let 같음 = '';
    let 지움 = '';
    let 넣음 = '';
    const flush = (): void => {
      if (같음) { 왼 += 덩어리('same', 같음); 오 += 덩어리('same', 같음); 같음 = ''; }
      if (지움) { 왼 += 덩어리('del', 지움); 지움 = ''; }
      if (넣음) { 오 += 덩어리('ins', 넣음); 넣음 = ''; }
    };
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        if (지움 || 넣음) flush();
        같음 += a[i];
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        if (같음) flush();
        지움 += a[i++];
      } else {
        if (같음) flush();
        넣음 += b[j++];
      }
    }
    if (같음) flush();
    지움 += a.slice(i);
    넣음 += b.slice(j);
    flush();
    return { a: 왼, b: 오 };
  }

  Toolbox.register({
    id: 'textdiff',
    title: t('widgets.textdiff.title', undefined, '텍스트 비교'),
    category: 'tool',
    desc: t(
      'widgets-desc.textdiff.desc',
      undefined,
      '두 텍스트·코드의 달라진 줄을 찾아 색으로 표시합니다 (추가 / 삭제 / 동일)'
    ),
    layout: 'wide',
    icon: '<path d="M4 4h7v16H4zM13 4h7v16h-7z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 13h3M15 11h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('textdiff.tab', undefined, '비교'),
        build: function (container: HTMLElement): void {
          void loadNamespace('textdiff').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: t('textdiff.mdd') });
          container.innerHTML = `
            <div class="tool-split">
              <div class="tool-split-pane">
                <label class="field-label">${esc(t('textdiff.label.a'))}</label>
                <textarea id="tdA" class="mono-input" placeholder="${esc(t('textdiff.ph.a'))}" style="min-height:200px;"></textarea>
              </div>
              <div class="tool-split-pane">
                <label class="field-label">${esc(t('textdiff.label.b'))}</label>
                <textarea id="tdB" class="mono-input" placeholder="${esc(t('textdiff.ph.b'))}" style="min-height:200px;"></textarea>
              </div>
            </div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:var(--space-lg) 0;">
              <!-- 붙여넣고 또 눌러야 나오던 것을 없앴다 — 넣는 대로 비교한다 (TASK-KL-133). -->
              <button class="btn btn-ghost" id="tdSwap">A ↔ B</button>
              <button class="btn btn-ghost" id="tdClear">${esc(t('textdiff.btn.clear'))}</button>
              <div class="tool-chips" id="tdView" style="margin:0;">
                <button type="button" class="tool-chip active" data-view="unified">${esc(t('textdiff.view.unified'))}</button>
                <button type="button" class="tool-chip" data-view="split">${esc(t('textdiff.view.split'))}</button>
              </div>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                <input type="checkbox" id="tdTrim" style="width:auto;" checked> ${esc(t('textdiff.opt.trim'))}
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                <input type="checkbox" id="tdCase" style="width:auto;"> ${esc(t('textdiff.opt.case'))}
              </label>
              <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                <input type="checkbox" id="tdOnlyChanged" style="width:auto;"> ${esc(t('textdiff.opt.onlyChanged'))}
              </label>
            </div>
            <div class="tool-status" id="tdSummary">${esc(t('textdiff.status.idle'))}</div>
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

          /** 통합(위아래) / 나란히(좌우). 긴 줄이 많은 코드는 통합이, 문단 글은 나란히가 편하다. */
          let view: 'unified' | 'split' = 'unified';

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
            ops.forEach((op) => { if (op.type === 'add') add++; if (op.type === 'del') del++; });

            /* 지운 줄 바로 뒤에 넣은 줄이 오면 그 둘은 **고쳐 쓴 한 줄**이다 — 짝지어 놓아야
               줄 안에서 어디가 바뀌었는지 짚을 수 있다. 짝이 없으면 통째 추가/삭제 그대로. */
            type Pair = { kind: 'same' | 'edit' | 'del' | 'add'; a?: number; b?: number };
            const pairs: Pair[] = [];
            for (let k = 0; k < ops.length; ) {
              const op = ops[k];
              if (op.type === 'same') { pairs.push({ kind: 'same', a: op.a, b: op.b }); k++; continue; }
              const dels: number[] = [];
              const adds: number[] = [];
              while (k < ops.length && ops[k].type === 'del') dels.push(ops[k++].a as number);
              while (k < ops.length && ops[k].type === 'add') adds.push(ops[k++].b as number);
              const 짝 = Math.min(dels.length, adds.length);
              for (let t = 0; t < 짝; t++) pairs.push({ kind: 'edit', a: dels[t], b: adds[t] });
              for (let t = 짝; t < dels.length; t++) pairs.push({ kind: 'del', a: dels[t] });
              for (let t = 짝; t < adds.length; t++) pairs.push({ kind: 'add', b: adds[t] });
            }

            const 나란히 = view === 'split';
            const rows = pairs
              .map((p) => {
                if (onlyChanged && p.kind === 'same') return '';
                const 왼줄 = p.a !== undefined ? la[p.a] ?? '' : '';
                const 오른줄 = p.b !== undefined ? lb[p.b] ?? '' : '';
                const numA = p.a !== undefined ? String(p.a + 1) : '';
                const numB = p.b !== undefined ? String(p.b + 1) : '';
                let 왼글 = esc(왼줄);
                let 오른글 = esc(오른줄);
                if (p.kind === 'edit') {
                  const marked = inlineMark(왼줄, 오른줄);
                  왼글 = marked.a;
                  오른글 = marked.b;
                }
                if (나란히) {
                  const 왼종류 = p.kind === 'same' ? 'same' : p.kind === 'add' ? 'blank' : 'del';
                  const 오종류 = p.kind === 'same' ? 'same' : p.kind === 'del' ? 'blank' : 'add';
                  return `<div class="td-srow">
                      <span class="td-num">${numA}</span><span class="td-text td-${왼종류}">${왼종류 === 'blank' ? '' : 왼글}</span>
                      <span class="td-num">${numB}</span><span class="td-text td-${오종류}">${오종류 === 'blank' ? '' : 오른글}</span>
                    </div>`;
                }
                if (p.kind === 'edit') {
                  return `<div class="td-row td-del"><span class="td-num">${numA}</span><span class="td-num"></span><span class="td-sign">-</span><span class="td-text">${왼글}</span></div>` +
                    `<div class="td-row td-add"><span class="td-num"></span><span class="td-num">${numB}</span><span class="td-sign">+</span><span class="td-text">${오른글}</span></div>`;
                }
                const sign = p.kind === 'add' ? '+' : p.kind === 'del' ? '-' : ' ';
                const 글 = p.kind === 'add' ? 오른글 : 왼글;
                return `<div class="td-row td-${p.kind}"><span class="td-num">${numA}</span><span class="td-num">${numB}</span><span class="td-sign">${sign}</span><span class="td-text">${글}</span></div>`;
              })
              .join('');
            out.className = 'td-out' + (나란히 ? ' td-out-split' : '');
            out.innerHTML = rows || `<div class="tool-status">${esc(t('textdiff.status.none'))}</div>`;
            const same = ops.length - add - del;
            summary.className = 'tool-status ' + (add + del === 0 ? 'ok' : '');
            summary.textContent =
              add + del === 0
                ? t('textdiff.status.same', { n: same.toLocaleString(locale()) })
                : t('textdiff.status.diff', {
                    add: add.toLocaleString(locale()),
                    del: del.toLocaleString(locale()),
                    same: same.toLocaleString(locale())
                  }) + (truncated ? t('textdiff.status.truncated', { n: MAX_LINES }) : '');
          }

          /* 줄이 많을수록 비교가 무겁다. 글자를 칠 때마다 하지 않고, 손이 멎으면 한 번 한다. */
          let timer: ReturnType<typeof setTimeout> | null = null;
          let counted = false;
          function runSoon(): void {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(() => {
              run();
              // 「썼다」는 한 판에 한 번만 센다 — 글자마다 세면 숫자가 뻥튀기된다.
              if (!counted && A.value && B.value) { counted = true; Toolbox.trackUse?.('compare'); }
            }, 200);
          }
          A.addEventListener('input', runSoon);
          B.addEventListener('input', runSoon);
          $<HTMLElement>('#tdView').addEventListener('click', (e: Event) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.tool-chip');
            if (!btn) return;
            view = (btn.dataset.view || 'unified') as typeof view;
            $<HTMLElement>('#tdView').querySelectorAll('.tool-chip').forEach((c) => c.classList.toggle('active', c === btn));
            run();
          });
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
            summary.textContent = t('textdiff.status.idle');
            summary.className = 'tool-status';
            counted = false;
          };
          container.querySelectorAll('input[type="checkbox"]').forEach((el) =>
            el.addEventListener('change', () => {
              if (A.value || B.value) run();
            })
          );
  }
})();
