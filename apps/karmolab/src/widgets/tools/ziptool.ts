/**
 * ZIP 만들기·풀기 (TASK-KL-088)
 *
 * 파일 몇 개를 묶어 보내거나 받은 압축을 열어 보는 일은, 압축 프로그램을 깔 수 없는
 * 회사 컴퓨터나 남의 기기에서 특히 막힌다. 브라우저만으로 되는 자리를 둔다.
 * 안을 훑어보는 것만으로 끝날 때가 많으므로 **풀기 전에 목록을 먼저 보여준다.**
 */
(function (): void {
  interface ZipEntry {
    name: string;
    dir: boolean;
    date: Date;
    async: (t: string) => Promise<Blob>;
    _data?: { uncompressedSize: number };
  }
  interface ZipInstance {
    file: (name: string, data: Blob | ArrayBuffer) => void;
    files: Record<string, ZipEntry>;
    loadAsync: (data: ArrayBuffer) => Promise<ZipInstance>;
    generateAsync: (o: { type: string; compression?: string; compressionOptions?: { level: number } }) => Promise<Blob>;
  }

  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;

  Toolbox.register({
    id: 'ziptool',
    title: 'ZIP 만들기·풀기',
    category: 'tool',
    desc: '파일을 ZIP 으로 묶고, 받은 ZIP 의 목록을 보고 풀어 냅니다',
    layout: 'wide',
    icon: '<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 3v2h2V3M11 7v2h2V7M11 11v2h2v-2" stroke="currentColor" stroke-width="1.5"/><rect x="10.5" y="15" width="3" height="4" rx="0.6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: 'ZIP',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="zpMode">
                <button type="button" class="tool-chip active" data-mode="make">묶기</button>
                <button type="button" class="tool-chip" data-mode="open">열기</button>
              </div>
            </div>

            <div class="tool-drop" id="zpDrop">
              <input type="file" id="zpFile" multiple hidden>
              <span id="zpDropText">묶을 파일을 끌어다 놓거나 눌러서 고르세요</span>
            </div>

            <div class="field-group" id="zpLevelWrap" style="margin-top:var(--space-lg);">
              <div class="tool-sublabel">압축 세기 <span id="zpLevelVal" class="range-value">보통</span></div>
              <input type="range" id="zpLevel" min="0" max="9" value="6">
            </div>

            <div class="tool-list" id="zpList"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="zpRun">ZIP 만들기</button>
              <button class="btn btn-ghost" id="zpClear">비우기</button>
            </div>
            <div class="tool-status" id="zpStatus">파일은 브라우저 안에서만 다뤄집니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#zpDrop');
          const fileInput = $<HTMLInputElement>('#zpFile');
          const listEl = $<HTMLElement>('#zpList');
          const status = $<HTMLElement>('#zpStatus');
          const level = $<HTMLInputElement>('#zpLevel');
          let mode = 'make';
          let files: File[] = [];
          let opened: ZipInstance | null = null;
          let JSZipCtor: (new () => ZipInstance) | null = null;

          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          async function loadLib(): Promise<new () => ZipInstance> {
            if (JSZipCtor) return JSZipCtor;
            say('압축 처리기를 불러오는 중…');
            await Toolbox.ensureScript?.('vendor/jszip.min');
            const g = (window as unknown as { JSZip: new () => ZipInstance }).JSZip;
            if (!g) throw new Error('압축 처리기를 불러오지 못했습니다');
            JSZipCtor = g;
            return g;
          }

          function renderMake(): void {
            listEl.innerHTML = files
              .map(
                (f) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${size(f.size)}</span><span class="tool-list-val">${esc(f.name)}</span></div>`
              )
              .join('');
          }

          async function openZip(f: File): Promise<void> {
            const Z = await loadLib();
            try {
              opened = await new Z().loadAsync(await f.arrayBuffer());
            } catch {
              say('ZIP 을 열지 못했어요 (암호가 걸려 있을 수 있습니다).', 'error');
              return;
            }
            const entries = Object.values(opened.files).filter((e) => !e.dir);
            listEl.innerHTML = entries
              .map(
                (e, i) =>
                  `<div class="tool-list-row cc-copy-row" data-i="${i}"><span class="tool-list-key">${size(e._data?.uncompressedSize || 0)}</span><span class="tool-list-val">${esc(e.name)} <span class="tool-list-dim">눌러서 내려받기</span></span></div>`
              )
              .join('');
            listEl.querySelectorAll('[data-i]').forEach((el) => {
              (el as HTMLElement).onclick = async () => {
                const e = entries[Number((el as HTMLElement).dataset.i)];
                const blob = await e.async('blob');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = e.name.split('/').pop() || 'file';
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              };
            });
            say(`${entries.length}개 파일이 들어 있어요. 줄을 누르면 그 파일만 내려받습니다.`, 'ok');
            Toolbox.trackUse?.('open');
          }

          async function makeZip(): Promise<void> {
            if (!files.length) {
              say('묶을 파일을 먼저 넣어 주세요.', 'error');
              return;
            }
            const Z = await loadLib();
            say('압축하는 중…');
            const zip = new Z();
            files.forEach((f) => zip.file(f.name, f));
            const lv = parseInt(level.value, 10);
            const blob = await zip.generateAsync({
              type: 'blob',
              compression: lv === 0 ? 'STORE' : 'DEFLATE',
              compressionOptions: { level: Math.max(1, lv) }
            });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = '묶음.zip';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            const before = files.reduce((s, f) => s + f.size, 0);
            say(`${files.length}개 · ${size(before)} → ${size(blob.size)} (${Math.round((1 - blob.size / before) * 100)}% 줄었어요)`, 'ok');
            Toolbox.trackUse?.('make');
          }

          function setMode(next: string): void {
            mode = next;
            files = [];
            opened = null;
            listEl.innerHTML = '';
            fileInput.multiple = mode === 'make';
            fileInput.accept = mode === 'make' ? '' : '.zip,application/zip';
            $<HTMLElement>('#zpDropText').textContent =
              mode === 'make' ? '묶을 파일을 끌어다 놓거나 눌러서 고르세요' : 'ZIP 파일을 끌어다 놓거나 눌러서 고르세요';
            $<HTMLElement>('#zpLevelWrap').style.display = mode === 'make' ? '' : 'none';
            $<HTMLButtonElement>('#zpRun').style.display = mode === 'make' ? '' : 'none';
            say(mode === 'make' ? '넣은 파일을 하나의 ZIP 으로 묶습니다.' : '풀기 전에 안에 무엇이 있는지 먼저 보여줍니다.');
          }

          function accept(list: FileList | File[]): void {
            const arr = Array.from(list);
            if (mode === 'make') {
              files.push(...arr);
              renderMake();
              say(`${files.length}개 · 총 ${size(files.reduce((s, f) => s + f.size, 0))}`, 'ok');
            } else if (arr[0]) {
              void openZip(arr[0]);
            }
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files) accept(fileInput.files);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            if (e.dataTransfer?.files) accept(e.dataTransfer.files);
          });
          container.querySelectorAll('#zpMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#zpMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              setMode((chip as HTMLElement).dataset.mode || 'make');
            };
          });
          level.addEventListener('input', () => {
            const v = parseInt(level.value, 10);
            $<HTMLElement>('#zpLevelVal').textContent = v === 0 ? '압축 안 함' : v <= 3 ? '빠르게' : v <= 6 ? '보통' : '작게';
          });
          $<HTMLButtonElement>('#zpRun').onclick = () => void makeZip();
          $<HTMLButtonElement>('#zpClear').onclick = () => setMode(mode);

          setMode('make');
        }
      }
    ]
  });
})();
