/**
 * 큰 파일 나누기·합치기 (TASK-KL-088)
 *
 * 메일 첨부는 25MB, 메신저는 더 작다. 그래서 큰 파일을 보낼 때 사람들은 클라우드에 올리고
 * 링크를 준다 — 회사 자료나 계약서를 그렇게 올리기 곤란한 경우가 많다.
 *
 * 파일을 조각으로 나누면 그냥 여러 번 보내면 된다. 받는 쪽은 여기서 다시 합친다.
 * **압축도 변환도 하지 않는다** — 바이트를 그대로 잘랐다가 그대로 잇는다.
 * 그래서 합친 결과는 원본과 완전히 같다(검사값으로 확인시켜 준다).
 */
import { fileSize as size } from './shared/media';

(function (): void {
  const hex = (buf: ArrayBuffer): string =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  Toolbox.register({
    id: 'filesplit',
    title: '큰 파일 나누기·합치기',
    category: 'tool',
    desc: '큰 파일을 여러 조각으로 나누고 다시 합칩니다. 압축하지 않아 원본과 완전히 같습니다',
    layout: 'wide',
    icon: '<path d="M4 12h16" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 3"/><rect x="4" y="3" width="16" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="4" y="15" width="7" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="13" y="15" width="7" height="6" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: '나누기·합치기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-chips" style="margin-bottom:var(--space-lg);">
              <button type="button" class="tool-chip active" id="fsModeSplit">나누기</button>
              <button type="button" class="tool-chip" id="fsModeJoin">합치기</button>
            </div>

            <div class="tool-drop" id="fsDrop">
              <input type="file" id="fsFile" hidden>
              <span id="fsDropLabel">나눌 파일을 끌어다 놓거나 눌러서 고르세요</span>
            </div>

            <div id="fsSplitOpts" style="margin-top:var(--space-lg);">
              <div class="field-group">
                <label class="field-label" for="fsSize">한 조각 크기</label>
                <select id="fsSize">
                  <option value="5">5MB — 메신저</option>
                  <option value="20" selected>20MB — 메일 첨부</option>
                  <option value="50">50MB</option>
                  <option value="100">100MB</option>
                </select>
              </div>
            </div>

            <div class="cc-stats" id="fsStats"></div>
            <div class="tool-list" id="fsList"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="fsRun">나누기</button>
              <button class="btn btn-ghost" id="fsClear">비우기</button>
            </div>

            <div class="tool-status" id="fsStatus">파일은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#fsDrop');
          const fileInput = $<HTMLInputElement>('#fsFile');
          const listEl = $<HTMLElement>('#fsList');
          const stats = $<HTMLElement>('#fsStats');
          const status = $<HTMLElement>('#fsStatus');
          const runBtn = $<HTMLButtonElement>('#fsRun');

          let mode: 'split' | 'join' = 'split';
          let one: File | null = null;
          let many: File[] = [];

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          function setMode(next: 'split' | 'join'): void {
            mode = next;
            one = null;
            many = [];
            listEl.innerHTML = '';
            stats.innerHTML = '';
            $<HTMLElement>('#fsModeSplit').classList.toggle('active', next === 'split');
            $<HTMLElement>('#fsModeJoin').classList.toggle('active', next === 'join');
            $<HTMLElement>('#fsSplitOpts').style.display = next === 'split' ? '' : 'none';
            fileInput.multiple = next === 'join';
            runBtn.textContent = next === 'split' ? '나누기' : '합치기';
            $<HTMLElement>('#fsDropLabel').textContent =
              next === 'split'
                ? '나눌 파일을 끌어다 놓거나 눌러서 고르세요'
                : '조각 파일을 모두 끌어다 놓거나 눌러서 고르세요 (순서는 알아서 맞춥니다)';
            say(
              next === 'split'
                ? '파일을 넣고 조각 크기를 고르세요.'
                : '조각을 모두 넣으세요 — 이름 끝의 번호로 순서를 맞춥니다.'
            );
          }

          /**
           * 조각 이름 = . 번호만 담으면 **마지막 조각을 빠뜨려도 모른다** —
           * 남은 것끼리는 1,2,3 으로 이어져 멀쩡해 보이기 때문이다(시험에서 그대로 통과했다).
           * 전체 개수를 같이 적어 두면 몇 개짜리인지 알 수 있다. 옛 이름(.001.part)도 읽어 준다.
           */
          const partOf = (name: string): { index: number; total: number } => {
            const m = name.match(/\.(\d+)of(\d+)\.part$/i);
            if (m) return { index: parseInt(m[1], 10), total: parseInt(m[2], 10) };
            const old = name.match(/\.(\d+)\.part$/i);
            return { index: old ? parseInt(old[1], 10) : -1, total: 0 };
          };
          const partIndex = (name: string): number => partOf(name).index;

          /**
           * 조각 크기(바이트). 소수도 받도록 parseFloat 를 쓰고, 0 이하면 기본값으로 되돌린다 —
           * 0 이 되면 「무한히 나누기」에 빠져 브라우저가 멈춘다(시험에서 실제로 그렇게 됐다).
           */
          function chunkBytes(): number {
            const mb = parseFloat($<HTMLSelectElement>('#fsSize').value);
            return (Number.isFinite(mb) && mb > 0 ? mb : 20) * 1024 * 1024;
          }

          function render(): void {
            if (mode === 'split') {
              if (!one) return;
              const chunk = chunkBytes();
              const count = Math.ceil(one.size / chunk);
              stats.innerHTML =
                stat('파일 크기', size(one.size), true) + stat('조각 수', `${count}개`) + stat('마지막 조각', size(one.size - chunk * (count - 1)));
              listEl.innerHTML = `<div class="tool-list-row"><span class="tool-list-key">${esc(one.name)}</span><span class="tool-list-val">${size(one.size)}</span></div>`;
              return;
            }
            const sorted = many.slice().sort((a, b) => partIndex(a.name) - partIndex(b.name));
            const missing: number[] = [];
            // 이름에 적힌 전체 개수가 있으면 그 수를 기준으로 본다 — 뒤쪽이 통째로 빠진 경우를 잡는다
            const declared = Math.max(0, ...sorted.map((f) => partOf(f.name).total));
            const expected = Math.max(sorted.length, declared);
            for (let want = 1; want <= expected; want++) {
              if (!sorted.some((f) => partIndex(f.name) === want)) missing.push(want);
            }
            listEl.innerHTML = sorted
              .map(
                (f) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${partIndex(f.name) > 0 ? partIndex(f.name) + '번' : '?'}</span><span class="tool-list-val">${esc(f.name)} <span class="tool-list-dim">${size(f.size)}</span></span></div>`
              )
              .join('');
            const total = sorted.reduce((a, f) => a + f.size, 0);
            stats.innerHTML = stat('조각 수', `${sorted.length}개`, true) + stat('합친 크기', size(total));
            // 조각이 빠진 채 합치면 열리지 않는 파일이 나온다 — 그 전에 말해 준다
            if (missing.length) say(`조각이 빠졌거나 순서가 맞지 않습니다 (${missing.slice(0, 3).join(', ')}번 자리). 모두 넣었는지 확인해 주세요.`, 'error');
            else if (sorted.length) say(`${sorted.length}조각이 순서대로 준비됐습니다.`, 'ok');
          }

          async function split(): Promise<void> {
            if (!one) {
              say('파일을 먼저 넣어 주세요.', 'error');
              return;
            }
            const chunk = chunkBytes();
            const count = Math.ceil(one.size / chunk);
            if (count < 2) {
              say('이 파일은 조각 크기보다 작아 나눌 필요가 없어요.', 'error');
              return;
            }
            for (let i = 0; i < count; i++) {
              say(`나누는 중… ${i + 1}/${count}`);
              const piece = one.slice(i * chunk, Math.min((i + 1) * chunk, one.size));
              const a = document.createElement('a');
              a.href = URL.createObjectURL(piece);
              a.download = `${one.name}.${String(i + 1).padStart(3, '0')}of${String(count).padStart(3, '0')}.part`;
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 4000);
              // 브라우저가 연속 내려받기를 막지 않도록 사이를 둔다
              await new Promise((r) => setTimeout(r, 250));
            }
            const digest = await crypto.subtle.digest('SHA-256', await one.arrayBuffer());
            say(`${count}조각으로 나눴어요. 합친 뒤 이 값과 같으면 원본과 완전히 같습니다 — ${hex(digest).slice(0, 16)}…`, 'ok');
            Toolbox.trackUse?.('split');
          }

          async function join(): Promise<void> {
            if (many.length < 2) {
              say('조각을 두 개 이상 넣어 주세요.', 'error');
              return;
            }
            const sorted = many.slice().sort((a, b) => partIndex(a.name) - partIndex(b.name));
            const blob = new Blob(sorted, { type: 'application/octet-stream' });
            const name = sorted[0].name.replace(/\.\d+(of\d+)?\.part$/i, '') || '합친파일';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            // 합친 것이 원본과 같은지 스스로 확인할 수 있게 검사값을 준다
            const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
            say(`${sorted.length}조각을 합쳐 ${size(blob.size)} 로 받았어요. 검사값 ${hex(digest).slice(0, 16)}… — 나눌 때 나온 값과 같으면 원본과 완전히 같습니다.`, 'ok');
            Toolbox.trackUse?.('join');
          }

          function take(files: FileList | File[]): void {
            const arr = Array.from(files);
            if (mode === 'split') one = arr[0] || null;
            else many = arr.filter((f) => partIndex(f.name) > 0 || arr.length > 1);
            render();
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files) take(fileInput.files);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            if (e.dataTransfer?.files) take(e.dataTransfer.files);
          });
          $<HTMLElement>('#fsModeSplit').onclick = () => setMode('split');
          $<HTMLElement>('#fsModeJoin').onclick = () => setMode('join');
          $<HTMLSelectElement>('#fsSize').addEventListener('change', render);
          runBtn.onclick = () => {
            void (mode === 'split' ? split() : join()).catch((err: Error) => say('처리 중 문제가 생겼어요: ' + err.message, 'error'));
          };
          $<HTMLButtonElement>('#fsClear').onclick = () => setMode(mode);

          setMode('split');
        }
      }
    ]
  });
})();
