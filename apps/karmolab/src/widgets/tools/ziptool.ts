/**
 * ZIP 만들기·풀기 (TASK-KL-088)
 *
 * 파일 몇 개를 묶어 보내거나 받은 압축을 열어 보는 일은, 압축 프로그램을 깔 수 없는
 * 회사 컴퓨터나 남의 기기에서 특히 막힌다. 브라우저만으로 되는 자리를 둔다.
 * 안을 훑어보는 것만으로 끝날 때가 많으므로 **풀기 전에 목록을 먼저 보여준다.**
 */
import { acceptPastedFiles } from './shared/paste';
import { t, loadNamespace } from '../../lib/i18n';
import { spec as zipCoreSpec } from '../../core/ziptool';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
    id: zipCoreSpec.id,
    title: t('widgets.ziptool.title', undefined, "ZIP 만들기·풀기"),
    category: 'tool',
    desc: t('widgets-desc.ziptool.desc', undefined, "파일을 ZIP 으로 묶고, 받은 ZIP 의 목록을 보고 풀어 냅니다"),
    layout: 'wide',
    icon: '<path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M11 3v2h2V3M11 7v2h2V7M11 11v2h2v-2" stroke="currentColor" stroke-width="1.5"/><rect x="10.5" y="15" width="3" height="4" rx="0.6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    tabs: [
      {
        id: 'app',
        label: 'ZIP',
        build: function (container: HTMLElement): void {
          void loadNamespace('ziptool').then(function () {

          container.innerHTML = `
            <div class="field-group">
              <div class="tool-chips" id="zpMode">
                <button type="button" class="tool-chip active" data-mode="make">${esc(t('ziptool.mode.make'))}</button>
                <button type="button" class="tool-chip" data-mode="open">${esc(t('ziptool.mode.open'))}</button>
              </div>
            </div>

            <div class="tool-drop" id="zpDrop">
              <input type="file" id="zpFile" multiple hidden>
              <span id="zpDropText">${esc(t('ziptool.drop.make'))}</span>
            </div>

            <div class="field-group" id="zpLevelWrap" style="margin-top:var(--space-lg);">
              <div class="tool-sublabel">${esc(t('ziptool.label.level'))} <span id="zpLevelVal" class="range-value">${esc(t('ziptool.level.mid'))}</span></div>
              <input type="range" id="zpLevel" aria-label="${esc(t('ziptool.label.level'))}" min="0" max="9" value="6">
            </div>

            <div class="tool-list" id="zpList"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="zpRun">${esc(t('ziptool.btn.run'))}</button>
              <button class="btn btn-ghost" id="zpClear">${esc(t('ziptool.btn.clear'))}</button>
            </div>
            <div class="tool-status" id="zpStatus">${esc(t('ziptool.status.idle'))}</div>
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

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          async function loadLib(): Promise<new () => ZipInstance> {
            if (JSZipCtor) return JSZipCtor;
            say(t('ziptool.say.loadingLib'));
            await Toolbox.ensureScript?.('vendor/jszip.min');
            const g = (window as unknown as { JSZip: new () => ZipInstance }).JSZip;
            if (!g) throw new Error(t('ziptool.err.lib'));
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
              say(t('ziptool.err.open'), 'error');
              return;
            }
            const entries = Object.values(opened.files).filter((e) => !e.dir);
            listEl.innerHTML = entries
              .map(
                (e, i) =>
                  `<div class="tool-list-row cc-copy-row" data-i="${i}"><span class="tool-list-key">${size(e._data?.uncompressedSize || 0)}</span><span class="tool-list-val">${esc(e.name)} <span class="tool-list-dim">${esc(t('ziptool.row.download'))}</span></span></div>`
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
            say(t('ziptool.say.opened', { n: entries.length }), 'ok');
            Toolbox.trackUse?.('open');
          }

          async function makeZip(): Promise<void> {
            if (!files.length) {
              say(t('ziptool.err.noFile'), 'error');
              return;
            }
            const Z = await loadLib();
            say(t('ziptool.say.zipping'));
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
            a.download = t('ziptool.file.name');
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            const before = files.reduce((s, f) => s + f.size, 0);
            // 사진·영상처럼 이미 눌린 파일은 묶으면 오히려 커진다. 그때 「-3% 줄었어요」라고 하면
            // 숫자도 말도 틀린다 — 늘었으면 늘었다고 적는다.
            const pct = Math.round(Math.abs(1 - blob.size / before) * 100);
            const verdict =
              blob.size < before
                ? t('ziptool.verdict.smaller', { pct })
                : blob.size > before
                  ? t('ziptool.verdict.bigger', { pct })
                  : t('ziptool.verdict.same');
            say(
              t('ziptool.say.made', {
                n: files.length,
                before: size(before),
                after: size(blob.size),
                verdict
              }),
              'ok'
            );
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
              mode === 'make' ? t('ziptool.drop.make') : t('ziptool.drop.open');
            $<HTMLElement>('#zpLevelWrap').style.display = mode === 'make' ? '' : 'none';
            $<HTMLButtonElement>('#zpRun').style.display = mode === 'make' ? '' : 'none';
            say(mode === 'make' ? t('ziptool.say.makeHint') : t('ziptool.say.openHint'));
          }

          function accept(list: FileList | File[]): void {
            const arr = Array.from(list);
            if (mode === 'make') {
              files.push(...arr);
              renderMake();
              say(
                t('ziptool.say.picked', {
                  n: files.length,
                  total: size(files.reduce((s, f) => s + f.size, 0))
                }),
                'ok'
              );
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
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { accept(files); }, () => true);
          container.querySelectorAll('#zpMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#zpMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              setMode((chip as HTMLElement).dataset.mode || 'make');
            };
          });
          level.addEventListener('input', () => {
            const v = parseInt(level.value, 10);
            $<HTMLElement>('#zpLevelVal').textContent = v === 0 ? t('ziptool.level.none') : v <= 3 ? t('ziptool.level.fast') : v <= 6 ? t('ziptool.level.mid') : t('ziptool.level.small');
          });
          $<HTMLButtonElement>('#zpRun').onclick = () => void makeZip();
          $<HTMLButtonElement>('#zpClear').onclick = () => setMode(mode);

          setMode('make');
                  });
        }
      }
    ]
  });
})();
