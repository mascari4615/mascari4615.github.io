/**
 * 이미지 → 아스키 아트 (TASK-KL-088)
 *
 * 캔버스로 축소 → 픽셀 밝기를 글자 농도에 매핑. 두 가지가 결과를 좌우한다:
 *  1) 글자는 세로로 길다 — 가로:세로 비를 보정하지 않으면 그림이 위아래로 늘어난다 (CHAR_ASPECT)
 *  2) 밝기 = 단순 평균이 아니라 시감 가중(0.299/0.587/0.114). 평균을 쓰면 초록이 지나치게 밝게 잡힌다
 */
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
    title: '이미지 → 아스키 아트',
    category: 'tool',
    desc: '사진이나 그림을 글자로 그린 아스키 아트로 바꿉니다. 폭·문자 세트·반전 조절',
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M6 9h3M6 12h6M6 15h4M14 9h4M15 12h3M13 15h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: '아스키 아트',
        build: function (container: HTMLElement): void {
          Mdd.linePreset('tool_run', { msg: '그림을 글자로 그려볼게요!' });
          container.innerHTML = `
            <div class="field-group">
              <div id="aaDrop" class="tool-drop">
                <input type="file" id="aaFile" accept="image/*" style="display:none;">
                <div>이미지를 끌어다 놓거나 <button class="btn btn-ghost" id="aaPick" type="button">파일 선택</button> · 붙여넣기(Ctrl+V)도 됩니다</div>
                <div class="tool-status" id="aaName">아직 선택된 이미지가 없어요.</div>
              </div>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">가로 글자 수 <span id="aaWidthVal" class="range-value">100자</span></div>
                  <input type="range" id="aaWidth" min="20" max="300" step="2" value="100">
                </div>
                <div>
                  <div class="tool-sublabel">문자 세트</div>
                  <select id="aaRamp">
                    <option value="detail">촘촘하게 (@%#*+=-:.)</option>
                    <option value="block">블록 (█▓▒░)</option>
                    <option value="simple">단순 (#+-.)</option>
                    <option value="binary">두 단계 (#.)</option>
                    <option value="braille">점자 느낌</option>
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">밝기 <span id="aaBrightVal" class="range-value">0</span></div>
                  <input type="range" id="aaBright" min="-100" max="100" value="0">
                </div>
                <div>
                  <div class="tool-sublabel">대비 <span id="aaContrastVal" class="range-value">0</span></div>
                  <input type="range" id="aaContrast" min="-100" max="100" value="0">
                </div>
              </div>
              <div style="display:flex; gap:14px; margin-top:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="aaInvert" style="width:auto;"> 밝기 반전 (어두운 배경용)
                </label>
                <label style="display:flex; align-items:center; gap:6px; font-size:var(--font-size-xs); color:var(--text-secondary);">
                  <input type="checkbox" id="aaColor" style="width:auto;"> 색 입히기 (화면 미리보기 전용)
                </label>
              </div>
            </div>

            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:var(--space-md);">
              <button class="btn btn-primary" id="aaCopy">텍스트 복사</button>
              <button class="btn btn-secondary" id="aaTxt">.txt 저장</button>
              <button class="btn btn-secondary" id="aaPng">PNG 저장</button>
              <button class="btn btn-ghost" id="aaSample">샘플 이미지</button>
            </div>

            <pre id="aaOut" class="aa-out">이미지를 넣으면 여기에 그려집니다.</pre>
            <div class="tool-status" id="aaStatus">이미지는 브라우저 안에서만 처리되며 서버로 올라가지 않습니다.</div>
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
            status.textContent = `${cols}×${rows}자 · ${plainText.length.toLocaleString('ko-KR')}글자 · 이미지는 브라우저 안에서만 처리됩니다.`;
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
              nameEl.textContent = '이미지를 읽지 못했어요.';
            };
            img.src = src;
          }

          function loadFile(file: File): void {
            if (!file.type.startsWith('image/')) {
              nameEl.textContent = '이미지 파일만 넣을 수 있어요.';
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
          document.addEventListener('paste', (e) => {
            const page = container.closest('.tool-page');
            if (page && !page.classList.contains('active')) return;
            const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
            const f = item?.getAsFile();
            if (f) loadFile(f);
          });

          container.querySelectorAll('input[type="range"], select, input[type="checkbox"]').forEach((el) => {
            el.addEventListener('input', () => {
              $<HTMLElement>('#aaWidthVal').textContent = widthInput.value + '자';
              $<HTMLElement>('#aaBrightVal').textContent = $<HTMLInputElement>('#aaBright').value;
              $<HTMLElement>('#aaContrastVal').textContent = $<HTMLInputElement>('#aaContrast').value;
              render();
            });
            el.addEventListener('change', render);
          });

          $<HTMLButtonElement>('#aaCopy').onclick = async () => {
            if (!plainText) return;
            await Toolbox.copyText?.(plainText, { message: '아스키 아트를 복사했어요' });
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
            load(c.toDataURL('image/png'), '샘플 이미지');
          };
        }
      }
    ]
  });
})();
