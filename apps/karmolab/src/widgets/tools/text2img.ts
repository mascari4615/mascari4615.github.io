/**
 * 글자를 그림으로 (TASK-KL-088)
 *
 * 인용구나 공지를 이미지로 올려야 할 때가 있다 — 트위터·인스타처럼 글자보다 그림이 잘 보이는 곳,
 * 또는 서식이 깨지면 안 되는 안내문. 그런데 그걸 만들려고 디자인 도구를 켜는 건 과하다.
 *
 * 신경 쓴 곳:
 *  - **줄바꿈을 글자 단위로** 접는다. 한국어는 띄어쓰기가 드문 문장이 많아 낱말 단위면 삐져나간다.
 *  - 글자 수에 따라 **크기를 자동으로 줄인다** — 긴 글을 넣었는데 잘려 나가면 쓸 수 없다.
 *  - 배경은 단색과 그라데이션 둘 다. 그라데이션은 눈에 맞춰 섞어 가운데가 탁해지지 않게 한다.
 */
import { fileSize as size } from './shared/media';

import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  /* 이름은 **쓸 때** 붙인다 — 표를 만들 때 정하면 그 시점엔 말 묶음이 아직 안 와서 열쇠가 굳는다. */
  const RATIOS: Array<[string, number, number]> = [
    ['square', 1080, 1080],
    ['wide', 1200, 675],
    ['story', 1080, 1350],
    ['banner', 1200, 400]
  ];

  const THEMES: Array<[string, string, string]> = [
    ['dark', '#12141a', '#f2f4f8'],
    ['light', '#f7f8fa', '#1a1d24'],
    ['warm', '#2a1810', '#ffd9a8'],
    ['mint', '#0f2a25', '#a8f0dc']
  ];

  const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const toSrgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

  /** 두 색을 눈에 맞춰 섞는다 — 그냥 섞으면 가운데가 탁해진다. */
  function mix(a: string, b: string, t: number): string {
    const rgb = (h: string): number[] => {
      const n = parseInt(h.slice(1), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    const A = rgb(a).map(toLinear);
    const B = rgb(b).map(toLinear);
    return (
      '#' +
      A.map((v, i) => Math.round(Math.max(0, Math.min(1, toSrgb(v + (B[i] - v) * t))) * 255).toString(16).padStart(2, '0')).join('')
    );
  }

  Toolbox.register({
    id: 'text2img',
    title: t('widgets.text2img.title', undefined, '글자를 그림으로'),
    category: 'tool',
    desc: t(
      'widgets-desc.text2img.desc',
      undefined,
      '인용구나 공지를 이미지 카드로 만듭니다. 긴 글도 잘리지 않게 크기를 맞춰 줍니다'
    ),
    layout: 'wide',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M7 10h10M7 13h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    tabs: [
      {
        id: 'app',
        label: t('text2img.tab', undefined, '글자 → 그림'),
        build: function (container: HTMLElement): void {
          void loadNamespace('text2img').then(function () {
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
            <div class="field-group">
              <label class="field-label" for="tiText">${esc(t('text2img.label.text'))}</label>
              <textarea id="tiText" rows="5" spellcheck="false" style="width:100%;" placeholder="${esc(t('text2img.ph.text'))}">${esc(t('text2img.sample'))}</textarea>
            </div>

            <div class="field-group">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('text2img.label.ratio'))}</div>
                  <select id="tiRatio" aria-label="${esc(t('text2img.label.ratio'))}">
                    ${RATIOS.map(([id]) => `<option value="${id}">${esc(t(`text2img.ratio.${id}`))}</option>`).join('')}
                  </select>
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('text2img.label.theme'))}</div>
                  <select id="tiTheme" aria-label="${esc(t('text2img.label.theme'))}">
                    ${THEMES.map(([id]) => `<option value="${id}">${esc(t(`text2img.theme.${id}`))}</option>`).join('')}
                  </select>
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('text2img.label.scale'))} <span id="tiScaleVal" class="range-value">${esc(
                    t('text2img.scale.auto')
                  )}</span></div>
                  <input type="range" id="tiScale" aria-label="${esc(t('text2img.label.scale'))}" min="0" max="200" value="0">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('text2img.label.sign'))}</div>
                  <input type="text" id="tiSign" aria-label="${esc(t('text2img.label.sign'))}" placeholder="@mascari4615" spellcheck="false">
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="tiGrad" checked> ${esc(t('text2img.opt.grad'))}</label>
                <label class="tool-chip"><input type="checkbox" id="tiQuote"> ${esc(t('text2img.opt.quote'))}</label>
              </div>
            </div>

            <div class="tool-sublabel">${esc(t('text2img.label.preview'))}</div>
            <canvas id="tiCanvas" style="max-width:100%; border-radius:10px; display:block; border:1px solid rgba(128,128,128,0.25);"></canvas>

            <div class="cc-stats" id="tiStats"></div>

            <div style="display:flex; gap:6px; margin:var(--space-lg) 0; flex-wrap:wrap;">
              <button class="btn btn-primary" id="tiSave">${esc(t('text2img.btn.save'))}</button>
            </div>

            <div class="tool-status" id="tiStatus">${esc(t('text2img.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const textEl = $<HTMLTextAreaElement>('#tiText');
          const canvas = $<HTMLCanvasElement>('#tiCanvas');
          const scaleEl = $<HTMLInputElement>('#tiScale');
          const stats = $<HTMLElement>('#tiStats');
          const status = $<HTMLElement>('#tiStatus');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };
          const stat = (l: string, v: string, primary = false): string =>
            `<div class="cc-stat${primary ? ' cc-stat-primary' : ''}"><div class="cc-stat-label">${l}</div><div class="cc-stat-value">${v}</div></div>`;

          /** 글자 단위로 접는다 — 한국어는 낱말 단위로만 접으면 오른쪽이 삐져나간다. */
          function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
            const out: string[] = [];
            for (const para of text.split('\n')) {
              if (!para) {
                out.push('');
                continue;
              }
              let cur = '';
              for (const ch of para) {
                if (ctx.measureText(cur + ch).width > maxW && cur) {
                  out.push(cur);
                  cur = ch;
                } else cur += ch;
              }
              out.push(cur);
            }
            return out;
          }

          function draw(): { lines: number; fontSize: number } {
            const [, W, H] = RATIOS.find((r) => r[0] === $<HTMLSelectElement>('#tiRatio').value) as [string, number, number];
            const [, bg, fg] = THEMES.find((t) => t[0] === $<HTMLSelectElement>('#tiTheme').value) as [string, string, string];
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');
            if (!ctx) return { lines: 0, fontSize: 0 };

            if ($<HTMLInputElement>('#tiGrad').checked) {
              const g = ctx.createLinearGradient(0, 0, W, H);
              // 눈에 맞춰 섞은 중간색을 직접 끼워 넣는다 — 브라우저 기본 섞기는 가운데가 탁하다
              for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, mix(bg, mix(bg, fg, 0.22), i / 6));
              ctx.fillStyle = g;
            } else ctx.fillStyle = bg;
            ctx.fillRect(0, 0, W, H);

            const pad = Math.round(W * 0.09);
            const maxW = W - pad * 2;
            let text = textEl.value || ' ';
            if ($<HTMLInputElement>('#tiQuote').checked) text = '“' + text.trim() + '”';

            // 자동: 다 들어갈 때까지 줄인다. 긴 글이 잘려 나가면 쓸 수 없다.
            const manual = parseInt(scaleEl.value, 10);
            let fontSize = manual > 0 ? manual : Math.round(W * 0.09);
            let lines: string[] = [];
            const sign = $<HTMLInputElement>('#tiSign').value.trim();
            const bottom = sign ? Math.round(W * 0.05) : 0;
            for (let guard = 0; guard < 40; guard++) {
              ctx.font = `700 ${fontSize}px sans-serif`;
              lines = wrap(ctx, text, maxW);
              const need = lines.length * fontSize * 1.45;
              if (manual > 0 || need <= H - pad * 2 - bottom) break;
              fontSize = Math.round(fontSize * 0.92);
              if (fontSize < 12) break;
            }

            ctx.fillStyle = fg;
            ctx.textBaseline = 'middle';
            const lineH = fontSize * 1.45;
            const total = lines.length * lineH;
            let y = (H - bottom) / 2 - total / 2 + lineH / 2;
            for (const ln of lines) {
              const w = ctx.measureText(ln).width;
              ctx.fillText(ln, (W - w) / 2, y);
              y += lineH;
            }

            if (sign) {
              ctx.font = `500 ${Math.round(W * 0.028)}px sans-serif`;
              ctx.globalAlpha = 0.65;
              const w = ctx.measureText(sign).width;
              ctx.fillText(sign, (W - w) / 2, H - pad * 0.7);
              ctx.globalAlpha = 1;
            }
            return { lines: lines.length, fontSize };
          }

          function refresh(): void {
            const manual = parseInt(scaleEl.value, 10);
            $<HTMLElement>('#tiScaleVal').textContent = manual > 0 ? manual + 'px' : t('text2img.scale.auto');
            const { lines, fontSize } = draw();
            stats.innerHTML =
              stat(t('text2img.stat.size'), `${canvas.width}×${canvas.height}`, true) +
              stat(t('text2img.stat.lines'), t('text2img.value.lines', { n: lines })) +
              stat(t('text2img.stat.font'), `${fontSize}px`);
            if (manual > 0 && lines * fontSize * 1.45 > canvas.height * 0.86) {
              say(t('text2img.say.overflow'), 'error');
            } else say(t('text2img.say.ready'), 'ok');
          }

          [textEl, scaleEl, $<HTMLInputElement>('#tiSign')].forEach((el) => el.addEventListener('input', refresh));
          ['#tiRatio', '#tiTheme', '#tiGrad', '#tiQuote'].forEach((s) => $<HTMLElement>(s).addEventListener('change', refresh));
          $<HTMLButtonElement>('#tiSave').onclick = () => {
            canvas.toBlob((blob) => {
              if (!blob) {
                say(t('text2img.err.render'), 'error');
                return;
              }
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = t('text2img.file.name') + '.png';
              a.click();
              // 만든 것을 이어서 쓸 수 있게 내놓는다 (TASK-KL-133) — 받을 도구가 없으면 줄이 안 생긴다.
              Toolbox.offerNext?.(status, { blob: blob, name: a.download, from: 'text2img' });
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              say(t('text2img.say.saved', { w: canvas.width, h: canvas.height, size: size(blob.size) }), 'ok');
              Toolbox.trackUse?.('save');
            }, 'image/png');
          };
          refresh();
  }
})();
