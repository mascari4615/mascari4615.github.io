/**
 * PDF 편집 (TASK-KL-088)
 *
 * PDF 를 합치거나 몇 페이지만 빼내려고 인터넷에 올리는 순간, 그 파일은 내 손을 떠난다 —
 * 계약서·이력서처럼 올리면 안 되는 것이 대부분이다.
 * 여기서는 파일이 브라우저 밖으로 나가지 않는다. 무거운 라이브러리는 이 탭을 처음 열 때만 받는다.
 */
import { acceptPastedFiles } from './shared/paste';

(function (): void {
  interface PDFLib {
    PDFDocument: {
      create: () => Promise<PDFDoc>;
      load: (bytes: ArrayBuffer, opts?: { ignoreEncryption?: boolean }) => Promise<PDFDoc>;
    };
    degrees: (n: number) => unknown;
  }
  interface PDFDoc {
    getPageCount: () => number;
    getPages: () => Array<{ setRotation: (d: unknown) => void; getRotation: () => { angle: number } }>;
    copyPages: (src: PDFDoc, idx: number[]) => Promise<unknown[]>;
    addPage: (p: unknown) => void;
    removePage: (i: number) => void;
    save: () => Promise<Uint8Array>;
  }

  /** "1-3,5,8-" → [0,1,2,4,7,...] (1부터 세는 사람 표기를 0부터 세는 색인으로) */
  function parseRange(spec: string, total: number): number[] {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const chunk of spec.split(',')) {
      const s = chunk.trim();
      if (!s) continue;
      const m = s.match(/^(\d+)?\s*-\s*(\d+)?$/);
      if (m) {
        const from = m[1] ? parseInt(m[1], 10) : 1;
        const to = m[2] ? parseInt(m[2], 10) : total;
        for (let i = from; i <= Math.min(to, total); i++) if (i >= 1 && !seen.has(i)) (seen.add(i), out.push(i - 1));
      } else if (/^\d+$/.test(s)) {
        const n = parseInt(s, 10);
        if (n >= 1 && n <= total && !seen.has(n)) (seen.add(n), out.push(n - 1));
      }
    }
    return out;
  }

  function download(bytes: Uint8Array, name: string): void {
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  Toolbox.register({
    id: 'pdftool',
    title: 'PDF 편집',
    category: 'tool',
    desc: 'PDF 를 합치고 페이지를 빼내고 돌립니다. 파일이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M8 14h8M8 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: 'PDF',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="pdDrop">
              <input type="file" id="pdFile" accept="application/pdf" multiple hidden>
              PDF 를 끌어다 놓거나 눌러서 고르세요 (여러 개 가능)
            </div>

            <div class="tool-list" id="pdFiles" style="margin-top:var(--space-lg);"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-chips" id="pdMode">
                <button type="button" class="tool-chip active" data-mode="merge">합치기</button>
                <button type="button" class="tool-chip" data-mode="extract">페이지 빼내기</button>
                <button type="button" class="tool-chip" data-mode="remove">페이지 지우기</button>
                <button type="button" class="tool-chip" data-mode="rotate">돌리기</button>
              </div>
            </div>

            <div class="field-group" id="pdRangeWrap" style="display:none;">
              <div class="tool-sublabel">페이지 — 1-3,5,8- 처럼 적습니다 (비우면 전체)</div>
              <input type="text" id="pdRange" placeholder="1-3,5" spellcheck="false">
            </div>

            <div class="field-group" id="pdAngleWrap" style="display:none;">
              <div class="tool-sublabel">돌릴 각도</div>
              <select id="pdAngle" aria-label="돌릴 각도">
                <option value="90">오른쪽 90°</option>
                <option value="180">180°</option>
                <option value="270">왼쪽 90°</option>
              </select>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="pdRun">실행하고 내려받기</button>
              <button class="btn btn-ghost" id="pdClear">비우기</button>
            </div>

            <div class="tool-status" id="pdStatus">파일은 브라우저 안에서만 다뤄지고 어디로도 올라가지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#pdDrop');
          const fileInput = $<HTMLInputElement>('#pdFile');
          const filesEl = $<HTMLElement>('#pdFiles');
          const status = $<HTMLElement>('#pdStatus');
          let files: Array<{ file: File; pages: number }> = [];
          let mode = 'merge';
          let lib: PDFLib | null = null;

          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          function say(msg: string, kind = ''): void {
            status.textContent = msg;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          }

          /** 무거운 라이브러리는 실제로 쓸 때 받는다 — 탭만 열어 본 사람에게 500KB 를 물리지 않는다. */
          async function loadLib(): Promise<PDFLib> {
            if (lib) return lib;
            say('PDF 처리기를 불러오는 중…');
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            lib = (window as unknown as { PDFLib: PDFLib }).PDFLib;
            if (!lib) throw new Error('PDF 처리기를 불러오지 못했습니다');
            return lib;
          }

          function renderFiles(): void {
            filesEl.innerHTML = files
              .map(
                (f, i) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${i + 1}번째</span><span class="tool-list-val">${esc(f.file.name)} <span class="tool-list-dim">${f.pages}쪽 · ${(f.file.size / 1024 / 1024).toFixed(2)}MB</span></span></div>`
              )
              .join('');
          }

          async function addFiles(list: FileList | File[]): Promise<void> {
            const L = await loadLib();
            for (const file of Array.from(list)) {
              if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) continue;
              try {
                const doc = await L.PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
                files.push({ file, pages: doc.getPageCount() });
              } catch {
                say(`${file.name} 을 열지 못했어요 (암호가 걸려 있을 수 있습니다).`, 'error');
              }
            }
            renderFiles();
            if (files.length) say(`${files.length}개 파일 · 총 ${files.reduce((a, f) => a + f.pages, 0)}쪽`, 'ok');
          }

          async function run(): Promise<void> {
            if (!files.length) {
              say('PDF 를 먼저 넣어 주세요.', 'error');
              return;
            }
            const L = await loadLib();
            const rangeSpec = $<HTMLInputElement>('#pdRange').value;
            try {
              if (mode === 'merge') {
                const outDoc = await L.PDFDocument.create();
                for (const f of files) {
                  const src = await L.PDFDocument.load(await f.file.arrayBuffer(), { ignoreEncryption: true });
                  const idx = src.getPages().map((_, i) => i);
                  const copied = await outDoc.copyPages(src, idx);
                  copied.forEach((p) => outDoc.addPage(p));
                }
                download(await outDoc.save(), '합친-PDF.pdf');
                say(`${files.length}개 파일을 합쳐 내려받았어요.`, 'ok');
              } else {
                const src = await L.PDFDocument.load(await files[0].file.arrayBuffer(), { ignoreEncryption: true });
                const total = src.getPageCount();
                const picked = rangeSpec.trim() ? parseRange(rangeSpec, total) : src.getPages().map((_, i) => i);
                if (!picked.length) {
                  say('고른 페이지가 없어요. 1-3,5 처럼 적어 주세요.', 'error');
                  return;
                }
                if (mode === 'extract') {
                  const outDoc = await L.PDFDocument.create();
                  const copied = await outDoc.copyPages(src, picked);
                  copied.forEach((p) => outDoc.addPage(p));
                  download(await outDoc.save(), '빼낸-페이지.pdf');
                  say(`${picked.length}쪽을 빼내 내려받았어요.`, 'ok');
                } else if (mode === 'remove') {
                  const keep = Array.from({ length: total }, (_, i) => i).filter((i) => !picked.includes(i));
                  if (!keep.length) {
                    say('전부 지우면 남는 게 없어요.', 'error');
                    return;
                  }
                  const outDoc = await L.PDFDocument.create();
                  const copied = await outDoc.copyPages(src, keep);
                  copied.forEach((p) => outDoc.addPage(p));
                  download(await outDoc.save(), '페이지-지운-PDF.pdf');
                  say(`${picked.length}쪽을 지우고 ${keep.length}쪽을 남겼어요.`, 'ok');
                } else {
                  const angle = parseInt($<HTMLSelectElement>('#pdAngle').value, 10);
                  const pages = src.getPages();
                  picked.forEach((i) => pages[i].setRotation(L.degrees((pages[i].getRotation().angle + angle) % 360)));
                  download(await src.save(), '돌린-PDF.pdf');
                  say(`${picked.length}쪽을 ${angle}° 돌려 내려받았어요.`, 'ok');
                }
              }
              Toolbox.trackUse?.(mode);
            } catch (e) {
              say('처리 중 문제가 생겼어요: ' + (e as Error).message, 'error');
            }
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files) void addFiles(fileInput.files);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            if (e.dataTransfer?.files) void addFiles(e.dataTransfer.files);
          });
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { void addFiles(files); }, (f) => f.type === 'application/pdf');

          container.querySelectorAll('#pdMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#pdMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              mode = (chip as HTMLElement).dataset.mode || 'merge';
              $<HTMLElement>('#pdRangeWrap').style.display = mode === 'merge' ? 'none' : '';
              $<HTMLElement>('#pdAngleWrap').style.display = mode === 'rotate' ? '' : 'none';
              say(mode === 'merge' ? '넣은 순서대로 합칩니다.' : '첫 번째 파일을 대상으로 합니다.');
            };
          });
          $<HTMLButtonElement>('#pdRun').onclick = () => void run();
          $<HTMLButtonElement>('#pdClear').onclick = () => {
            files = [];
            renderFiles();
            say('비웠어요.');
          };
        }
      }
    ]
  });
})();
