/**
 * 파비콘 만들기 (TASK-KL-088)
 *
 * 사이트 아이콘은 한 장이 아니라 **여러 크기**가 필요하다. 브라우저 탭은 32px, 폰 홈 화면은 180px,
 * 안드로이드는 192·512px 을 본다. 하나만 넣으면 어딘가에서 뭉개지거나 안 보인다.
 *
 * 그런데 그걸 만들자고 로고를 낯선 사이트에 올린다. 여기서는 브라우저가 다시 그려 한 번에 낸다.
 * `.ico` 도 함께 만든다 — 옛 브라우저와 일부 도구가 아직 그것만 찾는다.
 *
 * 그리고 **붙일 코드까지 준다**. 파일만 받아서는 어디에 어떻게 넣는지가 또 막힌다.
 */
import { fileSize as size } from './shared/media';

(function (): void {
  // 왜 이 크기들인지: 탭·북마크(16·32), 윈도우 타일(48), 애플 홈 화면(180), 안드로이드(192·512)
  const SIZES: Array<[number, string]> = [
    [16, '탭'],
    [32, '탭·북마크'],
    [48, '윈도우'],
    [180, '아이폰 홈 화면'],
    [192, '안드로이드'],
    [512, '안드로이드 큰 아이콘']
  ];

  /** PNG 몇 장을 .ico 한 파일로 담는다 — ico 는 사실 PNG 를 품을 수 있는 껍데기다. */
  function buildIco(pngs: Array<{ size: number; bytes: Uint8Array }>): Blob {
    const count = pngs.length;
    const header = 6 + count * 16;
    const total = header + pngs.reduce((a, p) => a + p.bytes.length, 0);
    const buf = new ArrayBuffer(total);
    const view = new DataView(buf);
    const out = new Uint8Array(buf);

    view.setUint16(0, 0, true); // 예약
    view.setUint16(2, 1, true); // 1 = 아이콘
    view.setUint16(4, count, true);

    let offset = header;
    pngs.forEach((p, i) => {
      const e = 6 + i * 16;
      // 256 은 0 으로 적는 것이 규격이다 (한 바이트라 256 이 안 들어간다)
      out[e] = p.size >= 256 ? 0 : p.size;
      out[e + 1] = p.size >= 256 ? 0 : p.size;
      out[e + 2] = 0; // 색 수
      out[e + 3] = 0; // 예약
      view.setUint16(e + 4, 1, true); // 색 평면
      view.setUint16(e + 6, 32, true); // 비트 수
      view.setUint32(e + 8, p.bytes.length, true);
      view.setUint32(e + 12, offset, true);
      out.set(p.bytes, offset);
      offset += p.bytes.length;
    });
    return new Blob([out as unknown as BlobPart], { type: 'image/x-icon' });
  }

  Toolbox.register({
    id: 'favicon',
    title: '파비콘 만들기',
    category: 'tool',
    desc: '그림 한 장으로 사이트 아이콘 여러 크기와 ico 를 만듭니다. 붙일 코드까지 줍니다',
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M3 9h18" stroke="currentColor" stroke-width="1.3" opacity="0.6"/><circle cx="6" cy="7" r="0.9" fill="currentColor"/><path d="M9 15l2-2.5L13 15l2-3 2.5 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '파비콘',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="fvDrop">
              <input type="file" id="fvFile" accept="image/*" hidden>
              로고나 그림을 끌어다 놓거나 눌러서 고르세요 (정사각형에 가까울수록 좋습니다)
            </div>

            <div id="fvEditor" style="display:none; margin-top:var(--space-lg);">
              <div class="field-group">
                <div class="tool-grid-2">
                  <div>
                    <div class="tool-sublabel">여백 <span id="fvPadVal" class="range-value">0%</span></div>
                    <input type="range" id="fvPad" aria-label="여백" min="0" max="30" value="0">
                  </div>
                  <div>
                    <div class="tool-sublabel">배경</div>
                    <select id="fvBg" aria-label="배경">
                      <option value="">투명하게</option>
                      <option value="#ffffff">흰색</option>
                      <option value="#000000">검은색</option>
                    </select>
                  </div>
                </div>
                <div class="tool-chips" style="margin-top:10px;">
                  <label class="tool-chip"><input type="checkbox" id="fvRound"> 모서리 둥글게</label>
                </div>
              </div>

              <div class="tool-sublabel">미리보기 — 실제 크기입니다</div>
              <div id="fvPreview" style="display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; background:var(--surface-2, #1a1a1a); padding:14px; border-radius:8px;"></div>

              <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
                <button class="btn btn-primary" id="fvRun">ZIP 으로 받기</button>
                <button class="btn btn-ghost" id="fvIco">ico 만 받기</button>
              </div>

              <div class="field-group">
                <label class="field-label" for="fvCode">붙일 코드 — head 안에 넣으세요</label>
                <textarea id="fvCode" rows="6" spellcheck="false" style="width:100%;" readonly></textarea>
                <button class="btn btn-ghost btn-sm" id="fvCopy" style="margin-top:8px;">코드 복사</button>
              </div>
            </div>

            <div class="tool-status" id="fvStatus">그림은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#fvDrop');
          const fileInput = $<HTMLInputElement>('#fvFile');
          const editor = $<HTMLElement>('#fvEditor');
          const previewEl = $<HTMLElement>('#fvPreview');
          const status = $<HTMLElement>('#fvStatus');
          const padEl = $<HTMLInputElement>('#fvPad');

          let source: HTMLImageElement | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          function render(px: number): HTMLCanvasElement {
            const cv = document.createElement('canvas');
            cv.width = px;
            cv.height = px;
            const ctx = cv.getContext('2d');
            if (!ctx || !source) return cv;
            const bg = $<HTMLSelectElement>('#fvBg').value;
            if (bg) {
              ctx.fillStyle = bg;
              ctx.fillRect(0, 0, px, px);
            }
            if ($<HTMLInputElement>('#fvRound').checked) {
              // 둥근 모서리는 잘라 내는 방식이라 배경보다 먼저 잡아야 한다
              const r = px * 0.22;
              ctx.globalCompositeOperation = bg ? 'destination-in' : 'source-over';
              ctx.beginPath();
              ctx.moveTo(r, 0);
              ctx.arcTo(px, 0, px, px, r);
              ctx.arcTo(px, px, 0, px, r);
              ctx.arcTo(0, px, 0, 0, r);
              ctx.arcTo(0, 0, px, 0, r);
              ctx.closePath();
              if (bg) ctx.fill();
              else ctx.clip();
              ctx.globalCompositeOperation = 'source-over';
            }
            const pad = (parseInt(padEl.value, 10) / 100) * px;
            const inner = px - pad * 2;
            // 원본 비율을 지켜 가운데에 — 늘리면 로고가 찌그러진다
            const scale = Math.min(inner / source.naturalWidth, inner / source.naturalHeight);
            const w = source.naturalWidth * scale;
            const h = source.naturalHeight * scale;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(source, (px - w) / 2, (px - h) / 2, w, h);
            return cv;
          }

          function refresh(): void {
            $<HTMLElement>('#fvPadVal').textContent = padEl.value + '%';
            if (!source) return;
            previewEl.innerHTML = '';
            for (const [px, why] of SIZES) {
              if (px > 192) continue; // 실제 크기로 보여 주므로 큰 것은 뺀다
              const cv = render(px);
              cv.style.imageRendering = px <= 48 ? 'pixelated' : 'auto';
              const box = document.createElement('div');
              box.style.textAlign = 'center';
              box.appendChild(cv);
              const cap = document.createElement('div');
              cap.className = 'tool-list-dim';
              cap.style.paddingTop = '4px';
              cap.textContent = `${px}px · ${why}`;
              box.appendChild(cap);
              previewEl.appendChild(box);
            }
            $<HTMLTextAreaElement>('#fvCode').value = [
              '<link rel="icon" href="/favicon.ico" sizes="any">',
              '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
              '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">',
              '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
              '<link rel="manifest" href="/site.webmanifest">'
            ].join('\n');
          }

          const toBlob = (cv: HTMLCanvasElement): Promise<Blob> =>
            new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('그림으로 못 바꿨어요'))), 'image/png'));

          function load(f: File): void {
            const img = new Image();
            img.onload = () => {
              source = img;
              editor.style.display = '';
              refresh();
              const square = Math.abs(img.naturalWidth - img.naturalHeight) < Math.max(img.naturalWidth, img.naturalHeight) * 0.05;
              say(
                square
                  ? `${img.naturalWidth}×${img.naturalHeight} — 설정을 맞추고 받으세요.`
                  : `${img.naturalWidth}×${img.naturalHeight} 은 정사각형이 아닙니다. 가운데에 맞춰 넣지만, 정사각형 그림이 가장 깔끔합니다.`,
                square ? 'ok' : ''
              );
            };
            img.onerror = () => say('이 그림은 열지 못했어요.', 'error');
            img.src = URL.createObjectURL(f);
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
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
          [padEl, $<HTMLSelectElement>('#fvBg'), $<HTMLInputElement>('#fvRound')].forEach((el) =>
            el.addEventListener('input', refresh)
          );

          $<HTMLButtonElement>('#fvIco').onclick = () => {
            void (async () => {
              if (!source) return;
              const parts = [];
              for (const px of [16, 32, 48]) {
                parts.push({ size: px, bytes: new Uint8Array(await (await toBlob(render(px))).arrayBuffer()) });
              }
              const blob = buildIco(parts);
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'favicon.ico';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(`favicon.ico 를 받았어요 (16·32·48 세 크기가 한 파일에 들어 있습니다, ${size(blob.size)}).`, 'ok');
              Toolbox.trackUse?.('ico');
            })().catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };

          $<HTMLButtonElement>('#fvRun').onclick = () => {
            void (async () => {
              if (!source) {
                say('그림을 먼저 넣어 주세요.', 'error');
                return;
              }
              say('만드는 중…');
              await Toolbox.ensureScript?.('vendor/jszip.min');
              const Z = (window as unknown as { JSZip: new () => { file: (n: string, b: Blob | string) => void; generateAsync: (o: { type: string }) => Promise<Blob> } }).JSZip;
              const zip = new Z();
              const icoParts = [];
              for (const [px] of SIZES) {
                const blob = await toBlob(render(px));
                const name =
                  px === 180 ? 'apple-touch-icon.png' : px === 192 || px === 512 ? `android-chrome-${px}x${px}.png` : `favicon-${px}.png`;
                zip.file(name, blob);
                if (px <= 48) icoParts.push({ size: px, bytes: new Uint8Array(await blob.arrayBuffer()) });
              }
              zip.file('favicon.ico', buildIco(icoParts));
              zip.file('붙일-코드.txt', $<HTMLTextAreaElement>('#fvCode').value);
              zip.file(
                'site.webmanifest',
                JSON.stringify(
                  {
                    icons: [
                      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
                      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' }
                    ]
                  },
                  null,
                  2
                )
              );
              const out = await zip.generateAsync({ type: 'blob' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(out);
              a.download = '파비콘.zip';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(`${SIZES.length}개 크기와 ico·설정 파일을 ZIP 으로 받았어요 (${size(out.size)}).`, 'ok');
              Toolbox.trackUse?.('zip');
            })().catch((err: Error) => say('만드는 중 문제가 생겼어요: ' + err.message, 'error'));
          };

          $<HTMLButtonElement>('#fvCopy').onclick = () => {
            void Toolbox.copyText?.($<HTMLTextAreaElement>('#fvCode').value, { message: '붙일 코드를 복사했어요' });
          };
        }
      }
    ]
  });
})();
