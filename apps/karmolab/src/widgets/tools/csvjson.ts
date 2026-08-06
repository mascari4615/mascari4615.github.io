/**
 * CSV ↔ JSON 변환 (TASK-KL-088)
 *
 * CSV 는 쉼표로 자르면 되는 것처럼 보이지만 **따옴표 안의 쉼표와 줄바꿈**이 있다.
 * 순진하게 자르면 열이 밀려 조용히 망가진 데이터가 나온다 — 그래서 한 글자씩 읽는다.
 * 되돌릴 때도 쉼표·따옴표·줄바꿈이 든 값은 따옴표로 감싸고 안쪽 따옴표는 겹쳐 적는다.
 */
(function (): void {
  /** 따옴표 규칙(RFC 4180)을 지키며 한 글자씩 읽는다. */
  function parseCsv(text: string, delim: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuote) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            cell += '"';
            i++;
          } else inQuote = false;
        } else cell += c;
        continue;
      }
      if (c === '"') inQuote = true;
      else if (c === delim) {
        row.push(cell);
        cell = '';
      } else if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return rows.filter((r) => r.length > 1 || r[0] !== '');
  }

  function toCsv(rows: Array<Record<string, unknown>>, delim: string): string {
    const cols: string[] = [];
    rows.forEach((r) => Object.keys(r).forEach((k) => (cols.indexOf(k) < 0 ? cols.push(k) : null)));
    const esc = (v: unknown): string => {
      const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return /["\n\r]|^\s|\s$/.test(s) || s.includes(delim) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(delim), ...rows.map((r) => cols.map((c) => esc(r[c])).join(delim))].join('\n');
  }

  /** 숫자·불리언처럼 보이면 그 타입으로 — 표를 그대로 쓰려면 대개 이쪽이 편하다. */
  function coerce(s: string): unknown {
    if (s === '') return '';
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(s) && String(Number(s)) === s) return Number(s);
    return s;
  }

  Toolbox.register({
    id: 'csvjson',
    title: 'CSV ↔ JSON 변환',
    category: 'tool',
    desc: '표(CSV)와 JSON 을 서로 바꿉니다. 따옴표 안 쉼표·줄바꿈도 안 깨집니다',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="8" height="16" rx="1" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h8M3 14h8" stroke="currentColor" stroke-width="1.3"/><path d="M15 6h1a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-1" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'CSV ↔ JSON',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">구분자</div>
                  <select id="cjDelim">
                    <option value=",">쉼표 (,)</option>
                    <option value="&#9;">탭</option>
                    <option value=";">세미콜론 (;)</option>
                    <option value="|">파이프 (|)</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">숫자·참거짓 자동 인식</div>
                  <label class="tool-chip" style="display:inline-flex; align-items:center; height:38px;">
                    <input type="checkbox" id="cjCoerce" checked> 켜기
                  </label>
                </div>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">CSV — 첫 줄이 열 이름</label>
              <textarea id="cjCsv" rows="7" spellcheck="false" placeholder="이름,나이&#10;홍길동,30"></textarea>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="cjToJson">CSV → JSON</button>
              <button class="btn btn-primary" id="cjToCsv">JSON → CSV</button>
              <button class="btn btn-ghost" id="cjCopy">JSON 복사</button>
            </div>
            <div class="field-group">
              <label class="field-label">JSON — 객체 배열</label>
              <textarea id="cjJson" rows="9" spellcheck="false" placeholder='[{"이름":"홍길동","나이":30}]'></textarea>
            </div>
            <div class="tool-status" id="cjStatus">따옴표 안의 쉼표와 줄바꿈도 그대로 살립니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const csv = $<HTMLTextAreaElement>('#cjCsv');
          const json = $<HTMLTextAreaElement>('#cjJson');
          const status = $<HTMLElement>('#cjStatus');
          const delim = (): string => $<HTMLSelectElement>('#cjDelim').value;

          function say(msg: string, kind = ''): void {
            status.textContent = msg;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          }

          $<HTMLButtonElement>('#cjToJson').onclick = () => {
            const rows = parseCsv(csv.value.trim(), delim());
            if (rows.length < 2) {
              say('열 이름 줄과 자료 줄이 최소 한 줄씩 필요해요.', 'error');
              return;
            }
            const head = rows[0];
            const useCoerce = $<HTMLInputElement>('#cjCoerce').checked;
            const out = rows.slice(1).map((r) => {
              const o: Record<string, unknown> = {};
              head.forEach((h, i) => (o[h || `열${i + 1}`] = useCoerce ? coerce(r[i] ?? '') : (r[i] ?? '')));
              return o;
            });
            json.value = JSON.stringify(out, null, 2);
            say(`${out.length}행 · ${head.length}열 을 JSON 으로 바꿨어요.`, 'ok');
            Toolbox.trackUse?.('to-json');
          };

          $<HTMLButtonElement>('#cjToCsv').onclick = () => {
            let data: unknown;
            try {
              data = JSON.parse(json.value);
            } catch (e) {
              say('JSON 을 읽지 못했어요: ' + (e as Error).message, 'error');
              return;
            }
            if (!Array.isArray(data) || !data.length || typeof data[0] !== 'object') {
              say('객체가 든 배열이어야 해요. 예) [{"이름":"홍길동"}]', 'error');
              return;
            }
            csv.value = toCsv(data as Array<Record<string, unknown>>, delim());
            say(`${(data as unknown[]).length}행을 CSV 로 바꿨어요.`, 'ok');
            Toolbox.trackUse?.('to-csv');
          };

          $<HTMLButtonElement>('#cjCopy').onclick = () => {
            if (json.value) void Toolbox.copyText?.(json.value, { message: 'JSON 을 복사했어요' });
          };

          csv.value = '이름,나이,메모\n홍길동,30,"쉼표, 들어간 값"\n김철수,25,보통';
        }
      }
    ]
  });
})();
