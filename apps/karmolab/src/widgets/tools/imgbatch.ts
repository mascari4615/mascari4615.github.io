/**
 * 이미지 일괄 변환 (TASK-KL-088)
 *
 * 사진 스무 장을 한 장씩 줄이고 바꾸는 건 도구의 문제가 아니라 **반복의 문제**다.
 * 그래서 여러 장을 한 번에 받아 같은 규칙으로 처리하고, ZIP 하나로 내려준다.
 * 원본보다 커지는 경우가 있어(작은 PNG 를 JPG 로 바꿀 때) 전후 용량을 나란히 보여준다.
 */
(function (): void {
  interface Result {
    name: string;
    blob: Blob;
    before: number;
    w: number;
    h: number;
  }

  const size = (n: number): string =>
    n >= 1048576 ? `${(n / 1048576).toFixed(2)}MB` : n >= 1024 ? `${(n / 1024).toFixed(1)}KB` : `${n}B`;

  Toolbox.register({
    id: 'imgbatch',
    title: '이미지 일괄 변환',
    category: 'tool',
    desc: '사진 여러 장의 크기와 형식을 한 번에 바꿔 ZIP 으로 받습니다',
    layout: 'wide',
    icon: '<rect x="3" y="6" width="13" height="11" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 14l3.5-3.5 2.5 2.5 3-3 4 4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/><path d="M7 3h11a2 2 0 0 1 2 2v11" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.6"/>',
    tabs: [
      {
        id: 'app',
        label: '일괄 변환',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="ibDrop">
              <input type="file" id="ibFile" accept="image/*" multiple hidden>
              사진을 끌어다 놓거나 눌러서 고르세요 (여러 장)
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">형식</div>
                  <select id="ibFormat">
                    <option value="image/jpeg">JPG</option>
                    <option value="image/png">PNG</option>
                    <option value="image/webp">WebP — 같은 화질에 가장 작음</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">긴 변 최대 <span id="ibMaxVal" class="range-value">1600px</span></div>
                  <input type="range" id="ibMax" min="200" max="4000" step="100" value="1600">
                </div>
              </div>
              <div style="margin-top:10px;">
                <div class="tool-sublabel">화질 <span id="ibQualityVal" class="range-value">85</span></div>
                <input type="range" id="ibQuality" min="40" max="100" value="85">
              </div>
            </div>

            <div style="display:flex; gap:6px; margin-bottom:var(--space-lg); flex-wrap:wrap;">
              <button class="btn btn-primary" id="ibRun">한 번에 바꾸기</button>
              <button class="btn btn-ghost" id="ibZip">ZIP 으로 받기</button>
              <button class="btn btn-ghost" id="ibClear">비우기</button>
            </div>

            <div class="tool-list" id="ibList"></div>
            <div class="tool-status" id="ibStatus">사진은 브라우저 안에서만 다뤄집니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#ibDrop');
          const fileInput = $<HTMLInputElement>('#ibFile');
          const listEl = $<HTMLElement>('#ibList');
          const status = $<HTMLElement>('#ibStatus');
          const maxEl = $<HTMLInputElement>('#ibMax');
          const qualityEl = $<HTMLInputElement>('#ibQuality');
          let files: File[] = [];
          let results: Result[] = [];

          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          function render(): void {
            if (results.length) {
              listEl.innerHTML = results
                .map(
                  (r) =>
                    `<div class="tool-list-row cc-copy-row" data-name="${esc(r.name)}"><span class="tool-list-key">${size(r.blob.size)}</span><span class="tool-list-val">${esc(r.name)} <span class="tool-list-dim">${r.w}×${r.h} · ${size(r.before)}에서 ${r.blob.size < r.before ? `${Math.round((1 - r.blob.size / r.before) * 100)}% 줄어듦` : '커짐'} · 눌러서 받기</span></span></div>`
                )
                .join('');
              listEl.querySelectorAll('[data-name]').forEach((el, i) => {
                (el as HTMLElement).onclick = () => {
                  const r = results[i];
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(r.blob);
                  a.download = r.name;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
                };
              });
              return;
            }
            listEl.innerHTML = files
              .map((f) => `<div class="tool-list-row"><span class="tool-list-key">${size(f.size)}</span><span class="tool-list-val">${esc(f.name)}</span></div>`)
              .join('');
          }

          function convert(file: File): Promise<Result> {
            return new Promise((resolve, reject) => {
              const url = URL.createObjectURL(file);
              const img = new Image();
              img.onload = () => {
                const max = parseInt(maxEl.value, 10);
                const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
                const w = Math.max(1, Math.round(img.naturalWidth * scale));
                const h = Math.max(1, Math.round(img.naturalHeight * scale));
                const cv = document.createElement('canvas');
                cv.width = w;
                cv.height = h;
                const ctx = cv.getContext('2d');
                if (!ctx) return reject(new Error('canvas 없음'));
                const format = $<HTMLSelectElement>('#ibFormat').value;
                if (format !== 'image/png') {
                  // 투명한 부분이 검게 나오는 걸 막는다
                  ctx.fillStyle = '#fff';
                  ctx.fillRect(0, 0, w, h);
                }
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);
                cv.toBlob(
                  (blob) => {
                    URL.revokeObjectURL(url);
                    if (!blob) return reject(new Error('변환 실패'));
                    const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
                    resolve({ name: file.name.replace(/\.[^.]+$/, '') + '.' + ext, blob, before: file.size, w, h });
                  },
                  format,
                  parseInt(qualityEl.value, 10) / 100
                );
              };
              img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('이미지를 열지 못함'));
              };
              img.src = url;
            });
          }

          async function run(): Promise<void> {
            if (!files.length) {
              say('사진을 먼저 넣어 주세요.', 'error');
              return;
            }
            results = [];
            say(`${files.length}장을 바꾸는 중…`);
            for (const f of files) {
              try {
                results.push(await convert(f));
              } catch {
                say(`${f.name} 을 바꾸지 못했어요.`, 'error');
              }
            }
            render();
            const before = files.reduce((a, f) => a + f.size, 0);
            const after = results.reduce((a, r) => a + r.blob.size, 0);
            // 작은 PNG 를 JPG 로 바꾸면 오히려 커진다 — 「-559% 줄었어요」 같은 말이 나오면 안 된다
            const pct = Math.round(Math.abs(1 - after / before) * 100);
            const verdict = after < before ? `${pct}% 줄었어요` : after > before ? `${pct}% 커졌어요` : '그대로예요';
            say(`${results.length}장 · ${size(before)} → ${size(after)} (${verdict}). 줄을 누르면 그 장만 받습니다.`, 'ok');
            Toolbox.trackUse?.('convert');
          }

          async function zip(): Promise<void> {
            if (!results.length) {
              say('먼저 바꾸기를 눌러 주세요.', 'error');
              return;
            }
            await Toolbox.ensureScript?.('vendor/jszip.min');
            const Z = (window as unknown as { JSZip: new () => { file: (n: string, b: Blob) => void; generateAsync: (o: { type: string }) => Promise<Blob> } }).JSZip;
            const z = new Z();
            results.forEach((r) => z.file(r.name, r.blob));
            const blob = await z.generateAsync({ type: 'blob' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = '바꾼-사진.zip';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${results.length}장을 ZIP 으로 내려받았어요.`, 'ok');
            Toolbox.trackUse?.('zip');
          }

          function add(list: FileList | File[]): void {
            results = [];
            for (const f of Array.from(list)) if (f.type.startsWith('image/')) files.push(f);
            render();
            say(`${files.length}장 · 총 ${size(files.reduce((a, f) => a + f.size, 0))}`, 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files) add(fileInput.files);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            if (e.dataTransfer?.files) add(e.dataTransfer.files);
          });
          maxEl.addEventListener('input', () => {
            $<HTMLElement>('#ibMaxVal').textContent = maxEl.value + 'px';
          });
          qualityEl.addEventListener('input', () => {
            $<HTMLElement>('#ibQualityVal').textContent = qualityEl.value;
          });
          $<HTMLButtonElement>('#ibRun').onclick = () => void run();
          $<HTMLButtonElement>('#ibZip').onclick = () => void zip();
          $<HTMLButtonElement>('#ibClear').onclick = () => {
            files = [];
            results = [];
            render();
            say('비웠어요.');
          };
        }
      }
    ]
  });
})();
