/**
 * 그라데이션 만들기 (TASK-KL-088)
 *
 * 배경에 쓸 그라데이션은 눈으로 맞춰야 하는데, 코드를 고쳐 새로 고치기를 반복하게 된다.
 * 여기서는 **바로 보면서** 색과 방향을 잡고 CSS 를 그대로 가져간다.
 *
 * 신경 쓴 곳: 두 색을 그냥 섞으면 가운데가 **탁하게 죽는다**(파랑→노랑이 회색을 지난다).
 * 사람 눈에 맞는 공간에서 섞으면 그 일이 없다 — 그 차이를 나란히 보여 준다.
 */
import { t, loadNamespace } from '../../lib/i18n';

(function (): void {
  const esc = (v: string): string =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /** #rrggbb → [0..1] 세 값. 잘못된 값이 들어와도 검은색으로 떨어지게 한다. */
  function toRgb(hex: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return [0, 0, 0];
    const n = parseInt(m[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const toHex = (rgb: [number, number, number]): string =>
    '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

  // 화면 색은 눈에 보이는 밝기와 비례하지 않는다. 섞기 전에 그 왜곡을 걷어 내야 가운데가 안 죽는다.
  const toLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const toSrgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

  function mix(a: string, b: string, t: number, perceptual: boolean): string {
    const A = toRgb(a);
    const B = toRgb(b);
    if (!perceptual) return toHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
    const la = A.map(toLinear) as [number, number, number];
    const lb = B.map(toLinear) as [number, number, number];
    return toHex([
      toSrgb(la[0] + (lb[0] - la[0]) * t),
      toSrgb(la[1] + (lb[1] - la[1]) * t),
      toSrgb(la[2] + (lb[2] - la[2]) * t)
    ]);
  }

  Toolbox.register({
    id: 'gradient',
    title: t('widgets.gradient.title', undefined, "그라데이션 만들기"),
    category: 'tool',
    desc: t('widgets-desc.gradient.desc', undefined, "배경용 그라데이션을 보면서 만들고 CSS 를 가져갑니다. 가운데가 탁해지지 않게 섞습니다"),
    layout: 'wide',
    icon: '<rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6" fill="none"/><path d="M5 18 19 6" stroke="currentColor" stroke-width="1.2" opacity="0.5"/><circle cx="7" cy="8" r="1.6" fill="currentColor" opacity="0.8"/><circle cx="17" cy="16" r="1.6" fill="currentColor" opacity="0.4"/>',
    tabs: [
      {
        id: 'app',
        label: t('gradient.tab', undefined, "그라데이션"),
        build: function (container: HTMLElement): void {
          void loadNamespace('gradient').then(function () {

          container.innerHTML = `
            <div id="grPreview" style="height:180px; border-radius:10px; border:1px solid rgba(128,128,128,0.25);"></div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <div class="tool-grid-2">
                <div>
                  <div class="tool-sublabel">${esc(t('gradient.label.from'))}</div>
                  <input type="text" id="grFrom" aria-label="${esc(t('gradient.label.from'))}" value="#3b82f6" spellcheck="false">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('gradient.label.to'))}</div>
                  <input type="text" id="grTo" aria-label="${esc(t('gradient.label.to'))}" value="#f59e0b" spellcheck="false">
                </div>
              </div>
              <div class="tool-grid-2" style="margin-top:10px;">
                <div>
                  <div class="tool-sublabel">${esc(t('gradient.label.angle'))} <span id="grAngleVal" class="range-value">135°</span></div>
                  <input type="range" id="grAngle" aria-label="${esc(t('gradient.label.angle'))}" min="0" max="360" step="15" value="135">
                </div>
                <div>
                  <div class="tool-sublabel">${esc(t('gradient.label.kind'))}</div>
                  <select id="grKind" aria-label="${esc(t('gradient.label.kind'))}">
                    <option value="linear">${esc(t('gradient.kind.linear'))}</option>
                    <option value="radial">${esc(t('gradient.kind.radial'))}</option>
                  </select>
                </div>
              </div>
              <div class="tool-chips" style="margin-top:10px;">
                <label class="tool-chip"><input type="checkbox" id="grPerc" checked> ${esc(t('gradient.opt.perceptual'))}</label>
                <label class="tool-chip"><input type="checkbox" id="grSmooth"> ${esc(t('gradient.opt.smooth'))}</label>
              </div>
            </div>

            <div class="tool-sublabel">${esc(t('gradient.label.compare'))}</div>
            <div style="display:grid; gap:4px;">
              <div id="grPlain" style="height:34px; border-radius:6px;"></div>
              <div id="grPerceptual" style="height:34px; border-radius:6px;"></div>
            </div>

            <div class="field-group" style="margin-top:var(--space-lg);">
              <label class="field-label" for="grCss">CSS</label>
              <textarea id="grCss" rows="4" spellcheck="false" style="width:100%;" readonly></textarea>
              <button class="btn btn-ghost btn-sm" id="grCopy" style="margin-top:8px;">${esc(t('gradient.btn.copy'))}</button>
            </div>

            <div class="tool-status" id="grStatus">${esc(t('gradient.status.idle'))}</div>
          `;

          const $ = <T extends HTMLElement>(s: string): T => container.querySelector(s) as T;
          const fromEl = $<HTMLInputElement>('#grFrom');
          const toEl = $<HTMLInputElement>('#grTo');
          const angleEl = $<HTMLInputElement>('#grAngle');
          const status = $<HTMLElement>('#grStatus');

          const say = (m: string, kind = ''): void => {
            status.textContent = m;
            status.className = 'tool-status' + (kind ? ' ' + kind : '');
          };

          /** 중간 색을 여러 개 끼워 넣는다 — 브라우저 기본 섞기의 탁함을 줄이는 흔한 방법이다. */
          function stops(perceptual: boolean, count: number): string[] {
            const a = fromEl.value;
            const b = toEl.value;
            const out: string[] = [];
            for (let i = 0; i <= count; i++) out.push(mix(a, b, i / count, perceptual));
            return out;
          }

          function css(perceptual: boolean): string {
            const kind = $<HTMLSelectElement>('#grKind').value;
            const smooth = $<HTMLInputElement>('#grSmooth').checked;
            const list = stops(perceptual, smooth ? 8 : 1).join(', ');
            return kind === 'radial'
              ? `radial-gradient(circle at 50% 50%, ${list})`
              : `linear-gradient(${angleEl.value}deg, ${list})`;
          }

          function refresh(): void {
            $<HTMLElement>('#grAngleVal').textContent = angleEl.value + '°';
            const perceptual = $<HTMLInputElement>('#grPerc').checked;
            const value = css(perceptual);
            $<HTMLElement>('#grPreview').style.background = value;
            // 비교 줄은 늘 같은 조건(직선·8단계)으로 보여 줘야 차이가 드러난다
            const list = (p: boolean): string => `linear-gradient(90deg, ${stops(p, 8).join(', ')})`;
            $<HTMLElement>('#grPlain').style.background = list(false);
            $<HTMLElement>('#grPerceptual').style.background = list(true);
            $<HTMLTextAreaElement>('#grCss').value = `background: ${value};`;

            const mid = mix(fromEl.value, toEl.value, 0.5, false);
            const midP = mix(fromEl.value, toEl.value, 0.5, true);
            say(
              mid === midP
                ? t('gradient.say.same')
                : t('gradient.say.diff', { mid, midP }),
              'ok'
            );
          }

          [fromEl, toEl, angleEl].forEach((el) => el.addEventListener('input', refresh));
          ['#grKind', '#grPerc', '#grSmooth'].forEach((s) => $<HTMLElement>(s).addEventListener('change', refresh));
          $<HTMLButtonElement>('#grCopy').onclick = () => {
            void Toolbox.copyText?.($<HTMLTextAreaElement>('#grCss').value, { message: t('gradient.copy.done') });
            Toolbox.trackUse?.('copy');
          };
          refresh();
                  });
        }
      }
    ]
  });
})();
