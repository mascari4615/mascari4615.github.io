/**
 * 이미지 → 아스키 아트 (TASK-KL-088)
 *
 * 캔버스로 축소 → 픽셀 밝기를 글자 농도에 매핑. 두 가지가 결과를 좌우한다:
 *  1) 글자는 세로로 길다 — 가로:세로 비를 보정하지 않으면 그림이 위아래로 늘어난다 (CHAR_ASPECT)
 *  2) 밝기 = 단순 평균이 아니라 시감 가중(0.299/0.587/0.114). 평균을 쓰면 초록이 지나치게 밝게 잡힌다
 */
import { acceptPastedFiles } from './shared/paste';

import { t, loadNamespace, locale } from '../../lib/i18n';

(function (): void {
  /** 진한 → 옅은 순. 폭이 넓을수록 계조가 부드럽다. */
  const RAMPS: Record<string, string> = {
    detail: '@%#*+=-:. ',
    block: '█▓▒░ ',
    simple: '#+-. ',
    binary: '#. ',
    braille: '⣿⣷⣯⣟⡿⢿⣻⣽⣾⠿⠟⠏⠆⠄ '
  };
  /** 고정폭 글자 한 칸의 가로/세로 비 — 이 값으로 세로 샘플 수를 줄인다 */
  const CHAR_ASPECT = 0.5;

  Toolbox.register({
    id: 'asciiart',
    title: t('widgets.asciiart.title', undefined, '이미지 → 아스키 아트'),
    category: 'tool',
    desc: t(
      'widgets-desc.asciiart.desc',
      undefined,
      '사진이나 그림을 글자로 그린 아스키 아트로 바꿉니다. 폭·문자 세트·반전 조절'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 12h6M6 15h4M14 9h4M15 12h3M13 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('asciiart.tab', undefined, '아스키 아트'),
        build: function (container: HTMLElement): void {
          void loadNamespace('asciiart').then(function () {
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
          Mdd.linePreset('tool_run', { msg: t('asciiart.mdd') });
          container.innerHTML = `
            <div class="field-group">
              <div id="aaDrop" class="tool-drop">
                <input type="file" id="aaFile" accept="image/*" style="display:none;">
                <div>${esc(t('asciiart.drop'))} <button class="btn btn-ghost" id="aaPick" type="button">${esc(
                  t('asciiart.btn.pick')
                )}</button> ${esc(t('asciiart.drop.paste'))}</div>
                <div class="tool-status" id="aaName">${esc(t('asciiart.name.empty'))}</div>
              </div>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.width'))} <span id="aaWidthVal" class="range-value">${esc(
                    t('asciiart.value.chars', { n: 100 })
                  )}</span></div>
                  <input type="range" id="aaWidth" aria-label="${esc(t('asciiart.label.width'))}" min="20" max="300" step="2" value="100">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.ramp'))}</div>
                  <select id="aaRamp" aria-label="${esc(t('asciiart.label.ramp'))}">
                    <option value="detail">${esc(t('asciiart.ramp.detail'))}</option>
                    <option value="block">${esc(t('asciiart.ramp.block'))}</option>
                    <option value="simple">${esc(t('asciiart.ramp.simple'))}</option>
                    <option value="binary">${esc(t('asciiart.ramp.binary'))}</option>
                    <option value="braille">${esc(t('asciiart.ramp.braille'))}</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.bright'))} <span id="aaBrightVal" class="range-value">0</span></div>
                  <input type="range" id="aaBright" aria-label="${esc(t('asciiart.label.bright'))}" min="-100" max="100" value="0">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('asciiart.label.contrast'))} <span id="aaContrastVal" class="range-value">0</span></div>
                  <input type="range" id="aaContrast" aria-label="${esc(t('asciiart.label.contrast'))}" min="-100" max="100" value="0">
                </div>
              </div>
              <div style="display:flex; gap:14px; margin-top:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="aaInvert" style="width:auto;"> ${esc(t('asciiart.opt.invert'))}
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="aaColor" style="width:auto;"> ${esc(t('asciiart.opt.color'))}
                </label>
              </div>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-md);">
              <button class="btn btn-primary" id="aaCopy">${esc(t('asciiart.btn.copy'))}</button>
              <button class="btn btn-secondary" id="aaTxt">${esc(t('asciiart.btn.txt'))}</button>
              <button class="btn btn-secondary" id="aaPng">${esc(t('asciiart.btn.png'))}</button>
              <button class="btn btn-ghost" id="aaSample">${esc(t('asciiart.btn.sample'))}</button>
            </div>

            <pre id="aaOut" class="aa-out">${esc(t('asciiart.out.empty'))}</pre>
            <div class="tool-status" id="aaStatus">${esc(t('asciiart.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#aaDrop');
          const fileInput = $<HTMLInputElement>('#aaFile');
          const nameEl = $<HTMLElement>('#aaName');
          const out = $<HTMLElement>('#aaOut');
          const status = $<HTMLElement>('#aaStatus');
          const widthInput = $<HTMLInputElement>('#aaWidth');
          let image: HTMLImageElement | null = null;
          let plainText = '';

          /**
           * 재생이 켜지면 이 도구도 **자기 문자 세트로** 한 조각을 그린다 (TASK-KL-131).
           *
           * 재생기가 도는지 여기서는 모른다 — 신고만 해 두면 창구가 알아서 붙였다 뗀다.
           * 이미지를 넣어 쓰는 중이면 `null` 을 답해 빠진다: 남의 작업물을 덮으면 안 된다.
           */
          const idlePlaceholder = out.textContent ?? '';
          const stopDrawing = window.KarmoLabBadApple?.add({
            measure: () => {
              if (image) return null; // 쓰는 중 — 이번 판은 빠진다
              const cols = Math.max(20, Math.min(160, parseInt(widthInput.value, 10) || 100));
              return { cols, rows: Math.max(8, Math.round(cols * CHAR_ASPECT * 0.75)) };
            },
            paint: (p) => {
              const ramp = RAMPS[$<HTMLSelectElement>('#aaRamp').value] || RAMPS.detail;
              const on = ramp[0] ?? '#';
              const off = ramp[ramp.length - 1] ?? ' ';
              const lines: string[] = [];
              for (let y = 0; y < p.rows; y++) {
                let line = '';
                for (let x = 0; x < p.cols; x++) line += p.at(x, y) ? on : off;
                lines.push(line);
              }
              out.textContent = lines.join('\n');
            },
            restore: () => {
              if (!image) out.textContent = idlePlaceholder;
            }
          });
          Toolbox.onDispose?.(() => stopDrawing?.());

          function render(): void {
            if (!image) return;
            const cols = parseInt(widthInput.value, 10);
            const ramp = RAMPS[$<HTMLSelectElement>('#aaRamp').value] || RAMPS.detail;
            const invert = $<HTMLInputElement>('#aaInvert').checked;
            const colorize = $<HTMLInputElement>('#aaColor').checked;
            const bright = parseInt($<HTMLInputElement>('#aaBright').value, 10);
            const contrast = parseInt($<HTMLInputElement>('#aaContrast').value, 10);
            const rows = Math.max(1, Math.round((cols * image.naturalHeight) / image.naturalWidth * CHAR_ASPECT));

            const canvas = document.createElement('canvas');
            canvas.width = cols;
            canvas.height = rows;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;
            ctx.drawImage(image, 0, 0, cols, rows);
            const data = ctx.getImageData(0, 0, cols, rows).data;

            // 대비 계수 — 표준 대비 곡선
            const c = (259 * (contrast + 255)) / (255 * (259 - contrast));
            const lines: string[] = [];
            const colorLines: string[] = [];

            for (let y = 0; y < rows; y++) {
              let line = '';
              let colorLine = '';
              for (let x = 0; x < cols; x++) {
                const i = (y * cols + x) * 4;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3] / 255;
                // 투명한 곳은 공백 (배경으로 남긴다)
                let lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
                lum = c * (lum - 128) + 128 + bright;
                lum = Math.max(0, Math.min(255, lum));
                const norm = invert ? 255 - lum : lum;
                const idx = Math.min(ramp.length - 1, Math.floor((norm / 256) * ramp.length));
                const ch = ramp[idx];
                line += ch;
                if (colorize) {
                  const esc = ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch;
                  colorLine += `<span style="color:rgb(${r},${g},${b})">${esc}</span>`;
                }
              }
              lines.push(line);
              if (colorize) colorLines.push(colorLine);
            }

            plainText = lines.join('\n');
            if (colorize) {
              out.innerHTML = colorLines.join('\n');
            } else {
              out.textContent = plainText;
            }
            status.textContent = t('asciiart.status.done', {
              cols,
              rows,
              chars: plainText.length.toLocaleString(locale())
            });
            status.className = 'tool-status ok';
          }

          function load(src: string, label: string): void {
            const img = new Image();
            img.onload = () => {
              image = img;
              nameEl.textContent = `${label} · ${img.naturalWidth}×${img.naturalHeight}`;
              Toolbox.trackUse?.('convert');
              render();
            };
            img.onerror = () => {
              nameEl.textContent = t('asciiart.err.read');
            };
            img.src = src;
          }

          function loadFile(file: File): void {
            if (!file.type.startsWith('image/')) {
              nameEl.textContent = t('asciiart.err.notImage');
              return;
            }
            const reader = new FileReader();
            reader.onload = () => load(String(reader.result), file.name);
            reader.readAsDataURL(file);
          }

          $<HTMLButtonElement>('#aaPick').onclick = () => fileInput.click();
          fileInput.addEventListener('change', () => {
            const f = fileInput.files && fileInput.files[0];
            if (f) loadFile(f);
          });
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) loadFile(f);
          });
          // 파일을 바로 붙여넣는 것이 잦다
          acceptPastedFiles(container, (files) => { loadFile(files[0]); }, (f) => f.type.startsWith('image/'));
          document.addEventListener('paste', (e) => {
            const page = container.closest('.tool-page');
            if (page && !page.classList.contains('active')) return;
            const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            const f = item?.getAsFile();
            if (f) loadFile(f);
          });

          container.querySelectorAll('input[type="range"], select, input[type="checkbox"]').forEach((el) => {
            el.addEventListener('input', () => {
              $<HTMLElement>('#aaWidthVal').textContent = t('asciiart.value.chars', { n: widthInput.value });
              $<HTMLElement>('#aaBrightVal').textContent = $<HTMLInputElement>('#aaBright').value;
              $<HTMLElement>('#aaContrastVal').textContent = $<HTMLInputElement>('#aaContrast').value;
              render();
            });
            el.addEventListener('change', render);
          });

          $<HTMLButtonElement>('#aaCopy').onclick = async () => {
            if (!plainText) return;
            await Toolbox.copyText?.(plainText, { message: t('asciiart.copy.done') });
          };
          $<HTMLButtonElement>('#aaTxt').onclick = () => {
            if (!plainText) return;
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([plainText], { type: 'text/plain;charset=utf-8' }));
            a.download = 'ascii-art.txt';
            Toolbox.trackUse?.('save-txt');
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          };
          $<HTMLButtonElement>('#aaPng').onclick = () => {
            if (!plainText) return;
            const lines = plainText.split('\n');
            const fontSize = 10;
            const lineHeight = fontSize;
            const charWidth = fontSize * 0.6;
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(lines[0].length * charWidth) + 20;
            canvas.height = lines.length * lineHeight + 20;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const invert = $<HTMLInputElement>('#aaInvert').checked;
            ctx.fillStyle = invert ? '#000' : '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = invert ? '#fff' : '#000';
            ctx.font = `${fontSize}px monospace`;
            ctx.textBaseline = 'top';
            lines.forEach((line, i) => ctx.fillText(line, 10, 10 + i * lineHeight));
            const a = document.createElement('a');
            a.href = canvas.toDataURL('image/png');
            a.download = 'ascii-art.png';
            Toolbox.trackUse?.('save-png');
            a.click();
          };
          $<HTMLButtonElement>('#aaSample').onclick = () => {
            // 외부 요청 0 — 캔버스로 그린 도형을 샘플로 쓴다.
            const c = document.createElement('canvas');
            c.width = 240;
            c.height = 240;
            const g = c.getContext('2d');
            if (!g) return;
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, 240, 240);
            const grad = g.createRadialGradient(100, 90, 10, 120, 120, 130);
            grad.addColorStop(0, '#ffe08a');
            grad.addColorStop(1, '#1a1a2e');
            g.fillStyle = grad;
            g.beginPath();
            g.arc(120, 120, 90, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#12151c';
            g.beginPath();
            g.moveTo(20, 240);
            g.lineTo(110, 110);
            g.lineTo(200, 240);
            g.closePath();
            g.fill();
            load(c.toDataURL('image/png'), t('asciiart.sample.name'));
          };
  }
})();
