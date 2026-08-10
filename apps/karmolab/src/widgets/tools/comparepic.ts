/**
 * 비교 슬라이더 — 화면 (흡수 ⓐ / 04 문서 A부류)
 *
 * 사진 두 장을 겹쳐 놓고 가운데 손잡이를 밀어 「전 / 후」를 견주는 그것. 보정·업스케일·
 * 배경 제거처럼 **바뀐 정도를 보여 줘야 하는 일**에 늘 필요한데, 매번 남의 사이트를 찾아 간다.
 *
 * 우리 원칙 그대로 — **사진은 기기 밖으로 안 나간다.** 브라우저 안에서 그리고, 저장도 여기서 한다.
 *
 * 골격만이다(색·움직임은 사용자 몫). 다만 아래 셋은 기능이라 지금 박는다:
 * ① 손가락·마우스·키보드 셋 다 — 손잡이를 마우스로만 잡게 하면 폰에서는 없는 기능이 된다
 * ② 크기가 다른 두 장도 겹쳐진다 — 「전/후」는 대개 크기가 다르다(업스케일이 그렇다)
 * ③ 지금 보이는 그대로 PNG 로 저장 — 자랑하려면 그림 한 장이 있어야 한다
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: unknown): string =>
    String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  Toolbox.register({
    id: 'comparepic',
    title: t('widgets.comparepic.title', undefined, "비교 슬라이더"),
    category: 'tool',
    desc: t('widgets-desc.comparepic.desc', undefined, "사진 두 장을 겹쳐 밀어 보며 비교합니다. 파일은 기기 밖으로 나가지 않습니다"),
    layout: 'wide',
    tabs: [
      {
        id: 'compare',
        label: t('comparepic.t03', undefined, "전후 비교"),
        build: function (container: HTMLElement): void {
          void loadNamespace('comparepic').then(function () {

          container.innerHTML = `
            <div class="tool-block">
              <div class="tool-row">
                <label class="tool-btn" for="cpA">${esc(t('comparepic.label.cpA'))}<input id="cpA" type="file" accept="image/*" hidden /></label>
                <label class="tool-btn" for="cpB">${esc(t('comparepic.label.cpB'))}<input id="cpB" type="file" accept="image/*" hidden /></label>
                <button id="cpSave" class="tool-btn" type="button" disabled>${esc(t('comparepic.btn.cpSave'))}</button>
              </div>
              <div id="cpStage" style="position:relative; overflow:hidden; border-radius:8px;
                background:var(--surface-2, #1a1a1a); touch-action:none; user-select:none;">
                <canvas id="cpCanvas" style="display:block; width:100%; height:auto;"></canvas>
                <div id="cpHandle" role="slider" tabindex="0" aria-label="${esc(t('comparepic.aria.cpHandle'))}"
                  aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"
                  style="position:absolute; top:0; bottom:0; width:3px; left:50%; margin-left:-1.5px;
                  background:#fff; box-shadow:0 0 0 1px rgba(0,0,0,.35); cursor:ew-resize;"></div>
              </div>
              <div id="cpSay" class="tool-note" role="status"></div>
            </div>`;

          const $ = <T extends HTMLElement>(sel: string): T => container.querySelector(sel) as T;
          const canvas = $<HTMLCanvasElement>('#cpCanvas');
          const stage = $('#cpStage');
          const handle = $('#cpHandle');
          const say = (msg: string, tone = ''): void => {
            const el = $('#cpSay');
            el.textContent = msg;
            el.className = `tool-note${tone === '' ? '' : ' ' + tone}`;
          };

          let left: HTMLImageElement | null = null;
          let right: HTMLImageElement | null = null;
          let split = 0.5;

          /**
           * 두 장의 크기가 다르면 **큰 쪽에 맞춘다.** 작은 쪽을 늘리면 흐려지지만, 자르면
           * 비교하려던 부분이 사라진다 — 흐린 편이 낫다(업스케일 전/후가 바로 그 경우다).
           */
          const draw = (): void => {
            if (left === null && right === null) return;
            const w = Math.max(left?.naturalWidth ?? 0, right?.naturalWidth ?? 0);
            const h = Math.max(left?.naturalHeight ?? 0, right?.naturalHeight ?? 0);
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx === null) return;
            ctx.clearRect(0, 0, w, h);
            if (right !== null) ctx.drawImage(right, 0, 0, w, h);
            if (left !== null) {
              ctx.save();
              ctx.beginPath();
              ctx.rect(0, 0, w * split, h);
              ctx.clip();
              ctx.drawImage(left, 0, 0, w, h);
              ctx.restore();
            }
            handle.style.left = `${split * 100}%`;
            handle.setAttribute('aria-valuenow', String(Math.round(split * 100)));
          };

          const load = (file: File, side: 'left' | 'right'): void => {
            const img = new Image();
            img.onload = () => {
              if (side === 'left') left = img;
              else right = img;
              URL.revokeObjectURL(img.src);
              $<HTMLButtonElement>('#cpSave').disabled = left === null || right === null;
              draw();
              if (left !== null && right !== null) {
                const differ = left.naturalWidth !== right.naturalWidth || left.naturalHeight !== right.naturalHeight;
                say(
                  differ
                    ? t('comparepic.sizeDiff', {
                        a: `${left.naturalWidth}×${left.naturalHeight}`,
                        b: `${right.naturalWidth}×${right.naturalHeight}`,
                      })
                    : t('comparepic.t04')
                );
              } else {
                say(t('comparepic.say.05'));
              }
            };
            img.onerror = () => say(t('comparepic.say.06'), 'error');
            img.src = URL.createObjectURL(file);
          };

          $<HTMLInputElement>('#cpA').onchange = (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) load(f, 'left');
          };
          $<HTMLInputElement>('#cpB').onchange = (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) load(f, 'right');
          };

          /* 손가락·마우스 한 벌로 (pointer). 마우스만 받으면 폰에서는 없는 기능이 된다. */
          const moveTo = (clientX: number): void => {
            const box = stage.getBoundingClientRect();
            split = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
            draw();
          };
          let dragging = false;
          stage.addEventListener('pointerdown', (e) => {
            dragging = true;
            stage.setPointerCapture((e as PointerEvent).pointerId);
            moveTo((e as PointerEvent).clientX);
          });
          stage.addEventListener('pointermove', (e) => {
            if (dragging) moveTo((e as PointerEvent).clientX);
          });
          stage.addEventListener('pointerup', () => {
            dragging = false;
          });

          /* 키보드로도 — 손이 불편한 사람에게 손잡이는 잡기 가장 어려운 것 중 하나다. */
          handle.addEventListener('keydown', (e) => {
            const key = (e as KeyboardEvent).key;
            const step = (e as KeyboardEvent).shiftKey ? 0.1 : 0.02;
            if (key === 'ArrowLeft') split = Math.max(0, split - step);
            else if (key === 'ArrowRight') split = Math.min(1, split + step);
            else if (key === 'Home') split = 0;
            else if (key === 'End') split = 1;
            else return;
            e.preventDefault();
            draw();
          });

          $<HTMLButtonElement>('#cpSave').onclick = () => {
            canvas.toBlob((blob) => {
              if (blob === null) {
                say(t('comparepic.say.07'), 'error');
                return;
              }
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = 'compare.png';
              a.click();
              URL.revokeObjectURL(a.href);
              say(t('comparepic.say.08'));
            }, 'image/png');
          };

          say(t('comparepic.say.09'));
                  });
        }
      }
    ]
  });
})();
