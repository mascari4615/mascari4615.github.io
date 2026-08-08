/**
 * 사진 이어 붙이기 (TASK-KL-088)
 *
 * 대화 캡처 세 장, 영수증 두 장, 긴 페이지를 나눠 찍은 것 — 한 장으로 합쳐야 보내기 편한데
 * 그러자고 편집 프로그램을 켜거나 사진을 낯선 사이트에 올린다.
 *
 * 신경 쓴 곳: 폭이 다른 캡처를 그냥 붙이면 **들쭉날쭉한 계단**이 된다. 그래서 기준 폭을 정해
 * 나머지를 맞추고, 남는 자리는 배경색으로 채운다. 순서는 넣은 순서대로 두되 끌어서 바꿀 수 있다.
 */
import { fileSize as size } from './shared/media';
import { acceptPastedFiles } from './shared/paste';

(function (): void {
  interface Shot {
    name: string;
    img: HTMLImageElement;
  }

  Toolbox.register({
    id: 'imgmerge',
    // 다른 도구가 만든 그림을 그대로 받는다 (TASK-KL-133)
    accepts: ['image/*'],
    title: '사진 이어 붙이기',
    category: 'tool',
    desc: '여러 장을 세로나 가로로 한 장에 이어 붙입니다. 사진이 브라우저를 벗어나지 않습니다',
    layout: 'wide',
    icon: '<rect x="3" y="3" width="18" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><rect x="3" y="13" width="18" height="8" rx="1.5" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 7l2-2 2 2M7 17l2-2 2 2" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/>',
    tabs: [
      {
        id: 'app',
        label: '이어 붙이기',
        build: function (container: HTMLElement): void {
          container.innerHTML = `
            <div class="tool-drop" id="imDrop">
              <input type="file" id="imFile" accept="image/*" multiple hidden>
              사진을 끌어다 놓거나 눌러서 고르세요 (여러 장 · 넣은 순서대로 이어집니다)
            </div>

            <div class="tool-list" id="imList" style="margin-top:var(--space-lg);"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">방향</div>
                  <select id="imDir" aria-label="이어 붙일 방향">
                    <option value="v">세로로 — 대화·긴 페이지 캡처</option>
                    <option value="h">가로로 — 전후 비교</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">사이 여백 <span id="imGapVal" class="range-value">0px</span></div>
                  <input type="range" id="imGap" aria-label="사이 여백" min="0" max="60" value="0">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">크기 맞추기</div>
                  <select id="imFit" aria-label="크기 맞추기">
                    <option value="max">가장 큰 것에 맞춤 — 화질 유지</option>
                    <option value="min">가장 작은 것에 맞춤 — 용량 작음</option>
                    <option value="none">원본 그대로 — 계단이 생길 수 있음</option>
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">배경색</div>
                  <input type="text" id="imBg" aria-label="배경색" value="#ffffff" spellcheck="false">
                </div>
              </div>
            </div>

            <div class="cc-stats" id="imStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="imRun">이어 붙여 내려받기</button>
              <button class="btn btn-ghost" id="imClear">비우기</button>
            </div>

            <div id="imResult" style="display:none;">
              <div class="tool-sublabel">결과 미리보기</div>
              <img id="imPreview" alt="이어 붙인 사진" style="max-width:100%; border-radius:8px; background:#fff;">
            </div>

            <div class="tool-status" id="imStatus">사진은 브라우저 안에서만 다뤄집니다 — 어디에도 올리지 않습니다.</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const drop = $<HTMLElement>('#imDrop');
          const fileInput = $<HTMLInputElement>('#imFile');
          const listEl = $<HTMLElement>('#imList');
          const stats = $<HTMLElement>('#imStats');
          const status = $<HTMLElement>('#imStatus');
          const gapEl = $<HTMLInputElement>('#imGap');

          let shots: Shot[] = [];
          let made: Blob | null = null;

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;
          const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          /** 이어 붙인 크기를 미리 계산한다 — 만들기 전에 「너무 큰가」를 알 수 있어야 한다. */
          function plan(): { w: number; h: number; base: number } {
            const dir = $<HTMLSelectElement>('#imDir').value;
            const fit = $<HTMLSelectElement>('#imFit').value;
            const gap = parseInt(gapEl.value, 10);
            if (!shots.length) return { w: 0, h: 0, base: 0 };

            const sizes = shots.map((s) => (dir === 'v' ? s.img.naturalWidth : s.img.naturalHeight));
            const base = fit === 'max' ? Math.max(...sizes) : fit === 'min' ? Math.min(...sizes) : 0;

            let along = 0;
            let across = 0;
            for (const s of shots) {
              const w = s.img.naturalWidth;
              const h = s.img.naturalHeight;
              if (dir === 'v') {
                const scale = base ? base / w : 1;
                along += Math.round(h * scale);
                across = Math.max(across, base || w);
              } else {
                const scale = base ? base / h : 1;
                along += Math.round(w * scale);
                across = Math.max(across, base || h);
              }
            }
            along += gap * Math.max(0, shots.length - 1);
            return dir === 'v' ? { w: across, h: along, base } : { w: along, h: across, base };
          }

          function render(): void {
            listEl.innerHTML = shots
              .map(
                (s, i) =>
                  `<div class="tool-list-row"><span class="tool-list-key">${i + 1}번째</span><span class="tool-list-val">${esc(s.name)} <span class="tool-list-dim">${s.img.naturalWidth}×${s.img.naturalHeight}</span></span></div>`
              )
              .join('');
            $<HTMLElement>('#imGapVal').textContent = gapEl.value + 'px';
            if (!shots.length) {
              stats.innerHTML = '';
              return;
            }
            const { w, h } = plan();
            stats.innerHTML =
              stat('만들 크기', `${w}×${h}`, true) +
              stat('장 수', `${shots.length}장`) +
              // 브라우저가 감당 못 하는 크기가 있다 — 미리 알려 준다
              stat('상태', w * h > 60_000_000 ? '너무 큽니다' : '괜찮습니다');
          }

          function draw(): HTMLCanvasElement | null {
            const dir = $<HTMLSelectElement>('#imDir').value;
            const gap = parseInt(gapEl.value, 10);
            const { w, h, base } = plan();
            if (!w || !h) return null;
            const cv = document.createElement('canvas');
            cv.width = w;
            cv.height = h;
            const ctx = cv.getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = $<HTMLInputElement>('#imBg').value || '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.imageSmoothingQuality = 'high';

            let at = 0;
            for (const s of shots) {
              const iw = s.img.naturalWidth;
              const ih = s.img.naturalHeight;
              if (dir === 'v') {
                const scale = base ? base / iw : 1;
                const dw = Math.round(iw * scale);
                const dh = Math.round(ih * scale);
                // 폭이 다르면 가운데로 — 왼쪽에 붙이면 계단처럼 보인다
                ctx.drawImage(s.img, Math.round((w - dw) / 2), at, dw, dh);
                at += dh + gap;
              } else {
                const scale = base ? base / ih : 1;
                const dw = Math.round(iw * scale);
                const dh = Math.round(ih * scale);
                ctx.drawImage(s.img, at, Math.round((h - dh) / 2), dw, dh);
                at += dw + gap;
              }
            }
            return cv;
          }

          async function add(list: FileList | File[]): Promise<void> {
            for (const f of Array.from(list)) {
              if (!f.type.startsWith('image/')) continue;
              const img = new Image();
              const url = URL.createObjectURL(f);
              await new Promise<void>((res) => {
                img.onload = () => res();
                img.onerror = () => {
                  say(`${f.name} 은 열지 못했어요.`, 'error');
                  res();
                };
                img.src = url;
              });
              if (img.naturalWidth) shots.push({ name: f.name, img });
            }
            render();
            if (shots.length) say(`${shots.length}장 · 넣은 순서대로 이어집니다.`, 'ok');
          }

          drop.onclick = () => fileInput.click();
          fileInput.onchange = () => {
            if (fileInput.files) void add(fileInput.files);
          };

          /* 옆 도구가 방금 만든 그림이 놓여 있으면 그대로 물고 시작한다 (TASK-KL-133).
           * 한 번만 집어 간다 — 두 번 집으면 같은 것이 다시 들어와 방금 한 일을 덮는다. */
          {
              Toolbox.onHandoff?.('imgmerge', (f: File) => void add([f]));
          }
          drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('over');
          });
          drop.addEventListener('dragleave', () => drop.classList.remove('over'));
          drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('over');
            if (e.dataTransfer?.files) void add(e.dataTransfer.files);
          });
          // 화면 캡처를 바로 붙여넣는 것이 가장 잦은 쓰임이다
          acceptPastedFiles(container, (files) => { void add(files); });
          ['#imDir', '#imFit', '#imBg'].forEach((s) => $<HTMLElement>(s).addEventListener('change', render));
          gapEl.addEventListener('input', render);

          $<HTMLButtonElement>('#imRun').onclick = () => {
            if (shots.length < 2) {
              say('사진을 두 장 이상 넣어 주세요.', 'error');
              return;
            }
            const { w, h } = plan();
            if (w * h > 60_000_000) {
              say('만들 그림이 너무 큽니다. 「가장 작은 것에 맞춤」을 골라 보세요.', 'error');
              return;
            }
            const cv = draw();
            if (!cv) {
              say('만들지 못했어요.', 'error');
              return;
            }
            cv.toBlob((blob) => {
              if (!blob) {
                say('그림으로 바꾸지 못했어요.', 'error');
                return;
              }
              made = blob;
              $<HTMLImageElement>('#imPreview').src = URL.createObjectURL(blob);
              $<HTMLElement>('#imResult').style.display = '';
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = '이어붙인-사진.png';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(`${shots.length}장을 ${cv.width}×${cv.height} · ${size(made.size)} 로 이어 받았어요.`, 'ok');
              // 이어서 할 일을 그 자리에 띄운다 (TASK-KL-133) — 받을 도구가 없으면 안 생긴다.
              Toolbox.offerNext?.(status, { blob: made, name: a.download, from: 'imgmerge' });
              Toolbox.trackUse?.('merge');
            }, 'image/png');
          };
          $<HTMLButtonElement>('#imClear').onclick = () => {
            shots = [];
            made = null;
            $<HTMLElement>('#imResult').style.display = 'none';
            render();
            say('비웠어요.');
          };
          render();
        }
      }
    ]
  });
})();
