/**
 * 사진 크기 맞추기 (TASK-KL-088)
 *
 * 「3MB 이하로 올려 주세요」, 「가로 1024px 로 맞춰 주세요」 — 서류 접수나 게시판에서 자주 걸린다.
 * 대충 줄이면 기준을 못 맞추거나 필요 이상으로 뭉갠다.
 *
 * 신경 쓴 곳 — **목표를 숫자로 준다.**
 *  - 「용량 맞추기」를 고르면 그 크기 아래로 **떨어질 때까지 스스로 품질을 찾아 준다.**
 *    사람이 슬라이더를 밀어 가며 맞출 일이 아니다.
 *  - 크게 줄일 때는 **여러 번 나눠 줄인다.** 한 번에 확 줄이면 글자와 선이 부서진다.
 *  - 원본보다 커지는 일이 없게 한다 — 「줄이려고 눌렀는데 커졌다」는 배신이다.
 */
import { fileSize as size } from './shared/media';

(function (): void {
  /**
   * 여러 번 나눠 줄인다. 한 번에 1/4 로 보내면 글자·선이 부서지는데,
   * 절반씩 여러 번 거치면 훨씬 곱게 남는다.
   */
  function shrink(src: CanvasImageSource, sw: number, sh: number, tw: number, th: number): HTMLCanvasElement {
    let cw = sw;
    let ch = sh;
    let cur = document.createElement('canvas');
    cur.width = cw;
    cur.height = ch;
    cur.getContext('2d')?.drawImage(src, 0, 0, cw, ch);
    while (cw > tw * 2 && ch > th * 2) {
      const next = document.createElement('canvas');
      next.width = Math.max(tw, Math.round(cw / 2));
      next.height = Math.max(th, Math.round(ch / 2));
      const nctx = next.getContext('2d');
      if (!nctx) break;
      nctx.imageSmoothingQuality = 'high';
      nctx.drawImage(cur, 0, 0, next.width, next.height);
      cur = next;
      cw = next.width;
      ch = next.height;
    }
    const out = document.createElement('canvas');
    out.width = tw;
    out.height = th;
    const octx = out.getContext('2d');
    if (octx) {
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(cur, 0, 0, tw, th);
    }
    return out;
  }

  const toBlob = (cv: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> =>
    new Promise((r) => cv.toBlob(r, type, q));

  Toolbox.register({
    id: 'imgresize',
    // 다른 도구가 만든 그림을 그대로 받는다 (TASK-KL-133)
    accepts: ['image/*'],
    title: '사진 크기 맞추기',
    category: 'tool',
    desc: '가로 몇 px, 몇 MB 이하 같은 기준에 맞춰 줄입니다. 용량은 알아서 찾아 줍니다',
    layout: 'wide',
    icon: '<rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M8 16l3-3 2 2 3-4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 7h3v3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    tabs: [
      {
        id: 'app',
        label: '크기 맞추기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="irDrop">
              <input type="file" id="irFile" accept="image/*" hidden>
              <span>사진을 끌어다 놓거나 눌러서 고르세요</span>
            </div>

            <div class="field-group" id="irControls" style="display:none; margin-top:var(--space-lg);">
              <div class="tool-chips" id="irMode">
                <button type="button" class="tool-chip active" data-mode="side">긴 변 맞추기</button>
                <button type="button" class="tool-chip" data-mode="percent">비율로 줄이기</button>
                <button type="button" class="tool-chip" data-mode="bytes">용량 맞추기</button>
              </div>

              <div id="irSideWrap" style="margin-top:10px;">
                <div class="tool-sublabel">긴 변 <span id="irSideVal" class="range-value">1024px</span></div>
                <input type="range" id="irSide" aria-label="긴 변 크기" min="200" max="4000" step="20" value="1024">
                <div class="tool-chips" style="margin-top:8px;">
                  <button type="button" class="tool-chip" data-side="640">640</button>
                  <button type="button" class="tool-chip" data-side="1024">1024</button>
                  <button type="button" class="tool-chip" data-side="1920">1920</button>
                </div>
              </div>

              <!-- iLoveIMG 등 상위 도구는 「픽셀 또는 백분율」 둘 다 받는다. 원본 크기를 모르고
                   「반으로만 줄이고 싶다」는 사람에게는 픽셀 칸이 오히려 걸림돌이다. -->
              <div id="irPercentWrap" style="display:none; margin-top:10px;">
                <div class="tool-sublabel">원본의 <span id="irPercentVal" class="range-value">50%</span></div>
                <input type="range" id="irPercent" aria-label="원본 대비 비율 (%)" min="5" max="200" step="5" value="50">
                <div class="tool-chips" style="margin-top:8px;">
                  <button type="button" class="tool-chip" data-pct="25">25%</button>
                  <button type="button" class="tool-chip" data-pct="50">50%</button>
                  <button type="button" class="tool-chip" data-pct="75">75%</button>
                </div>
              </div>

              <div id="irBytesWrap" style="display:none; margin-top:10px;">
                <div class="tool-sublabel">이 크기 아래로 <span id="irBytesVal" class="range-value">1MB</span></div>
                <input type="range" id="irBytes" aria-label="목표 용량" min="1" max="20" value="4">
                <div class="tool-status" style="margin-top:8px;">품질을 스스로 낮춰 가며 기준 아래로 떨어뜨립니다. 그래도 안 되면 크기까지 줄입니다.</div>
              </div>

              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">저장 형식</div>
                  <select id="irType" aria-label="저장 형식">
                    <option value="image/jpeg">JPEG — 사진에 알맞음</option>
                    <option value="image/webp">WebP — 더 작음</option>
                    <option value="image/png">PNG — 글자·그림에 알맞음</option>
                  </select>
                </div>
                <div class="tool-chips" style="align-content:end;">
                  <label class="tool-chip"><input type="checkbox" id="irNoUp" checked> 원본보다 키우지 않기</label>
                </div>
              </div>
            </div>

            <div class="cc-stats" id="irStats"></div>
            <img id="irPreview" alt="바뀐 사진 미리보기" style="max-width:100%; border-radius:10px; display:none; margin-bottom:var(--space-lg);">

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="irRun" disabled>맞추기</button>
              <button class="btn btn-ghost" id="irSave" disabled>내려받기</button>
            </div>

            <div class="tool-status" id="irStatus">사진은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const status = $<HTMLElement>('#irStatus');
          const stats = $<HTMLElement>('#irStats');
          const preview = $<HTMLImageElement>('#irPreview');
          const runBtn = $<HTMLButtonElement>('#irRun');
          const saveBtn = $<HTMLButtonElement>('#irSave');

          let img: HTMLImageElement | null = null;
          let originalSize = 0;
          let baseName = '사진';
          let made: Blob | null = null;
          let mode: 'side' | 'percent' | 'bytes' = 'side';

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          function load(file: File): void {
            const url = URL.createObjectURL(file);
            const im = new Image();
            im.onload = () => {
              img = im;
              originalSize = file.size;
              baseName = (file.name || '사진').replace(/\.[^.]+$/, '');
              made = null;
              saveBtn.disabled = true;
              preview.style.display = 'none';
              $<HTMLElement>('#irControls').style.display = '';
              runBtn.disabled = false;
              stats.innerHTML =
                stat('원본 크기', `${im.naturalWidth}×${im.naturalHeight}`, true) + stat('원본 용량', size(file.size));
              say('기준을 고르고 맞추기를 누르세요.', 'ok');
              URL.revokeObjectURL(url);
            };
            im.onerror = () => {
              say('사진을 열지 못했어요. 다른 파일로 해 보세요.', 'error');
              URL.revokeObjectURL(url);
            };
            im.src = url;
          }

          /** 긴 변 목표에 맞춘 크기 (비율은 지킨다) */
          function targetSize(longSide: number): { w: number; h: number } {
            if (!img) return { w: 1, h: 1 };
            const sw = img.naturalWidth;
            const sh = img.naturalHeight;
            const long = Math.max(sw, sh);
            const cap = $<HTMLInputElement>('#irNoUp').checked ? Math.min(longSide, long) : longSide;
            const k = cap / long;
            return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)) };
          }

          async function run(): Promise<void> {
            if (!img) return;
            runBtn.disabled = true;
            const type = $<HTMLSelectElement>('#irType').value;
            try {
              let blob: Blob | null = null;
              let dims = { w: 0, h: 0 };

              if (mode === 'side') {
                dims = targetSize(parseInt($<HTMLInputElement>('#irSide').value, 10));
                const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
                blob = await toBlob(cv, type, 0.92);
              } else if (mode === 'percent') {
                /* 원본 크기를 몰라도 「반으로」 처럼 말할 수 있어야 한다. 비율은 그대로 지킨다. */
                const pct = parseInt($<HTMLInputElement>('#irPercent').value, 10) / 100;
                const noUp = $<HTMLInputElement>('#irNoUp').checked;
                const k = noUp ? Math.min(pct, 1) : pct;
                dims = {
                  w: Math.max(1, Math.round(img.naturalWidth * k)),
                  h: Math.max(1, Math.round(img.naturalHeight * k))
                };
                const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
                blob = await toBlob(cv, type, 0.92);
              } else {
                const limit = parseInt($<HTMLInputElement>('#irBytes').value, 10) * 1024 * 1024;
                // 품질을 먼저 낮춰 본다 — 크기를 줄이는 것보다 잃는 게 적다
                let long = Math.max(img.naturalWidth, img.naturalHeight);
                for (let round = 0; round < 6 && !blob; round++) {
                  dims = targetSize(long);
                  const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
                  for (let q = 92; q >= 40; q -= 8) {
                    say(`기준에 맞추는 중… 긴 변 ${long}px · 품질 ${q}%`);
                    const b = await toBlob(cv, type === 'image/png' ? 'image/jpeg' : type, q / 100);
                    if (b && b.size <= limit) {
                      blob = b;
                      break;
                    }
                  }
                  // 품질만으로 안 되면 크기도 줄인다
                  if (!blob) long = Math.round(long * 0.8);
                }
                if (!blob) {
                  const cv = shrink(img, img.naturalWidth, img.naturalHeight, dims.w, dims.h);
                  blob = await toBlob(cv, 'image/jpeg', 0.4);
                }
              }

              if (!blob) throw new Error('사진을 바꾸지 못했습니다');
              made = blob;
              preview.src = URL.createObjectURL(blob);
              preview.style.display = '';
              saveBtn.disabled = false;

              const pct = Math.round(Math.abs(1 - blob.size / originalSize) * 100);
              // 커졌으면 커졌다고 적는다 — 「-3% 줄었어요」는 숫자도 말도 틀린다
              const verdict = blob.size < originalSize ? `${pct}% 줄었어요` : blob.size > originalSize ? `${pct}% 커졌어요` : '그대로예요';
              stats.innerHTML =
                stat('바뀐 크기', `${dims.w}×${dims.h}`, true) +
                stat('바뀐 용량', size(blob.size)) +
                stat('원본 대비', verdict);
              const limit = parseInt($<HTMLInputElement>('#irBytes').value, 10) * 1024 * 1024;
              say(
                mode === 'bytes' && blob.size > limit
                  ? '기준까지는 못 내렸어요. 형식을 WebP 로 바꾸거나 긴 변을 더 줄여 보세요.'
                  : `${size(originalSize)} → ${size(blob.size)} (${verdict})`,
                mode === 'bytes' && blob.size > limit ? 'error' : 'ok'
              );
              Toolbox.trackUse?.('resize');
            } catch (e) {
              say((e as Error).message || '맞추지 못했어요.', 'error');
            } finally {
              runBtn.disabled = false;
            }
          }

          const drop = $<HTMLElement>('#irDrop');
          const fileInput = $<HTMLInputElement>('#irFile');
          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files?.[0]) load(fileInput.files[0]);
          };

          /* 옆 도구가 방금 만든 그림이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.(['image/*'], (f: File) => load(f));
          }
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

          container.querySelectorAll('#irMode .tool-chip').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              container.querySelectorAll('#irMode .tool-chip').forEach((c) => c.classList.remove('active'));
              chip.classList.add('active');
              mode = ((chip as HTMLElement).dataset.mode as 'side' | 'percent' | 'bytes') || 'side';
              $<HTMLElement>('#irSideWrap').style.display = mode === 'side' ? '' : 'none';
              $<HTMLElement>('#irPercentWrap').style.display = mode === 'percent' ? '' : 'none';
              $<HTMLElement>('#irBytesWrap').style.display = mode === 'bytes' ? '' : 'none';
            };
          });
          $<HTMLInputElement>('#irSide').addEventListener('input', () => {
            $<HTMLElement>('#irSideVal').textContent = $<HTMLInputElement>('#irSide').value + 'px';
          });
          container.querySelectorAll('[data-side]').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              $<HTMLInputElement>('#irSide').value = (chip as HTMLElement).dataset.side as string;
              $<HTMLInputElement>('#irSide').dispatchEvent(new Event('input'));
            };
          });
          $<HTMLInputElement>('#irPercent').addEventListener('input', () => {
            $<HTMLElement>('#irPercentVal').textContent = $<HTMLInputElement>('#irPercent').value + '%';
          });
          container.querySelectorAll('[data-pct]').forEach((chip) => {
            (chip as HTMLButtonElement).onclick = () => {
              $<HTMLInputElement>('#irPercent').value = (chip as HTMLElement).dataset.pct as string;
              $<HTMLInputElement>('#irPercent').dispatchEvent(new Event('input'));
            };
          });
          $<HTMLInputElement>('#irBytes').addEventListener('input', () => {
            $<HTMLElement>('#irBytesVal').textContent = $<HTMLInputElement>('#irBytes').value + 'MB';
          });
          runBtn.onclick = () => void run();
          saveBtn.onclick = () => {
            if (!made) return;
            const ext = made.type.includes('webp') ? 'webp' : made.type.includes('png') ? 'png' : 'jpg';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(made);
            a.download = `${baseName}-맞춤.${ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            say(`${size(made.size)} 로 받았어요.`, 'ok');
            // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
            Toolbox.offerNext?.(status, { blob: made, name: a.download, from: 'imgresize' });
          };
        }
      }
    ]
  });
})();
