/**
 * 이미지 색상 팔레트 추출 (TASK-KL-088)
 *
 * 픽셀을 그냥 세면 거의 같은 색이 상위를 전부 차지해 팔레트가 되지 않는다.
 * 그래서 **median cut** 으로 색 공간을 쪼갠다 — 색이 몰려 있는 축을 잘라 나가므로,
 * 넓은 배경 하나가 결과를 독식하지 않고 사진 안의 서로 다른 색이 골고루 남는다.
 * 이미지는 브라우저 안에서만 읽고 어디로도 보내지 않는다.
 */
(function (): void {
  type RGB = [number, number, number];

  function medianCut(pixels: RGB[], depth: number): RGB[] {
    if (depth === 0 || pixels.length === 0) {
      if (!pixels.length) return [];
      const sum = pixels.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as RGB, [0, 0, 0] as RGB);
      return [[
        Math.round(sum[0] / pixels.length),
        Math.round(sum[1] / pixels.length),
        Math.round(sum[2] / pixels.length)
      ]];
    }
    // 가장 넓게 퍼진 채널을 기준으로 반 가른다.
    let widest = 0;
    let range = -1;
    for (let ch = 0; ch < 3; ch++) {
      let lo = 255;
      let hi = 0;
      for (const p of pixels) {
        if (p[ch] < lo) lo = p[ch];
        if (p[ch] > hi) hi = p[ch];
      }
      if (hi - lo > range) {
        range = hi - lo;
        widest = ch;
      }
    }
    pixels.sort((a, b) => a[widest] - b[widest]);
    const mid = pixels.length >> 1;
    return [
      ...medianCut(pixels.slice(0, mid), depth - 1),
      ...medianCut(pixels.slice(mid), depth - 1)
    ];
  }

  const hex = (c: RGB): string =>
    '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

  /** 배경 위 글자를 검게 쓸지 희게 쓸지 — 상대 휘도 기준. */
  function readableOn(c: RGB): string {
    const lum = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.35 ? '#111' : '#fff';
  }

  Toolbox.register({
    id: 'palette',
    title: '이미지 색상 추출',
    category: 'tool',
    desc: '사진에서 대표 색을 뽑아 HEX·RGB 팔레트로 보여줍니다. CSS 변수로도 한 번에 복사',
    layout: 'wide',
    icon: '<path d="M12 3a9 9 0 1 0 0 18h2a3 3 0 0 0 0-6h-1a2 2 0 0 1 0-4h2a5 5 0 0 0-3-8z" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="8" cy="10" r="1.3" fill="currentColor"/><circle cx="12" cy="7" r="1.3" fill="currentColor"/><circle cx="7" cy="14" r="1.3" fill="currentColor"/>',
    tabs: [
      {
        id: 'app',
        label: '추출',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="plDrop">
              <input type="file" id="plFile" accept="image/*" hidden>
              이미지를 끌어다 놓거나 눌러서 선택하세요
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-sublabel">뽑을 색 개수 <span id="plCountVal" class="range-value">8색</span></div>
              <input type="range" id="plCount" min="2" max="6" value="3">
            </div>

            <div id="plPreviewWrap" style="display:none; margin-bottom:var(--space-lg);">
              <img id="plPreview" alt="선택한 이미지" style="max-width:100%; max-height:220px; border-radius:8px; display:block;">
            </div>

            <div class="cc-swatch-row" id="plSwatches"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-ghost" id="plCopyHex">HEX 전부 복사</button>
              <button class="btn btn-ghost" id="plCopyCss">CSS 변수로 복사</button>
            </div>

            <div class="tool-status" id="plStatus">이미지는 브라우저 안에서만 처리되고 어디로도 전송되지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#plDrop');
          const file = $<HTMLInputElement>('#plFile');
          const countEl = $<HTMLInputElement>('#plCount');
          const countVal = $<HTMLElement>('#plCountVal');
          const preview = $<HTMLImageElement>('#plPreview');
          const previewWrap = $<HTMLElement>('#plPreviewWrap');
          const swatches = $<HTMLElement>('#plSwatches');
          const status = $<HTMLElement>('#plStatus');

          let current: RGB[] = [];
          let lastImage: HTMLImageElement | null = null;

          function extract(img: HTMLImageElement): void {
            // 원본 그대로 읽으면 수백만 픽셀이라 멈춘다. 긴 변 160px 로 줄여도 색 분포는 유지된다.
            const scale = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const cv = document.createElement('canvas');
            cv.width = w;
            cv.height = h;
            const ctx = cv.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(img, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h).data;
            const pixels: RGB[] = [];
            for (let i = 0; i < data.length; i += 4) {
              if (data[i + 3] < 125) continue; // 투명 픽셀은 색이 아니다
              pixels.push([data[i], data[i + 1], data[i + 2]]);
            }
            if (!pixels.length) {
              status.textContent = '색을 읽을 수 있는 픽셀이 없어요 (전부 투명한 이미지).';
              status.className = 'tool-status error';
              return;
            }
            current = medianCut(pixels, parseInt(countEl.value, 10));
            render();
            status.textContent = `${current.length}색 추출 · 색을 누르면 HEX 가 복사됩니다.`;
            status.className = 'tool-status ok';
            Toolbox.trackUse?.('extract');
          }

          function render(): void {
            swatches.innerHTML = current
              .map(
                (c) =>
                  `<button type="button" class="cc-swatch" data-hex="${hex(c)}" style="background:${hex(c)}; color:${readableOn(c)}">
                     <span class="cc-swatch-hex">${hex(c)}</span>
                     <span class="cc-swatch-hex" style="opacity:.75">${c.join(', ')}</span>
                   </button>`
              )
              .join('');
            swatches.querySelectorAll('[data-hex]').forEach((el) => {
              (el as HTMLButtonElement).onclick = () => {
                const v = (el as HTMLElement).dataset.hex || '';
                void Toolbox.copyText?.(v, { message: `복사: ${v}` });
              };
            });
          }

          function load(f: File): void {
            if (!f.type.startsWith('image/')) {
              status.textContent = '이미지 파일만 열 수 있어요.';
              status.className = 'tool-status error';
              return;
            }
            const url = URL.createObjectURL(f);
            const img = new Image();
            img.onload = () => {
              preview.src = url;
              previewWrap.style.display = '';
              lastImage = img;
              extract(img);
            };
            img.onerror = () => {
              status.textContent = '이미지를 열지 못했어요.';
              status.className = 'tool-status error';
              URL.revokeObjectURL(url);
            };
            img.src = url;
          }

          countEl.addEventListener('input', () => {
            countVal.textContent = `${Math.pow(2, parseInt(countEl.value, 10))}색`;
            if (lastImage) extract(lastImage);
          });
          countVal.textContent = `${Math.pow(2, parseInt(countEl.value, 10))}색`;

          drop.onclick = () => file.click();
          file.onchange = () => {
            if (file.files && file.files[0]) load(file.files[0]);
          };
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            const f = e.dataTransfer?.files?.[0];
            if (f) load(f);
          });
          // 스크린샷을 바로 붙여 넣는 흐름이 실제로 제일 많다.
          container.addEventListener('paste', (e) => {
            const items = (e as ClipboardEvent).clipboardData?.items;
            if (!items) return;
            for (const it of items) {
              if (it.type.startsWith('image/')) {
                const f = it.getAsFile();
                if (f) load(f);
                break;
              }
            }
          });

          $<HTMLButtonElement>('#plCopyHex').onclick = async () => {
            if (!current.length) return;
            await Toolbox.copyText?.(current.map(hex).join(', '), { message: 'HEX 를 복사했어요' });
          };
          $<HTMLButtonElement>('#plCopyCss').onclick = async () => {
            if (!current.length) return;
            const css = ':root {\n' + current.map((c, i) => `  --color-${i + 1}: ${hex(c)};`).join('\n') + '\n}';
            await Toolbox.copyText?.(css, { message: 'CSS 변수를 복사했어요' });
          };
        }
      }
    ]
  });
})();
