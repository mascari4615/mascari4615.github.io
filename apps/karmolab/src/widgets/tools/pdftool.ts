/**
 * PDF 편집 (TASK-KL-088)
 *
 * PDF 를 합치거나 몇 페이지만 빼내려고 인터넷에 올리는 순간, 그 파일은 내 손을 떠난다 —
 * 계약서·이력서처럼 올리면 안 되는 것이 대부분이다.
 * 여기서는 파일이 브라우저 밖으로 나가지 않는다. 무거운 라이브러리는 이 탭을 처음 열 때만 받는다.
 */
import { acceptPastedFiles } from './shared/paste';
import { t, loadNamespace } from '../../lib/i18n';
import { parsePages } from '../../core/pdftool';

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
    if (/^(?:\d+(?:-\d+)?)(?:\s*,\s*\d+(?:-\d+)?)*$/.test(spec.trim())) {
      return parsePages(spec).filter((page) => page <= total).map((page) => page - 1);
    }
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

  /**
   * 내려받게 하고, **같은 것을 옆 도구에도 놓아둔다** (TASK-KL-133).
   *
   * 예전에는 여기서 끝이었다 — 이어서 용량을 줄이려면 받은 파일을 찾아 다른 도구를 열고
   * 다시 집어넣어야 했다. 방금 만든 것은 이미 이 화면 안에 있으므로 그냥 넘긴다.
   * `after` 는 「이어서」 줄을 붙일 자리다. 받을 도구가 하나도 없으면 그 줄은 안 생긴다.
   */
  function download(bytes: Uint8Array, name: string, after?: HTMLElement | null): void {
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    if (after) Toolbox.offerNext?.(after, { blob, name, from: 'pdftool' });
  }

  Toolbox.register({
    id: 'pdftool',
    title: t('widgets.pdftool.title', undefined, 'PDF 편집'),
    category: 'tool',
    desc: t(
      'widgets-desc.pdftool.desc',
      undefined,
      'PDF 를 합치고 페이지를 빼내고 돌립니다. 파일이 브라우저를 벗어나지 않습니다'
    ),
    layout: 'wide',
    icon: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M14 3v5h5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/><path d="M8 14h8M8 17h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('pdftool.tab', undefined, 'PDF'),
        build: function (container: HTMLElement): void {
          void loadNamespace('pdftool').then(function () {
            draw(container);
          });
        }
      }
    ]
  });

  /** 그리기는 **말 묶음이 온 뒤**에. */
  function draw(container: HTMLElement): void {
          const esc = (v: string): string =>
            v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          container.innerHTML = `
            <div class="tool-drop" id="pdDrop">
              <input type="file" id="pdFile" accept="application/pdf" multiple hidden>
              ${esc(t('pdftool.drop'))}
            </div>

            <div class="tool-list" id="pdFiles" style="margin-top:var(--space-lg);"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-chips" id="pdMode">
                <button type="button" class="tool-chip active" data-mode="merge">${esc(t('pdftool.mode.merge'))}</button>
                <button type="button" class="tool-chip" data-mode="extract">${esc(t('pdftool.mode.extract'))}</button>
                <button type="button" class="tool-chip" data-mode="remove">${esc(t('pdftool.mode.remove'))}</button>
                <button type="button" class="tool-chip" data-mode="rotate">${esc(t('pdftool.mode.rotate'))}</button>
              </div>
            </div>

            <div class="field-group" id="pdRangeWrap" style="display:none;">
              <div class="tool-sublabel">${esc(t('pdftool.label.range'))}</div>
              <input type="text" id="pdRange" placeholder="${esc(t('pdftool.ph.range'))}" spellcheck="false">
            </div>

            <div class="field-group" id="pdAngleWrap" style="display:none;">
              <div class="tool-sublabel">${esc(t('pdftool.label.angle'))}</div>
              <select id="pdAngle" aria-label="${esc(t('pdftool.label.angle'))}">
                <option value="90">${esc(t('pdftool.angle.90'))}</option>
                <option value="180">${esc(t('pdftool.angle.180'))}</option>
                <option value="270">${esc(t('pdftool.angle.270'))}</option>
              </select>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="pdRun">${esc(t('pdftool.btn.run'))}</button>
              <button class="btn btn-ghost" id="pdClear">${esc(t('pdftool.btn.clear'))}</button>
            </div>

            <div class="tool-status" id="pdStatus">${esc(t('pdftool.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#pdDrop');
          const fileInput = $<HTMLInputElement>('#pdFile');
          const filesEl = $<HTMLElement>('#pdFiles');
          const status = $<HTMLElement>('#pdStatus');
          let files: Array<{ file: File; pages: number }> = [];
          let mode = 'merge';
          let lib: PDFLib | null = null;

          function say(msg: string, kind = ''): void {
            status.textContent = msg;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          }

          /** 무거운 라이브러리는 실제로 쓸 때 받는다 — 탭만 열어 본 사람에게 500KB 를 물리지 않는다. */
          async function loadLib(): Promise<PDFLib> {
            if (lib) return lib;
            say(t('pdftool.say.loadingLib'));
            await Toolbox.ensureScript?.('vendor/pdf-lib.min');
            lib = (window as unknown as { PDFLib: PDFLib }).PDFLib;
            if (!lib) throw new Error(t('pdftool.err.lib'));
            return lib;
          }

          function renderFiles(): void {
            filesEl.innerHTML = files
              .map(
                (f, i) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${esc(
                    t('pdftool.list.nth', { n: i + 1 })
                  )}</span><span class="tool-list-val">${esc(f.file.name)} <span class="tool-list-dim">${esc(
                    t('pdftool.list.meta', {
                      pages: f.pages,
                      mb: (f.file.size / 1024 / 1024).toFixed(2)
                    })
                  )}</span></span></div>`
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
                say(t('pdftool.err.openOne', { name: file.name }), 'error');
              }
            }
            renderFiles();
            if (files.length)
              say(
                t('pdftool.say.loaded', {
                  files: files.length,
                  pages: files.reduce((a, f) => a + f.pages, 0)
                }),
                'ok'
              );
          }

          async function run(): Promise<void> {
            if (!files.length) {
              say(t('pdftool.err.noFile'), 'error');
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
                download(await outDoc.save(), t('pdftool.file.merged'), status);
                say(t('pdftool.say.merged', { n: files.length }), 'ok');
              } else {
                const src = await L.PDFDocument.load(await files[0].file.arrayBuffer(), { ignoreEncryption: true });
                const total = src.getPageCount();
                const picked = rangeSpec.trim() ? parseRange(rangeSpec, total) : src.getPages().map((_, i) => i);
                if (!picked.length) {
                  say(t('pdftool.err.noPages'), 'error');
                  return;
                }
                if (mode === 'extract') {
                  const outDoc = await L.PDFDocument.create();
                  const copied = await outDoc.copyPages(src, picked);
                  copied.forEach((p) => outDoc.addPage(p));
                  download(await outDoc.save(), t('pdftool.file.extracted'), status);
                  say(t('pdftool.say.extracted', { n: picked.length }), 'ok');
                } else if (mode === 'remove') {
                  const keep = Array.from({ length: total }, (_, i) => i).filter((i) => !picked.includes(i));
                  if (!keep.length) {
                    say(t('pdftool.err.removeAll'), 'error');
                    return;
                  }
                  const outDoc = await L.PDFDocument.create();
                  const copied = await outDoc.copyPages(src, keep);
                  copied.forEach((p) => outDoc.addPage(p));
                  download(await outDoc.save(), t('pdftool.file.removed'), status);
                  say(t('pdftool.say.removed', { n: picked.length, keep: keep.length }), 'ok');
                } else {
                  const angle = parseInt($<HTMLSelectElement>('#pdAngle').value, 10);
                  const pages = src.getPages();
                  picked.forEach((i) => pages[i].setRotation(L.degrees((pages[i].getRotation().angle + angle) % 360)));
                  download(await src.save(), t('pdftool.file.rotated'), status);
                  say(t('pdftool.say.rotated', { n: picked.length, angle }), 'ok');
                }
              }
              Toolbox.trackUse?.(mode);
            } catch (e) {
              say(t('pdftool.err.run', { msg: (e as Error).message }), 'error');
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
              say(mode === 'merge' ? t('pdftool.say.mergeHint') : t('pdftool.say.firstOnly'));
            };
          });
          $<HTMLButtonElement>('#pdRun').onclick = () => void run();
          $<HTMLButtonElement>('#pdClear').onclick = () => {
            files = [];
            renderFiles();
            say(t('pdftool.say.cleared'));
          };
  }
})();
