/**
 * JSON 포맷터 / 검증기 — 정렬·압축·키 정렬 + 파싱 에러의 줄·칸 위치를 짚어준다.
 * 라이브러리 없이 JSON.parse 의 message 에서 위치를 역산 (브라우저별 문구 차이 흡수).
 */
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
    return `키 ${keys.toLocaleString('ko-KR')}개 · 배열 ${arrays.toLocaleString('ko-KR')}개 · 최대 깊이 ${depth}`;
  }

  Toolbox.register({
    id: 'jsonfmt',
    title: 'JSON 포맷터',
    category: 'tool',
    desc: 'JSON 을 보기 좋게 정렬하거나 한 줄로 압축하고, 문법 오류의 줄·칸 위치를 찾아줍니다',
    layout: 'full',
    icon: '<path d="M9 4H7a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2M15 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'JSON',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '중괄호 하나 빠진 것도 찾아낼게요.' });
          container.innerHTML = `
            <div class="tool-split">
              <div class="tool-split-pane">
                <div class="field-row" style="margin-bottom:8px;">
                  <label class="field-label" style="margin:0;">입력</label>
                  <div style="display:flex; gap:6px;">
                    <select id="jfIndent" style="width:auto; padding:4px 24px 4px 8px; font-size:var(--font-size-xs);">
                      <option value="2">들여쓰기 2칸</option>
                      <option value="4">들여쓰기 4칸</option>
                      <option value="tab">탭</option>
                    </select>
                    <button class="btn btn-ghost" id="jfSample">샘플</button>
                  </div>
                </div>
                <textarea id="jfInput" class="mono-input" placeholder='{"name":"KarmoLab","tools":["글자수","JSON"],"ok":true}' style="min-height:340px;"></textarea>
                <div style="display:flex; gap:6px; margin-top:10px; flex-wrap:wrap;">
                  <button class="btn btn-primary" id="jfFormat">정렬</button>
                  <button class="btn btn-secondary" id="jfMinify">압축</button>
                  <button class="btn btn-ghost" id="jfSort">키 정렬</button>
                  <button class="btn btn-ghost" id="jfEscape">문자열 이스케이프</button>
                  <button class="btn btn-ghost" id="jfClear">지우기</button>
                </div>
              </div>
              <div class="tool-split-pane">
                <div class="field-row" style="margin-bottom:8px;">
                  <label class="field-label" style="margin:0;">결과</label>
                  <button class="btn btn-ghost" id="jfCopy">복사</button>
                </div>
                <textarea id="jfOutput" class="mono-input" readonly style="min-height:340px;"></textarea>
                <div id="jfStatus" class="tool-status" style="margin-top:10px;">JSON 을 입력하고 정렬을 눌러보세요.</div>
              </div>
            </div>
          `;

          const input = container.querySelector('#jfInput') as HTMLTextAreaElement;
          const output = container.querySelector('#jfOutput') as HTMLTextAreaElement;
          const status = container.querySelector('#jfStatus') as HTMLElement;
          const indentSel = container.querySelector('#jfIndent') as HTMLSelectElement;

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
              setStatus('입력이 비어 있어요.', 'idle');
              return undefined;
            }
            try {
              return JSON.parse(raw);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              const pos = errorPosition(msg, raw);
              if (pos) {
                const line = raw.split('\n')[pos.line - 1] || '';
                setStatus(`문법 오류 — ${pos.line}번째 줄 ${pos.col}칸\n${line.trim().slice(0, 120)}\n${msg}`, 'error');
                input.focus();
                input.setSelectionRange(pos.pos, Math.min(pos.pos + 1, raw.length));
              } else {
                setStatus('문법 오류 — ' + msg, 'error');
              }
              return undefined;
            }
          }

          function emit(value: unknown, text: string, note: string): void {
            output.value = text;
            setStatus(`유효한 JSON · ${describe(value)} · ${note} · ${text.length.toLocaleString('ko-KR')}자`, 'ok');
          }

          (container.querySelector('#jfFormat') as HTMLButtonElement).onclick = () => {
            const v = parse();
            if (v === undefined) return;
            emit(v, JSON.stringify(v, null, indent()), '정렬');
          };
          (container.querySelector('#jfMinify') as HTMLButtonElement).onclick = () => {
            const v = parse();
            if (v === undefined) return;
            const before = input.value.length;
            const text = JSON.stringify(v);
            emit(v, text, `압축 (${before.toLocaleString('ko-KR')} → ${text.length.toLocaleString('ko-KR')}자)`);
          };
          (container.querySelector('#jfSort') as HTMLButtonElement).onclick = () => {
            const v = parse();
            if (v === undefined) return;
            const sorted = sortKeysDeep(v);
            emit(sorted, JSON.stringify(sorted, null, indent()), '키 사전순 정렬');
          };
          (container.querySelector('#jfEscape') as HTMLButtonElement).onclick = () => {
            const raw = input.value;
            if (!raw) return;
            output.value = JSON.stringify(raw);
            setStatus('문자열 리터럴로 이스케이프했어요 (JSON 값 안에 통째로 넣을 때 사용).', 'ok');
          };
          (container.querySelector('#jfSample') as HTMLButtonElement).onclick = () => {
            input.value = '{"name":"KarmoLab","tools":[{"id":"charcount","ko":"글자수 세기"},{"id":"jsonfmt","ko":"JSON 포맷터"}],"free":true,"since":2024}';
            setStatus('샘플을 넣었어요. 정렬을 눌러보세요.', 'idle');
          };
          (container.querySelector('#jfClear') as HTMLButtonElement).onclick = () => {
            input.value = '';
            output.value = '';
            setStatus('입력이 비어 있어요.', 'idle');
          };
          (container.querySelector('#jfCopy') as HTMLButtonElement).onclick = async () => {
            if (!output.value) return;
            try {
              await navigator.clipboard.writeText(output.value);
              Toolbox.showToast?.('결과를 복사했어요', 'success', undefined);
            } catch {
              output.select();
              document.execCommand('copy');
            }
          };
        }
      }
    ]
  });
})();
