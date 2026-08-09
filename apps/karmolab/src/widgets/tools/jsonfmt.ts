/**
 * JSON 포맷터 / 검증기 — 정렬·압축·키 정렬 + 파싱 에러의 줄·칸 위치를 짚어준다.
 * 라이브러리 없이 JSON.parse 의 message 에서 위치를 역산 (브라우저별 문구 차이 흡수).
 */
import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  function errorPosition(msg: string, src: string): { line: number; col: number; pos: number } | null {
    // V8: "... at position 123 (line 4 column 5)" / Firefox: "at line 4 column 5"
    const lineCol = msg.match(/line (\d+) column (\d+)/i);
    if (lineCol) {
      const line = parseInt(lineCol[1], 10);
      const col = parseInt(lineCol[2], 10);
      const lines = src.split('\n');
      let pos = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
      return { line, col, pos: pos + col - 1 };
    }
    const at = msg.match(/position (\d+)/i);
    if (at) {
      const pos = parseInt(at[1], 10);
      const before = src.slice(0, pos).split('\n');
      return { line: before.length, col: before[before.length - 1].length + 1, pos };
    }
    return null;
  }

  function sortKeysDeep(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sortKeysDeep);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      Object.keys(v as Record<string, unknown>)
        .sort((a, b) => a.localeCompare(b))
        .forEach((k) => {
          out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
        });
      return out;
    }
    return v;
  }

  /**
   * 흔한 실수를 고쳐 본다 — 꼬리 쉼표 · 홑따옴표 · 주석 · 앞뒤 군더더기.
   *
   * 남들(codebeautify·jsonformatter)은 「고쳐 준다」를 앞세운다. 우리도 하되 **말없이 고치지는
   * 않는다** — 고친 판이 실제로 통과할 때만 「이렇게 고치면 됩니다」라고 보여 주고, 누를지는
   * 사람이 정한다. 조용히 바꿔 놓으면 원본이 뭐였는지 아무도 모른다.
   */
  function repairCandidate(raw: string): string | null {
    let s = raw.trim();
    if (!s) return null;
    s = s.replace(/^\uFEFF/, '');
    // 줄 주석 · 블록 주석 (문자열 안은 건드리지 않도록 따옴표를 따라가며 지운다)
    let out = '';
    let inStr: string | null = null;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const next = s[i + 1];
      if (inStr) {
        out += ch;
        if (ch === '\\') { out += next ?? ''; i++; continue; }
        if (ch === inStr) inStr = null;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = ch; out += ch; continue; }
      if (ch === '/' && next === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
      if (ch === '/' && next === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i++; continue; }
      out += ch;
    }
    // 홑따옴표 문자열 → 쌍따옴표 (안에 쌍따옴표가 없을 때만 — 있으면 손대지 않는다)
    out = out.replace(/'([^'"\\]*)'/g, '"$1"');
    // 따옴표 없는 키
    out = out.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
    // 꼬리 쉼표
    out = out.replace(/,(\s*[}\]])/g, '$1');
    if (out === raw.trim()) return null;
    try { JSON.parse(out); } catch { return null; }
    return out;
  }

  function esc(s: string): string {
    return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
  }

  /** 값 하나를 트리 한 줄로. 접힌 채로 시작하는 것은 큰 JSON 에서 화면이 폭발하기 때문이다. */
  function treeHtml(value: unknown, key: string | null, path: string, depth: number): string {
    const 이름 = key === null ? '' : `<span class="jt-key">${esc(key)}</span><span class="jt-colon">:</span> `;
    if (value === null) return `<div class="jt-row" data-path="${esc(path)}">${이름}<span class="jt-null">null</span></div>`;
    if (typeof value !== 'object') {
      const kind = typeof value === 'string' ? 'str' : typeof value === 'number' ? 'num' : 'bool';
      const 글 = typeof value === 'string' ? `"${esc(value)}"` : esc(String(value));
      return `<div class="jt-row" data-path="${esc(path)}">${이름}<span class="jt-${kind}">${글}</span></div>`;
    }
    const arr = Array.isArray(value);
    const entries = arr
      ? (value as unknown[]).map((v, i) => [String(i), v] as const)
      : Object.entries(value as Record<string, unknown>);
    const 요약 = t(arr ? 'jsonfmt.tree.array' : 'jsonfmt.tree.object', { n: entries.length });
    const 자식 = entries
      .map(([k, v]) => treeHtml(v, arr ? `[${k}]` : k, arr ? `${path}[${k}]` : `${path}.${k}`, depth + 1))
      .join('');
    return `<details class="jt-node" data-path="${esc(path)}"${depth < 2 ? ' open' : ''}>
        <summary class="jt-row">${이름}<span class="jt-brace">${arr ? '[' : '{'}</span><span class="jt-count">${요약}</span><span class="jt-brace">${arr ? ']' : '}'}</span></summary>
        <div class="jt-children">${자식}</div>
      </details>`;
  }

  function describe(v: unknown): string {
    let keys = 0;
    let arrays = 0;
    let depth = 0;
    (function walk(node: unknown, d: number): void {
      if (d > depth) depth = d;
      if (Array.isArray(node)) {
        arrays++;
        node.forEach((c) => walk(c, d + 1));
      } else if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        keys += Object.keys(o).length;
        Object.keys(o).forEach((k) => walk(o[k], d + 1));
      }
    })(v, 1);
    return t('jsonfmt.shape', {
      keys: keys.toLocaleString(locale()),
      arrays: arrays.toLocaleString(locale()),
      depth
    });
  }

  Toolbox.register({
    id: 'jsonfmt',
    title: t('widgets.jsonfmt.title', undefined, 'JSON 포맷터'),
    category: 'tool',
    desc: t(
      'widgets-desc.jsonfmt.desc',
      undefined,
      'JSON 을 보기 좋게 정렬하거나 한 줄로 압축하고, 문법 오류의 줄·칸 위치를 찾아줍니다'
    ),
    layout: 'wide',
    icon: '<path d="M9 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2M15 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'JSON',
        build: function (container: HTMLElement): void {
          void loadNamespace('jsonfmt').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: t('jsonfmt.mdd') });
          container.innerHTML = `
            <div class="tool-split">
              <div class="tool-split-pane">
                <div class="field-row" style="margin-bottom:8px;">
                  <label class="field-label" style="margin:0;">${esc(t('jsonfmt.label.input'))}</label>
                  <div style="display:flex; gap:6px;">
                    <select id="jfIndent" aria-label="들여쓰기" style="width:auto; padding:4px 24px 4px 8px; font-size:var(--font-size-xs);">
                      <option value="2">${esc(t('jsonfmt.indent.2'))}</option>
                      <option value="4">${esc(t('jsonfmt.indent.4'))}</option>
                      <option value="tab">${esc(t('jsonfmt.indent.tab'))}</option>
                    </select>
                    <button class="btn btn-ghost" id="jfSample">${esc(t('jsonfmt.btn.sample'))}</button>
                  </div>
                </div>
                <textarea id="jfInput" aria-label="${esc(t('jsonfmt.aria.input'))}" class="mono-input" placeholder='{"name":"KarmoLab","tools":["글자수","JSON"],"ok":true}' style="min-height:340px;"></textarea>
                <!-- 「눌러야 나오는」 도구가 아니라 **모드를 고르면 즉시 나오는** 도구다 (TASK-KL-133).
                     붙여넣고 한 번 더 눌러야 결과가 나오면 그 한 번이 매번 쌓인다. -->
                <div class="tool-chips" id="jfModes" style="margin-top:10px;">
                  <button type="button" class="tool-chip active" data-mode="format">${esc(t('jsonfmt.mode.format'))}</button>
                  <button type="button" class="tool-chip" data-mode="tree">${esc(t('jsonfmt.mode.tree'))}</button>
                  <button type="button" class="tool-chip" data-mode="minify">${esc(t('jsonfmt.mode.minify'))}</button>
                  <button type="button" class="tool-chip" data-mode="sort">${esc(t('jsonfmt.mode.sort'))}</button>
                  <button type="button" class="tool-chip" data-mode="escape">${esc(t('jsonfmt.mode.escape'))}</button>
                  <button type="button" class="btn btn-ghost" id="jfClear" style="margin-left:auto;">${esc(t('jsonfmt.btn.clear'))}</button>
                </div>
              </div>
              <div class="tool-split-pane">
                <div class="field-row" style="margin-bottom:8px;">
                  <label class="field-label" style="margin:0;">${esc(t('jsonfmt.label.output'))}</label>
                  <button class="btn btn-ghost" id="jfCopy">${esc(t('jsonfmt.btn.copy'))}</button>
                </div>
                <textarea id="jfOutput" aria-label="정리된 결과" class="mono-input" readonly style="min-height:340px;"></textarea>
                <div id="jfTreeWrap" style="display:none;">
                  <div class="field-row" style="margin-bottom:6px; gap:6px;">
                    <input type="text" id="jfFind" placeholder="${esc(t('jsonfmt.ph.find'))}" aria-label="${esc(t('jsonfmt.ph.find'))}" style="flex:1;">
                    <button class="btn btn-ghost" id="jfExpand">${esc(t('jsonfmt.btn.expand'))}</button>
                    <button class="btn btn-ghost" id="jfCollapse">${esc(t('jsonfmt.btn.collapse'))}</button>
                  </div>
                  <div id="jfTree" class="jt-tree" aria-label="JSON 트리"></div>
                </div>
                <div id="jfStatus" class="tool-status" style="margin-top:10px;">${esc(t('jsonfmt.status.idle'))}</div>
                <div id="jfRepair" class="jf-repair" style="display:none;"></div>
              </div>
            </div>
          `;

          const input = container.querySelector('#jfInput') as HTMLTextAreaElement;
          const output = container.querySelector('#jfOutput') as HTMLTextAreaElement;
          const status = container.querySelector('#jfStatus') as HTMLElement;
          const indentSel = container.querySelector('#jfIndent') as HTMLSelectElement;
          const treeWrap = container.querySelector('#jfTreeWrap') as HTMLElement;
          const tree = container.querySelector('#jfTree') as HTMLElement;
          const find = container.querySelector('#jfFind') as HTMLInputElement;
          const repair = container.querySelector('#jfRepair') as HTMLElement;

          function indent(): string | number {
            const v = indentSel.value;
            return v === 'tab' ? '\t' : parseInt(v, 10);
          }

          function setStatus(msg: string, kind: 'ok' | 'error' | 'idle'): void {
            status.textContent = msg;
            status.className = 'tool-status' + (kind === 'ok' ? ' ok' : kind === 'error' ? ' error' : '');
          }

          function parse(): unknown | undefined {
            const raw = input.value.trim();
            if (!raw) {
              setStatus(t('jsonfmt.status.empty'), 'idle');
              return undefined;
            }
            try {
              const v = JSON.parse(raw);
              repair.style.display = 'none';
              return v;
            } catch (e) {
              const 고친판 = repairCandidate(raw);
              if (고친판) {
                repair.innerHTML =
                  `<span>${esc(t('jsonfmt.repair.hint'))}</span>` +
                  `<button class="btn btn-ghost" id="jfFix">${esc(t('jsonfmt.repair.apply'))}</button>`;
                repair.style.display = '';
                (repair.querySelector('#jfFix') as HTMLButtonElement).onclick = () => {
                  input.value = 고친판;
                  repair.style.display = 'none';
                  run();
                };
              } else {
                repair.style.display = 'none';
              }
              const msg = e instanceof Error ? e.message : String(e);
              const pos = errorPosition(msg, raw);
              if (pos) {
                const line = raw.split('\n')[pos.line - 1] || '';
                setStatus(
                  `${t('jsonfmt.status.syntaxAt', { line: pos.line, col: pos.col })}\n${line
                    .trim()
                    .slice(0, 120)}\n${msg}`,
                  'error'
                );
                input.focus();
                input.setSelectionRange(pos.pos, Math.min(pos.pos + 1, raw.length));
              } else {
                setStatus(t('jsonfmt.status.syntax', { msg }), 'error');
              }
              return undefined;
            }
          }

          function emit(value: unknown, text: string, note: string): void {
            output.value = text;
            setStatus(
              t('jsonfmt.status.valid', {
                shape: describe(value),
                note,
                n: text.length.toLocaleString(locale())
              }),
              'ok'
            );
          }

          /* 지금 무엇으로 보여 줄지. 고르면 그 자리에서 다시 그린다. */
          let mode: 'format' | 'tree' | 'minify' | 'sort' | 'escape' = 'format';

          /** 찾는 글이 든 줄만 남기고, 그 줄에 닿는 가지는 전부 펼친다. */
          function applyFind(): void {
            const q = find.value.trim().toLowerCase();
            tree.querySelectorAll<HTMLElement>('.jt-row, .jt-node').forEach((el) => {
              el.classList.remove('jt-hit', 'jt-dim');
            });
            if (!q) return;
            const 맞은것: HTMLElement[] = [];
            tree.querySelectorAll<HTMLElement>('.jt-row').forEach((row) => {
              if ((row.textContent || '').toLowerCase().includes(q)) 맞은것.push(row);
            });
            맞은것.forEach((row) => {
              row.classList.add('jt-hit');
              let p: HTMLElement | null = row.parentElement;
              while (p && p !== tree) {
                if (p instanceof HTMLDetailsElement) p.open = true;
                p = p.parentElement;
              }
            });
            setStatus(맞은것.length ? `「${find.value.trim()}」 ${맞은것.length}줄` : `「${find.value.trim()}」 없음`, 맞은것.length ? 'ok' : 'idle');
          }

          function run(): void {
            treeWrap.style.display = mode === 'tree' ? '' : 'none';
            output.style.display = mode === 'tree' ? 'none' : '';
            if (mode === 'escape') {
              const raw = input.value;
              if (!raw) { output.value = ''; setStatus(t('jsonfmt.status.empty'), 'idle'); return; }
              output.value = JSON.stringify(raw);
              setStatus(t('jsonfmt.status.escaped'), 'ok');
              return;
            }
            const v = parse();
            if (v === undefined) { output.value = ''; tree.innerHTML = ''; return; }
            if (mode === 'tree') {
              tree.innerHTML = treeHtml(v, null, '$', 0);
              setStatus(`유효한 JSON · ${describe(v)} · 줄을 누르면 그 자리의 경로를 복사해요`, 'ok');
              applyFind();
              return;
            }
            if (mode === 'minify') {
              const before = input.value.length;
              const text = JSON.stringify(v);
              emit(
                v,
                text,
                t('jsonfmt.note.minify', {
                  before: before.toLocaleString(locale()),
                  after: text.length.toLocaleString(locale())
                })
              );
            } else if (mode === 'sort') {
              const sorted = sortKeysDeep(v);
              emit(sorted, JSON.stringify(sorted, null, indent()), t('jsonfmt.note.sort'));
            } else {
              emit(v, JSON.stringify(v, null, indent()), t('jsonfmt.note.format'));
            }
          }

          /* 글자를 칠 때마다 통째로 다시 해석하면 큰 JSON 에서 손가락이 느껴진다.
             입력이 멎은 뒤에 한 번만 한다. */
          let timer: ReturnType<typeof setTimeout> | null = null;
          function runSoon(): void {
            if (timer !== null) clearTimeout(timer);
            timer = setTimeout(run, 120);
          }

          container.querySelector('#jfModes')?.addEventListener('click', (e: Event) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('.tool-chip');
            if (!btn) return;
            mode = (btn.dataset.mode || 'format') as typeof mode;
            container.querySelectorAll('.tool-chip').forEach((c) => c.classList.toggle('active', c === btn));
            run();
          });
          input.addEventListener('input', runSoon);
          indentSel.addEventListener('change', run);
          find.addEventListener('input', applyFind);
          (container.querySelector('#jfExpand') as HTMLButtonElement).onclick = () => {
            tree.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = true; });
          };
          (container.querySelector('#jfCollapse') as HTMLButtonElement).onclick = () => {
            tree.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = false; });
          };
          /* 큰 JSON 에서 사람이 진짜 원하는 건 「이 값이 어디 있냐」다 — 누르면 그 경로를 준다.
             코드에 그대로 붙여 쓸 수 있는 모양($.a.b[0])으로. */
          tree.addEventListener('click', (e: Event) => {
            const el = (e.target as HTMLElement).closest<HTMLElement>('[data-path]');
            if (!el) return;
            const path = el.dataset.path || '';
            if (!path) return;
            void Toolbox.copyText?.(path, { message: `경로 복사 · ${path}` });
          });
          (container.querySelector('#jfSample') as HTMLButtonElement).onclick = () => {
            input.value = '{"name":"KarmoLab","tools":[{"id":"charcount","ko":"글자수 세기"},{"id":"jsonfmt","ko":"JSON 포맷터"}],"free":true,"since":2024}';
            run();
          };
          (container.querySelector('#jfClear') as HTMLButtonElement).onclick = () => {
            input.value = '';
            output.value = '';
            setStatus(t('jsonfmt.status.empty'), 'idle');
          };
          (container.querySelector('#jfCopy') as HTMLButtonElement).onclick = async () => {
            if (!output.value) return;
            await Toolbox.copyText?.(output.value, { message: t('jsonfmt.copy.done') });
          };
  }
})();
